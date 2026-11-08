-- ============================================================================
-- AffiLayer — supabase/migrations/013_fix_single_row_rpc_auth.sql
--
-- Fixes the residual single-row RPC exposure (found by the full audit,
-- 9 Nov 2026): tracking_get_click and tracking_find_conversion were
-- callable with the publishable anon key — anyone holding the key (it
-- ships in the web bundle) plus a click/conversion id could pull the
-- FULL row: visitor IP, user agent, affiliate identity, payout amount
-- and status. Click ids leak routinely (appended as ?click_id=... to
-- landing URLs), so the exposure was reachable, not theoretical.
-- tracking_get_offer / tracking_list_offers were anon-readable too;
-- they carry catalog data only, but they are gated here as well — the
-- web app reads the offers catalog via the offers table (RLS), never
-- via these RPCs, so no public caller breaks.
--
-- Auth model (same proof pattern as 010/012):
--   * Worker path: the tracking Worker passes p_proof =
--     hex(HMAC-SHA256(<function name>, NP_WORKER_PROOF)); the secret is
--     worker_secrets.np_ipn_proof. With a valid proof the call behaves
--     exactly as before (no row restriction) — conversion dedup,
--     click/offer resolution, SmartLink picks and stats keep working.
--   * Signed-in path: a JWT caller sees only their own affiliate's
--     rows (admins see all). Offer RPCs are catalog data: any signed-in
--     caller may read them.
--   * Neither proof nor JWT: the call raises insufficient_privilege.
-- The proof subject is the function name, so a proof minted for one
-- function cannot be replayed against another (or against 010's
-- deposit/batch subjects, or 012's list subjects).
--
-- worker_secrets / np_check_proof are re-created here idempotently
-- (identical body to 010/012) so 013 works standalone; whichever
-- migration applied first, the function exists and behaves the same.
--
-- Scope: the four single-row/by-ID RPCs only. tracking_record_click,
-- tracking_record_conversion, tracking_record_ledger_entry and
-- tracking_resolve_affiliate are write/resolve paths the Worker must
-- call without a JWT — they are unchanged.
--
-- NOTE on overloads: each new p_proof parameter makes a DIFFERENT
-- signature, so CREATE OR REPLACE does not remove the old overload —
-- the old (vulnerable) overloads are dropped explicitly below,
-- otherwise an anon call with the old arity would still resolve to
-- them (same gotcha as 012).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- worker_secrets — Worker-held proof secrets. RLS on, NO policies: no
-- browser role can read them; only SECURITY DEFINER functions can.
-- (Same shape as 010/012; created idempotently here so 013 works
-- standalone.)
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

-- ---------------------------------------------------------------------------
-- Internal: verify the worker proof. Not exposed as an RPC (EXECUTE
-- revoked from PUBLIC) — only other SECURITY DEFINER functions call it.
-- Identical body to 010/012; whichever migration applies first, the
-- function exists and behaves the same.
-- ---------------------------------------------------------------------------
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
  -- Schema-qualified: pgcrypto lives in the `extensions` schema, which
  -- is NOT on this function's pinned search_path (public, pg_temp) —
  -- a bare hmac() call raises 42883 at runtime.
  v_expected := encode(extensions.hmac(p_subject, v_secret, 'sha256'), 'hex');
  RETURN v_expected = lower(COALESCE(p_proof, ''));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.np_check_proof(text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- tracking_get_click — now authenticated. Worker (valid proof) sees the
-- row as before; a signed-in affiliate sees only their own clicks;
-- admins see all; anonymous callers get insufficient_privilege.
-- A row belonging to another affiliate returns null (filtered, not an
-- error), matching the 012 list behaviour.
-- (Old 1-arg overload dropped explicitly — see the note above.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_get_click(text);
CREATE OR REPLACE FUNCTION public.tracking_get_click(
  p_click_id text,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_is_worker boolean;
  v_is_admin boolean;
BEGIN
  v_is_worker := public.np_check_proof('tracking_get_click', p_proof);
  v_is_admin := public.is_admin();
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tracking_get_click: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT to_jsonb(c) INTO v_row
    FROM (SELECT * FROM public.clicks
           WHERE click_id = p_click_id
             AND (v_is_worker OR v_is_admin OR affiliate_id = auth.uid())) c;
  RETURN COALESCE(v_row, 'null'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_find_conversion — same auth model as tracking_get_click.
-- The scope predicate is AND-ed with the whole lookup disjunction
-- (by id, by idempotency key, or by click+offer), so a signed-in
-- affiliate can only ever match their own conversions.
-- (Old 4-arg overload dropped explicitly — see the note above.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_find_conversion(uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.tracking_find_conversion(
  p_id uuid,
  p_idempotency_key text,
  p_click_id text,
  p_offer_id uuid,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_is_worker boolean;
  v_is_admin boolean;
BEGIN
  v_is_worker := public.np_check_proof('tracking_find_conversion', p_proof);
  v_is_admin := public.is_admin();
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tracking_find_conversion: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT to_jsonb(conv) || jsonb_build_object('affiliate_code', ap.affiliate_code)
    INTO v_row
    FROM public.conversions conv
    LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = conv.affiliate_id
   WHERE ((p_id IS NOT NULL AND conv.id = p_id)
      OR (p_idempotency_key IS NOT NULL AND conv.idempotency_key = p_idempotency_key)
      OR (p_click_id IS NOT NULL AND p_offer_id IS NOT NULL
          AND conv.click_id = p_click_id AND conv.offer_id = p_offer_id
          AND conv.status IN ('pending', 'approved')))
     AND (v_is_worker OR v_is_admin OR conv.affiliate_id = auth.uid())
   ORDER BY conv.created_at DESC
   LIMIT 1;
  RETURN COALESCE(v_row, 'null'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_get_offer — now authenticated. Catalog data: any signed-in
-- caller may read it (the web app reads the offers table via RLS
-- instead and never calls this RPC); anonymous callers get
-- insufficient_privilege. The Worker passes a valid proof.
-- (Old 1-arg overload dropped explicitly — see the note above.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_get_offer(uuid);
CREATE OR REPLACE FUNCTION public.tracking_get_offer(
  p_offer_id uuid,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_is_worker boolean;
BEGIN
  v_is_worker := public.np_check_proof('tracking_get_offer', p_proof);
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tracking_get_offer: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT to_jsonb(o) INTO v_row
    FROM (
      SELECT id, campaign_id, advertiser_id, name, description, vertical,
             countries, devices, traffic_sources, conversion_type,
             payout_model, payout, rate_bps, currency, daily_cap, monthly_cap,
             landing_url, creatives, approval_required, status,
             starts_at, ends_at
        FROM public.offers
       WHERE id = p_offer_id
    ) o;

  RETURN COALESCE(v_row, 'null'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_list_offers — same auth model as tracking_get_offer.
-- (Old 1-arg overload dropped explicitly — see the note above.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_list_offers(integer);
CREATE OR REPLACE FUNCTION public.tracking_list_offers(
  p_limit integer DEFAULT 100,
  p_proof text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_is_worker boolean;
BEGIN
  v_is_worker := public.np_check_proof('tracking_list_offers', p_proof);
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tracking_list_offers: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, campaign_id, advertiser_id, name, description, vertical,
             countries, devices, traffic_sources, conversion_type,
             payout_model, payout, rate_bps, currency, daily_cap, monthly_cap,
             landing_url, creatives, approval_required, status,
             starts_at, ends_at
        FROM public.offers
       WHERE status = 'active'
       ORDER BY created_at DESC
       LIMIT LEAST(COALESCE(p_limit, 100), 500)
    ) o;
  RETURN v_rows;
END;
$$;
