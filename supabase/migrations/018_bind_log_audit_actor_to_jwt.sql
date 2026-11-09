-- ============================================================================
-- AffiLayer — supabase/migrations/018_bind_log_audit_actor_to_jwt.sql
--
-- M-02 (forensic audit 9 Nov 2026) — log_audit forgery.
--   log_audit() accepted a caller-supplied p_actor_id and recorded it
--   verbatim: any signed-in user could write audit entries attributed to
--   anyone (e.g. an affiliate logging 'payout.approved' as the
--   super_admin). Migration 014 widened the gate (admin-only in 003) to
--   any-JWT, which is how the forgery became reachable.
--   Fix, at the RPC guard (the single enforcement point every audit entry
--   flows through): the claimed actor must match the caller resolved
--   from the JWT. A JWT caller whose p_actor_id differs from auth.uid()
--   is rejected (insufficient_privilege). Worker-proof calls (no JWT —
--   e.g. the 010 proof-gated paths that log with a NULL actor) keep the
--   supplied value; anonymous calls without proof still raise, as before.
--   The web app's only direct caller (decideProfile, admin flow) passes
--   the signed-in admin's own id, and the payout/conversion RPCs pass
--   their caller's id through, so no app change is needed. The Worker
--   needs no change either: its authenticated endpoints already resolve
--   the caller from the JWT (requireUser verifies via Auth /auth/v1/user)
--   and pass auth.user.id as p_advertiser_id / p_actor.
--   Live proof required after applying: log_audit with a forged actor
--   (JWT caller, p_actor_id != auth.uid()) -> 401; with the caller's own
--   id -> row recorded with that id.
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
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'log_audit: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- M-02 (018): bind the claimed actor to the JWT. A signed-in caller may
  -- only write audit entries as themselves; the actor is resolved from
  -- the verified JWT (auth.uid()), never trusted from the request.
  IF NOT v_is_worker AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'log_audit: p_actor_id does not match the signed-in user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
