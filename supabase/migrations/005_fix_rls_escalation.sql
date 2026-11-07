-- ============================================================================
-- AffiLayer — supabase/migrations/005_fix_rls_escalation.sql
--
-- Fixes the two Critical/High findings from the 7 Nov 2026 production audit.
-- Migrations 001-004 were NEVER applied to a live database, so this file
-- runs after them in order (001 -> 005) on the first real project.
--
-- C-1 (CRITICAL) — RLS privilege escalation on public.profiles.
--   002_rls.sql let any authenticated user INSERT a profile row with
--   role='super_admin' (profiles_insert_own only checked id = auth.uid())
--   and UPDATE their own row to role='super_admin' (the UPDATE policy's
--   WITH CHECK calls is_admin(), which reads the row AFTER the proposed
--   update, so a self-escalating user passed their own check).
--   Fix, defense in depth (all three, any one alone would close the hole):
--     (a) BEFORE INSERT OR UPDATE trigger profiles_enforce_role_status():
--         non-privileged actors get role/status/kyc_status forced to the
--         safe defaults. Privileged actors are: service_role / postgres
--         (backend + SQL editor + seed) and an EXISTING admin — judged by
--         the actor's STORED role, read inside this BEFORE trigger, where
--         the row being modified has NOT been written yet, so a
--         self-escalating user still reads as 'affiliate'.
--         NOTE: the trigger function is deliberately SECURITY INVOKER
--         (the default): under SECURITY DEFINER, current_user would always
--         be the function owner and auth checks would be meaningless.
--     (b) profiles_insert_own policy tightened to require the safe
--         defaults in WITH CHECK.
--     (c) handle_new_user() trigger on auth.users: every signup gets a
--         profile row with fixed defaults (role='affiliate',
--         status='pending'). The app never INSERTs into profiles directly.
--   Live proof required after applying: the negative checks 17-18 in
--   supabase/tests/rls-checks.sql, run as a real affiliate JWT.
--
-- H-2 (HIGH) — public.affiliate_balances view ran with owner privileges
--   (security definer by default), so RLS on the underlying tables did not
--   apply and any signed-in user could read every affiliate's balances.
--   Fix: recreate the view WITH (security_invoker = true). The query is
--   byte-identical to 003_functions.sql; CREATE OR REPLACE preserves the
--   existing GRANTs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C-1 (a): trigger function + trigger on profiles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_enforce_role_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose (see header note).
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Privileged callers may set any values: the service key, and the
  -- Supabase SQL editor / direct postgres connections (seed, bootstrap).
  IF auth.role() IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  -- An EXISTING admin (stored role, read here before the row is written)
  -- may change role / status / kyc_status — this is how approvals happen.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'network_manager')
  ) THEN
    RETURN NEW;
  END IF;

  -- Everyone else: privileged fields are forced to safe defaults.
  -- Ordinary profile edits (full_name, organization_id, ...) pass through.
  NEW.role := 'affiliate';
  NEW.status := 'pending';
  NEW.kyc_status := 'not_started';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_role_status ON public.profiles;
CREATE TRIGGER profiles_enforce_role_status
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_enforce_role_status();

-- ---------------------------------------------------------------------------
-- C-1 (c): automatic profile creation on signup, with fixed defaults.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, kyc_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    'affiliate',
    'pending',
    'not_started'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- C-1 (b): tighten the INSERT policy to require the safe defaults.
--   (Service role and the SQL editor bypass RLS, so the seed and the
--   bootstrap promotion of the first super_admin are unaffected.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND role = 'affiliate'
    AND status = 'pending'
    AND kyc_status = 'not_started'
  );

-- ---------------------------------------------------------------------------
-- H-2: affiliate_balances runs as the querying user (RLS applies).
--   Query identical to 003_functions.sql; OR REPLACE keeps the GRANTs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.affiliate_balances
WITH (security_invoker = true) AS
WITH ledger_totals AS (
  SELECT
    affiliate_id,
    COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)  AS pending,
    COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS approved,
    COALESCE(SUM(amount) FILTER (WHERE status = 'payable'), 0)  AS payable,
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)     AS paid
  FROM public.commission_ledger
  GROUP BY affiliate_id
),
payout_totals AS (
  SELECT
    affiliate_id,
    COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS paid_via_payouts
  FROM public.payout_transactions
  GROUP BY affiliate_id
)
SELECT
  COALESCE(l.affiliate_id, p.affiliate_id) AS affiliate_id,
  COALESCE(l.pending, 0)  AS pending,
  COALESCE(l.approved, 0) AS approved,
  COALESCE(l.payable, 0)  AS payable,
  COALESCE(l.paid, 0)     AS paid,
  COALESCE(p.paid_via_payouts, 0) AS paid_via_payouts
FROM ledger_totals l
FULL OUTER JOIN payout_totals p ON p.affiliate_id = l.affiliate_id;
