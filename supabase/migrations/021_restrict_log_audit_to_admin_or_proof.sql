-- ============================================================================
-- AffiLayer — supabase/migrations/021_restrict_log_audit_to_admin_or_proof.sql
--
-- P0-2 / M-02 (forensic audit 9 Nov 2026) — log_audit forgery, second half.
--   Migration 018 bound p_actor_id to auth.uid() for JWT callers, but any
--   signed-in user could still write audit entries as themselves — the
--   audit trail is not non-repudiable while affiliates can append to it
--   (e.g. an affiliate logging 'conversion.approved' as themselves).
--   Fix: gate log_audit to is_admin() OR worker-proof, keeping the 018
--   actor binding for JWT callers.
--     * Worker-proof call (no JWT; 010 proof paths log with a NULL
--       actor) — unchanged, still works.
--     * Admin JWT, p_actor_id = auth.uid() — works (decideProfile admin
--       flow; approve/reject/complete payout + approve/reject
--       conversion RPCs, which log with their admin caller's id).
--     * Any non-admin JWT (affiliate, advertiser), own actor or not —
--       insufficient_privilege (401 via PostgREST).
--     * Anonymous without proof — unchanged, insufficient_privilege.
--   Callers checked (9 Nov 2026):
--     * apps/web/src/lib/data.ts decideProfile — admin, own id: OK.
--     * approve/reject/complete payout + approve/reject conversion
--       RPCs (SECURITY DEFINER, admin JWT, own id): OK.
--     * apps/web/src/lib/data.ts createOffer best-effort 'offer.create'
--       audit — called by APPROVED ADVERTISERS (role 'advertiser') as
--       well as admins, with their own id. Under this gate the
--       advertiser call now 401s. That call is best-effort and its
--       error is ignored, so offer creation is unaffected — only the
--       'offer.create' audit row is lost for non-admin creators. If
--       advertiser audit logging is wanted, it needs a server-side path
--       (follow-up, not done here — the audit spec P0-2 is admin-only).
--   Test impact: scripts/test-org-isolation.py case (vi) second half
--   ("log_audit own actor accepted") expects an affiliate's own-actor
--   call to succeed — that expectation is now INTENTIONALLY OBSOLETE
--   under this gate (affiliate own-actor -> 401 by design). The
--   coordinator must update that test expectation when re-running it;
--   the forged-actor half still passes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_audit(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb DEFAULT '{}'::jsonb, p_proof text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_is_worker boolean;
BEGIN
  v_is_worker := public.np_check_proof('log_audit', p_proof);
  -- P0-2 (021): the audit trail is admin-or-proof only. A signed-in
  -- non-admin can no longer append entries even as themselves (018
  -- stopped forgery of OTHER actors; this stops self-appended noise
  -- and fake admin-adjacent actions from ever entering the trail).
  IF NOT v_is_worker THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'log_audit: sign-in or worker proof required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'log_audit: only admins may write audit entries'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 018 actor binding, kept: an admin may only log as themselves.
    IF p_actor_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'log_audit: p_actor_id does not match the signed-in user'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
