-- ============================================================================
-- AffiLayer — supabase/migrations/017_block_org_self_assignment.sql
--
-- H-01 (forensic audit 9 Nov 2026) — tenant isolation bypass.
--   profiles.organization_id was client-writable: the UPDATE policy
--   profiles_update_own_or_admin admits own-row UPDATEs with no column
--   restriction, and profiles_enforce_role_status() forced only
--   role/status/kyc_status (005 even documents "organization_id ...
--   pass through"). is_org_member() trusts profiles.organization_id, so
--   any affiliate could self-assign to any organization (UUIDs are
--   discoverable via the active-offers catalogue) and then pass the org
--   SELECT/UPDATE/DELETE policies for that org's offers, campaigns,
--   clicks, conversions, ledger, postback_configs, and the org row.
--   Fix, at the trigger layer (the repo's established C-1 pattern):
--     (a) UPDATE: a non-admin changing organization_id is REJECTED
--         (raises insufficient_privilege; the row is unchanged).
--         Raising — not silent forcing — so the client gets an explicit
--         error and the attempt is visible.
--     (b) INSERT: a non-admin's organization_id is forced to NULL
--         (consistent with how this trigger already forces role/status/
--         kyc_status to safe defaults on insert; the app never inserts
--         profiles directly — handle_new_user() sets no org).
--   Privileged actors (service_role/postgres, existing super_admin /
--   network_manager) are unaffected — org assignment stays an admin
--   operation, same as role/status approval.
--   Defense in depth: the same guard is applied to
--   affiliate_profiles.organization_id (same column, same UPDATE policy
--   shape; currently unused by any access-control function — locked
--   before anything ever reads it).
--   Live proof required after applying: scripts/test-org-isolation.py
--   (negative JWT tests + positive admin control).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.profiles_enforce_role_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose (see 005 header note).
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Privileged callers may set any values: the service key, and the
  -- Supabase SQL editor / direct postgres connections (seed, bootstrap).
  IF current_user = 'postgres' OR auth.role() IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  -- An EXISTING admin (stored role, read here before the row is written)
  -- may change role / status / kyc_status / organization_id — this is how
  -- approvals and org assignment happen.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'network_manager')
  ) THEN
    RETURN NEW;
  END IF;

  -- H-01 (017): organization membership is admin-only.
  IF TG_OP = 'UPDATE' AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'profiles: organization_id can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.organization_id := NULL;
  END IF;

  -- Everyone else: privileged fields are forced to safe defaults.
  -- Ordinary profile edits (full_name, ...) pass through.
  NEW.role := 'affiliate';
  NEW.status := 'pending';
  NEW.kyc_status := 'not_started';
  RETURN NEW;
END;
$$;
-- The trigger profiles_enforce_role_status (BEFORE INSERT OR UPDATE,
-- created in 005) already calls this function; CREATE OR REPLACE updates
-- it in place, so no DROP/CREATE of the trigger is needed.

-- ---------------------------------------------------------------------------
-- affiliate_profiles.organization_id — same guard, same pattern.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.affiliate_profiles_enforce_organization_id()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose (same reasoning as above: the admin check
-- reads the actor's STORED role).
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'postgres' OR auth.role() IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'network_manager')
  ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'affiliate_profiles: organization_id can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.organization_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS affiliate_profiles_enforce_organization_id ON public.affiliate_profiles;
CREATE TRIGGER affiliate_profiles_enforce_organization_id
  BEFORE INSERT OR UPDATE ON public.affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_profiles_enforce_organization_id();
