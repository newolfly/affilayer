-- ============================================================================
-- AffiLayer — supabase/migrations/014_fix_write_rpc_auth.sql
--
-- Phase-2 security re-audit (9 Nov 2026) — DO NOT APPLY WITHOUT THE
-- COORDINATED WORKER REDEPLOY DESCRIBED BELOW.
--
-- WHAT WAS FOUND (all re-proven live with the public anon key only):
--   V1 (CRITICAL) — the four write/resolve RPCs that the tracking Worker
--   uses were callable by ANYONE holding the publishable anon key (which
--   ships in the web bundle), with no JWT and no worker proof:
--     tracking_record_click, tracking_record_conversion,
--     tracking_record_ledger_entry, tracking_resolve_affiliate.
--   Live anon probes (9 Nov 2026, all HTTP 200):
--     * record_click for AFF-DLNAWY and for a bogus code AFF-BOGUS-999.
--     * record_conversion with payout $12.01 on a $12.00 offer, and with
--       p_status='approved' (admin approval bypassed at creation).
--     * record_ledger_entry minting a $12.01 pending ledger row for an
--       arbitrary affiliate + conversion.
--   The only remaining gates were admin approval of the conversion and
--   the payout flow — an attacker who also social-engineers (or waits
--   for) a routine admin approval gets paid. The /conversion HMAC
--   protects the Worker HTTP route only; the RPCs themselves trusted
--   any anon-key holder as if it were the Worker.
--   V1b — log_audit was anon-callable (forged audit row created live,
--   attributed to another affiliate; cleaned up). np_check_proof was
--   anon-callable despite the REVOKE FROM PUBLIC in 012/013: Supabase
--   grants EXECUTE per-role (anon/authenticated), and REVOKE FROM PUBLIC
--   does not remove those.
--   V3 (HIGH) — payout_requests could be INSERTed by an affiliate with
--   status='approved' or status='paid' (201 live) and amount 0 (201
--   live). The status CHECK allows all four states and nothing forces
--   new rows to start 'pending'. A self-approved request passes the
--   Worker payout executor's status='approved' check, so once the
--   NOWPayments executor goes live this is a real payout without admin
--   review. offers.landing_url had no scheme check: a javascript:
--   URL was INSERTed live (201) and the Worker served it as a 302
--   Location (browsers block javascript: redirects, so impact is
--   limited to non-browser followers — still a stored hole).
--
-- FIX (this migration):
--   * The four write/resolve RPCs take a new trailing p_proof param
--     (default NULL) and require a valid worker proof for their own
--     function name, OR an admin JWT. Anonymous and non-admin callers
--     get insufficient_privilege (401/403 via PostgREST), exactly like
--     012/013. tracking_record_conversion additionally FORCES status
--     'pending' (caller-supplied p_status is ignored).
--   * log_audit takes p_proof (default NULL) and requires a valid
--     proof for subject 'log_audit' OR a signed-in caller. Internal
--     SECURITY DEFINER callers (approve_*, 010 np_* when applied) run
--     with the caller's JWT, so they pass; no-JWT 010 paths must pass
--     a proof (np_* functions already mint proofs via np.proof()).
--   * np_check_proof: REVOKE EXECUTE explicitly FROM anon AND
--     authenticated (the 012/013 REVOKE FROM PUBLIC did not remove the
--     per-role grants — verified live in proacl).
--   * payout_requests: BEFORE INSERT trigger forces NEW.status :=
--     'pending'; CHECK (amount > 0) so zero-amount requests are
--     rejected at the DB (existing live rows are all >= 0.01, so the
--     CHECK applies cleanly).
--   * offers: CHECK (landing_url ~ '^https?://') so javascript:/data:
--     URLs can never be stored (existing live offer is https).
--
-- COORDINATED DEPLOY (read before applying):
--   The Worker MUST be redeployed with proof-passing record calls in
--   the same window, otherwise live clicks/conversions break:
--     1. Update services/tracking-worker/src/supabase-store.ts:
--        extend workerProofFor() subjects with
--        'tracking_record_click' | 'tracking_record_conversion' |
--        'tracking_record_ledger_entry' | 'tracking_resolve_affiliate'
--        and pass p_proof in recordClick / recordConversion /
--        recordLedgerEntry (incl. its resolve_affiliate call).
--     2. Apply this migration.
--     3. Redeploy the Worker (version be004f1d lineage) immediately.
--   Between (2) and (3) the Worker record calls fail closed
--   (insufficient_privilege). Clicks fail OPEN (302 still served,
--   click not recorded); conversions fail with 500 and the conversion
--   row is NOT created (recordConversion is the first failing call in
--   the new Worker... in the OLD Worker the first failing call is the
--   same RPC, so no partial rows). Keep the window to minutes.
--   The Fastify service (services/tracking) needs the same proof
--   params in pg-store.ts if it is ever pointed at Supabase RPCs;
--   its direct-pg path is unaffected.
--
-- OUT OF SCOPE HERE (separate code change, see audit report):
--   * Worker handleConversion ledger-id bug (index.ts:261,266):
--     `await store.recordConversion(conversion)` discards the DB uuid
--     and the ledger entry is built with the pre-DB randomUUID, so
--     every real conversion 500s (FK 23503) and lands ledger-less.
--     Fix: `const recorded = await store.recordConversion(conversion)`
--     and use recorded.id for the ledger entry. Same bug in
--     services/tracking/src/routes.ts:193,198 (latent there: pg-store
--     preserves the id, SupabaseStore does not).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- worker_secrets / np_check_proof (idempotent, same body as 010/012/013).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_secrets (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.worker_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.worker_secrets (key, value)
VALUES ('np_ipn_proof', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.np_check_proof(
  p_subject text,
  p_proof text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
  v_expected text;
BEGIN
  SELECT value INTO v_secret FROM public.worker_secrets WHERE key = 'np_ipn_proof';
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;
  v_expected := encode(extensions.hmac(p_subject, v_secret, 'sha256'), 'hex');
  RETURN v_expected = lower(COALESCE(p_proof, ''));
END;
$$;
-- REVOKE FROM PUBLIC did NOT remove the per-role grants (Supabase grants
-- EXECUTE to anon/authenticated explicitly). Revoke from both roles.
REVOKE EXECUTE ON FUNCTION public.np_check_proof(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.np_check_proof(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.np_check_proof(text, text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- log_audit — now requires worker proof OR a signed-in caller.
-- Old 5-arg overload dropped (new p_proof param = new signature).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.log_audit(uuid, text, text, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.log_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_proof text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_is_worker boolean;
BEGIN
  v_is_worker := public.np_check_proof('log_audit', p_proof);
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'log_audit: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_resolve_affiliate — proof or admin JWT only.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_resolve_affiliate(text);
CREATE OR REPLACE FUNCTION public.tracking_resolve_affiliate(
  p_affiliate_code text,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT public.np_check_proof('tracking_resolve_affiliate', p_proof)
     AND NOT public.is_admin() THEN
    -- Non-admin JWT callers may resolve ONLY their own code; anon gets nothing.
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'tracking_resolve_affiliate: sign-in or worker proof required'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT jsonb_build_object('profile_id', ap.profile_id) INTO v_row
    FROM public.affiliate_profiles ap
   WHERE ap.affiliate_code = p_affiliate_code
     AND (public.np_check_proof('tracking_resolve_affiliate', p_proof)
       OR public.is_admin()
       OR ap.profile_id = auth.uid());
  RETURN v_row; -- null when unknown or not own (affiliate path)
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_record_click — proof or admin JWT only. (Worker passes proof.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_record_click(text, text, uuid, inet, text, text, character, text, text, text, text, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.tracking_record_click(
  p_click_id text,
  p_affiliate_code text,
  p_offer_id uuid,
  p_ip inet,
  p_user_agent text,
  p_referrer text,
  p_country character,
  p_device text,
  p_source text,
  p_sub1 text,
  p_sub2 text,
  p_sub3 text,
  p_sub4 text,
  p_sub5 text,
  p_is_smartlink boolean,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_affiliate_id uuid;
  v_offer_status text;
  v_id uuid;
  v_existing jsonb;
BEGIN
  IF NOT public.np_check_proof('tracking_record_click', p_proof)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tracking_record_click: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_click_id IS NULL OR btrim(p_click_id) = '' THEN
    RAISE EXCEPTION 'tracking_record_click: click_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_affiliate_code IS NULL OR btrim(p_affiliate_code) = '' THEN
    RAISE EXCEPTION 'tracking_record_click: affiliate_code is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT to_jsonb(c) INTO v_existing
    FROM (SELECT id, click_id FROM public.clicks WHERE click_id = p_click_id) c;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  SELECT profile_id INTO v_affiliate_id
    FROM public.affiliate_profiles
    WHERE affiliate_code = p_affiliate_code;
  -- Unknown codes are rejected (previously they silently inserted a
  -- NULL-affiliate click). The ONE exception is the Worker's SmartLink
  -- sentinel affiliate_code 'smartlink' (index.ts: SmartLink clicks
  -- carry no affiliate; they record with affiliate_id NULL by design).
  IF v_affiliate_id IS NULL AND p_affiliate_code <> 'smartlink' THEN
    RAISE EXCEPTION 'tracking_record_click: unknown affiliate_code %', p_affiliate_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_offer_id IS NOT NULL THEN
    SELECT status INTO v_offer_status
      FROM public.offers
      WHERE id = p_offer_id;
    IF v_offer_status IS NULL THEN
      RAISE EXCEPTION 'tracking_record_click: unknown offer %', p_offer_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_offer_status <> 'active' THEN
      RAISE EXCEPTION 'tracking_record_click: offer % is % (not active)', p_offer_id, v_offer_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.clicks (
    click_id, affiliate_code, affiliate_id, offer_id, ip, user_agent,
    referrer, country, device, source,
    sub1, sub2, sub3, sub4, sub5, is_smartlink
  ) VALUES (
    p_click_id, p_affiliate_code, v_affiliate_id, p_offer_id, p_ip, p_user_agent,
    p_referrer, p_country, p_device, p_source,
    p_sub1, p_sub2, p_sub3, p_sub4, p_sub5, COALESCE(p_is_smartlink, false)
  )
  ON CONFLICT (click_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT to_jsonb(c) INTO v_existing
      FROM (SELECT id, click_id FROM public.clicks WHERE click_id = p_click_id) c;
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'click_id', p_click_id, 'duplicate', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_record_conversion — proof or admin JWT only; status is ALWAYS
-- forced to 'pending' (caller-supplied p_status is ignored) so a
-- conversion can never be created pre-approved.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_record_conversion(text, text, uuid, text, numeric, character, text, text, text);
CREATE OR REPLACE FUNCTION public.tracking_record_conversion(
  p_conversion_id text,
  p_click_id text,
  p_offer_id uuid,
  p_affiliate_code text,
  p_payout numeric,
  p_currency character,
  p_status text,
  p_idempotency_key text,
  p_sub1 text,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_affiliate_id uuid;
  v_offer_status text;
  v_click_offer_id uuid;
  v_click_affiliate_id uuid;
  v_id uuid;
  v_existing jsonb;
BEGIN
  IF NOT public.np_check_proof('tracking_record_conversion', p_proof)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tracking_record_conversion: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Approval bypass closed: conversions are always born pending,
  -- whatever the caller asked for.
  p_status := 'pending';

  IF p_conversion_id IS NULL OR btrim(p_conversion_id) = '' THEN
    RAISE EXCEPTION 'tracking_record_conversion: conversion_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'tracking_record_conversion: idempotency_key is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_offer_id IS NULL THEN
    RAISE EXCEPTION 'tracking_record_conversion: offer_id is required (real UUID offer only)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_currency IS NULL OR NOT (p_currency = ANY (ARRAY[
      'USD','EUR','GBP','CAD','AUD','JPY','CHF','NZD','SGD','HKD','INR',
      'BRL','MXN','ZAR','PLN','SEK','NOK','DKK','CZK','HUF','ILS','KRW',
      'TWD','THB','MYR','IDR','PHP','VND','TRY','AED','SAR'
    ])) THEN
    RAISE EXCEPTION 'tracking_record_conversion: unsupported currency %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_payout IS NULL OR p_payout < 0 OR p_payout > 10000 THEN
    RAISE EXCEPTION 'tracking_record_conversion: payout % out of range 0..10000', p_payout
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT to_jsonb(c) INTO v_existing
    FROM (
      SELECT id, conversion_id, click_id, offer_id, status
        FROM public.conversions WHERE idempotency_key = p_idempotency_key
    ) c;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  SELECT status INTO v_offer_status
    FROM public.offers
    WHERE id = p_offer_id;
  IF v_offer_status IS NULL THEN
    RAISE EXCEPTION 'tracking_record_conversion: unknown offer %', p_offer_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_offer_status <> 'active' THEN
    RAISE EXCEPTION 'tracking_record_conversion: offer % is % (not active)', p_offer_id, v_offer_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_click_id IS NOT NULL THEN
    SELECT offer_id, affiliate_id INTO v_click_offer_id, v_click_affiliate_id
      FROM public.clicks
      WHERE click_id = p_click_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'tracking_record_conversion: unknown click_id %', p_click_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_click_offer_id IS NOT NULL AND v_click_offer_id <> p_offer_id THEN
      RAISE EXCEPTION 'tracking_record_conversion: click % belongs to a different offer', p_click_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_affiliate_id := v_click_affiliate_id;
  IF v_affiliate_id IS NULL AND p_affiliate_code IS NOT NULL THEN
    SELECT profile_id INTO v_affiliate_id
      FROM public.affiliate_profiles
      WHERE affiliate_code = p_affiliate_code;
  END IF;
  IF v_affiliate_id IS NULL THEN
    RAISE EXCEPTION 'tracking_record_conversion: cannot resolve affiliate for code %', p_affiliate_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.conversions (
    conversion_id, click_id, offer_id, affiliate_id, payout, currency,
    status, idempotency_key, sub1
  ) VALUES (
    p_conversion_id, p_click_id, p_offer_id, v_affiliate_id, p_payout, p_currency,
    p_status, p_idempotency_key, p_sub1
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT to_jsonb(c) INTO v_existing
      FROM (
        SELECT id, conversion_id, click_id, offer_id, status
          FROM public.conversions WHERE idempotency_key = p_idempotency_key
      ) c;
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'conversion_id', p_conversion_id,
    'duplicate', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_record_ledger_entry — proof or admin JWT only.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_record_ledger_entry(uuid, uuid, uuid, numeric, character);
CREATE OR REPLACE FUNCTION public.tracking_record_ledger_entry(
  p_conversion_id uuid,
  p_affiliate_id uuid,
  p_offer_id uuid,
  p_amount numeric,
  p_currency character,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_existing jsonb;
BEGIN
  IF NOT public.np_check_proof('tracking_record_ledger_entry', p_proof)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'tracking_record_ledger_entry: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_conversion_id IS NULL THEN
    RAISE EXCEPTION 'tracking_record_ledger_entry: conversion_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_affiliate_id IS NULL THEN
    RAISE EXCEPTION 'tracking_record_ledger_entry: affiliate_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'tracking_record_ledger_entry: amount % out of range 0..10000', p_amount
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_currency IS NULL OR NOT (p_currency = ANY (ARRAY[
      'USD','EUR','GBP','CAD','AUD','JPY','CHF','NZD','SGD','HKD','INR',
      'BRL','MXN','ZAR','PLN','SEK','NOK','DKK','CZK','HUF','ILS','KRW',
      'TWD','THB','MYR','IDR','PHP','VND','TRY','AED','SAR'
    ])) THEN
    RAISE EXCEPTION 'tracking_record_ledger_entry: unsupported currency %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT to_jsonb(l) INTO v_existing
    FROM (SELECT id, conversion_id FROM public.commission_ledger WHERE conversion_id = p_conversion_id) l;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  INSERT INTO public.commission_ledger (
    conversion_id, affiliate_id, offer_id, amount, currency, status
  ) VALUES (
    p_conversion_id, p_affiliate_id, p_offer_id, p_amount, p_currency, 'pending'
  )
  ON CONFLICT (conversion_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT to_jsonb(l) INTO v_existing
      FROM (SELECT id, conversion_id FROM public.commission_ledger WHERE conversion_id = p_conversion_id) l;
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'conversion_id', p_conversion_id, 'duplicate', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- payout_requests: new rows always start 'pending'; amount must be > 0.
-- (Trigger, not a CHECK on status: existing rows legitimately hold
-- approved/rejected/paid.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payout_requests_force_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_payout_requests_force_pending ON public.payout_requests;
CREATE TRIGGER trg_payout_requests_force_pending
  BEFORE INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.payout_requests_force_pending();

ALTER TABLE public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_amount_positive;
ALTER TABLE public.payout_requests
  ADD CONSTRAINT payout_requests_amount_positive CHECK (amount > 0);

-- ---------------------------------------------------------------------------
-- offers: landing_url must be http(s) — javascript:/data: can never be stored.
-- ---------------------------------------------------------------------------
ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_landing_url_scheme_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_landing_url_scheme_check
  CHECK (landing_url ~ '^https?://');
