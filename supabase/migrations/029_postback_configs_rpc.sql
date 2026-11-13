-- 029: durable outbound postbacks (audit v4, W4-05 / v3 M-08).
--
-- Until now SupabaseStore.getPostbackConfigs delegated to a per-isolate
-- in-memory store: in production the config list was always empty, no
-- route could add a config, and deliverPostbacks() iterated zero rows —
-- outbound affiliate postbacks could never fire even though the
-- postback_configs / postback_events tables (001) exist.
--
-- These two RPCs follow the established 012–014 pattern: SECURITY
-- DEFINER, pinned search_path, access gated by the Worker proof
-- (np_check_proof over the function name, from worker_secrets) or an
-- admin JWT. Configs are managed by writing postback_configs rows
-- (dashboard SQL / future admin UI); the Worker now READS them from
-- the DB on every conversion, so a config inserted once fires for
-- every isolate.
--
-- Scope notes:
-- * The configs.events[] column is intentionally not filtered on —
--   parity with the previous in-memory behaviour, which fired configs
--   on every recorded conversion.
-- * tracking_record_postback_event resolves the conversion by either
--   id form (DB PK or public conversion_id) and stores NULL when the
--   reference cannot be resolved or the config id is not a real
--   postback_configs row, so event logging can never break delivery.

CREATE OR REPLACE FUNCTION public.tracking_get_postback_configs(
  p_affiliate_id uuid,
  p_proof text DEFAULT NULL::text
)
RETURNS SETOF public.postback_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF NOT public.np_check_proof('tracking_get_postback_configs', p_proof)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tracking_get_postback_configs: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_affiliate_id IS NOT NULL THEN
    SELECT organization_id INTO v_org
      FROM public.affiliate_profiles
     WHERE profile_id = p_affiliate_id;
  END IF;

  RETURN QUERY
    SELECT c.*
      FROM public.postback_configs c
     WHERE c.is_active
       AND (
         (p_affiliate_id IS NOT NULL AND c.affiliate_id = p_affiliate_id)
         OR (v_org IS NOT NULL AND c.organization_id = v_org)
         OR (c.affiliate_id IS NULL AND c.organization_id IS NULL)
       );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tracking_record_postback_event(
  p_conversion_ref text,
  p_postback_config_id uuid,
  p_url text,
  p_payload jsonb,
  p_status text,
  p_attempts integer,
  p_response_status integer,
  p_proof text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversion_id uuid;
  v_config_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.np_check_proof('tracking_record_postback_event', p_proof)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tracking_record_postback_event: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('pending', 'delivered', 'failed') THEN
    RAISE EXCEPTION 'tracking_record_postback_event: invalid status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_conversion_ref IS NOT NULL AND btrim(p_conversion_ref) <> '' THEN
    SELECT id INTO v_conversion_id
      FROM public.conversions
     WHERE id::text = p_conversion_ref OR conversion_id = p_conversion_ref
     LIMIT 1;
  END IF;

  IF p_postback_config_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.postback_configs WHERE id = p_postback_config_id) THEN
    v_config_id := p_postback_config_id;
  END IF;

  INSERT INTO public.postback_events (
    id, conversion_id, postback_config_id, url, payload, status,
    attempts, max_attempts, response_status, last_attempt_at
  ) VALUES (
    gen_random_uuid(), v_conversion_id, v_config_id, COALESCE(p_url, ''), p_payload, p_status,
    GREATEST(COALESCE(p_attempts, 0), 0), 4, p_response_status, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
