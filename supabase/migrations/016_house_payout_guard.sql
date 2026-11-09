-- ============================================================================
-- AffiLayer — supabase/migrations/016_house_payout_guard.sql
--
-- R26 (9 Nov 2026): bare SmartLink conversions attribute to the network's
-- own house affiliate (affiliate_code 'AFF-HOUSE', created by direct SQL
-- alongside this migration — see the R26 report). Its commissions are
-- NEVER paid out. Three layers enforce that:
--
--   1. Structural: the house profile's auth.users row is banned until
--      2999 with a random bcrypt password nobody holds and an unconfirmed
--      email, so no JWT can ever have sub = the house profile id — the
--      payout_requests INSERT policy (affiliate_id = auth.uid()) can
--      never be satisfied for it.
--   2. This trigger (this file): any INSERT into payout_requests for the
--      house affiliate is rejected at the DB, whatever role or path
--      attempts it. It fires for REST inserts, RPCs, and direct SQL —
--      only a DB superuser disabling the trigger could bypass it.
--   3. Worker: handleExecutePayout in services/tracking-worker/src/index.ts
--      returns 403 for AFF-HOUSE even if a request row somehow exists
--      (and the house profile carries no payout wallet, so the executor
--      would 422 on the missing address anyway).
--
-- Coexists with migration 014's trg_payout_requests_force_pending (which
-- forces NEW.status := 'pending'): both are BEFORE INSERT triggers; they
-- do not conflict. A house payout request therefore cannot exist, so
-- approve/complete RPCs and the admin payout screen (which lists
-- payout_requests) can never present one as payable.
--
-- APPLY: via direct Postgres (not CLI-tracked), same as 011/012/013.
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payout_requests_reject_house()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT affiliate_code INTO v_code
    FROM public.affiliate_profiles
    WHERE profile_id = NEW.affiliate_id;
  IF v_code = 'AFF-HOUSE' THEN
    RAISE EXCEPTION 'payout_requests: the house affiliate AFF-HOUSE can never request a payout'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payout_requests_reject_house ON public.payout_requests;
CREATE TRIGGER trg_payout_requests_reject_house
  BEFORE INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.payout_requests_reject_house();
