-- ============================================================================
-- AffiLayer — supabase/migrations/024_fix_profile_trigger_status_reset.sql
--
-- Phase 1 item 1.2 — M-07 (forensic audit 9 Nov 2026): the profile-trigger
-- status reset.
--
--   profiles_enforce_role_status() (005, extended by 017) unconditionally
--   forced NEW.role := 'affiliate', NEW.status := 'pending',
--   NEW.kyc_status := 'not_started' on EVERY non-admin INSERT *and*
--   UPDATE. An approved affiliate editing their own full_name was
--   silently demoted to pending/not_started, and an admin approval was
--   undone by any subsequent self-edit. The audit's P1-9 remediation:
--   make the trigger escalation-only on UPDATE — force privileged
--   columns only when the caller actually changed them.
--
-- Fix (this migration, trigger layer only — no policy or app change):
--   * UPDATE: a non-admin caller may NOT change role / status /
--     kyc_status — any attempted change is forced back to the row's
--     existing (OLD) values, silently, the same way INSERT already
--     forces values rather than raising. Ordinary edits (full_name,
--     ...) pass through, and the approved status / verified KYC of an
--     existing affiliate now survives their own edit. Silent clamp
--     (not RAISE) is deliberate: the app's profile form may echo the
--     full row back, and a raise would break a legitimate edit that
--     merely re-sends unchanged values; the clamp neutralises the
--     escalation either way, and organization_id keeps its stricter
--     RAISE behaviour from 017 (an org change is never part of a
--     legitimate self-edit, and the explicit error is the visible
--     signal there).
--   * INSERT: unchanged — new signups still start affiliate /
--     pending / not_started with organization_id forced NULL.
--   * Preserved verbatim: the privileged-caller early return
--     (postgres / service_role), the existing-admin early return
--     (stored role super_admin / network_manager — this is still how
--     approvals and org assignment happen), and the 017 org guard
--     (RAISE on UPDATE change, force NULL on INSERT).
--
-- Live proof required after applying: an approved affiliate updates
-- their own full_name -> status stays 'approved', kyc unchanged; the
-- same affiliate attempting status='pending' or role='super_admin'
-- on themselves sees the values forced back to OLD; an admin can
-- still change status (definition-level + throwaway-admin live
-- check, never the real super_admin); scripts/test-org-isolation.py
-- stays all-PASS.
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

  -- M-07 (024): escalation-only on UPDATE. A non-admin may not change
  -- the privileged columns, but an edit that leaves them alone must
  -- not reset them either — force NEW back to the row's existing
  -- values instead of to the signup defaults.
  IF TG_OP = 'UPDATE' THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.kyc_status := OLD.kyc_status;
    RETURN NEW;
  END IF;

  -- INSERT only from here: new signups start at the safe defaults.
  NEW.role := 'affiliate';
  NEW.status := 'pending';
  NEW.kyc_status := 'not_started';
  RETURN NEW;
END;
$$;
-- The trigger profiles_enforce_role_status (BEFORE INSERT OR UPDATE,
-- created in 005) already calls this function; CREATE OR REPLACE updates
-- it in place, so no DROP/CREATE of the trigger is needed.
