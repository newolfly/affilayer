-- ============================================================================
-- AffiLayer — supabase/migrations/012_fix_list_rpc_auth.sql
--
-- Fixes the 007 list-RPC leak (found 8 Nov 2026): tracking_list_clicks
-- and tracking_list_conversions were callable with the publishable anon
-- key and null filters (limit 1000) — anyone holding the key (it ships
-- in the web bundle) could list conversion/click rows network-wide:
-- affiliate codes, payouts, IPs, user agents.
--
-- Auth model (same proof pattern as 010):
--   * Worker path: the tracking Worker passes p_proof =
--     hex(HMAC-SHA256(<function name>, NP_WORKER_PROOF)); the secret is
--     worker_secrets.np_ipn_proof. With a valid proof the call behaves
--     exactly as before (no row restriction) — SmartLink caps, stats and
--     ledger rebuilds keep working.
--   * Signed-in path: a JWT caller sees only their own affiliate's rows
--     (admins see all).
--   * Neither proof nor JWT: the call raises insufficient_privilege.
-- The proof subject is the function name, so a proof minted for one
-- list function cannot be replayed against the other (or against 010's
-- deposit/batch subjects).
--
-- worker_secrets is created here idempotently because 010 (which defines
-- it) is not applied live yet: CREATE TABLE IF NOT EXISTS with the SAME
-- shape/columns as 010, seeded only if the key is absent. 010's own
-- worker_secrets block was made IF NOT EXISTS in the same change, so a
-- later 010 apply does not clash (its INSERT is already ON CONFLICT DO
-- NOTHING, and np_check_proof is CREATE OR REPLACE with an identical
-- body here and in 010).
--
-- Scope: the two list RPCs only. tracking_get_click,
-- tracking_find_conversion and tracking_list_offers remain anon-callable
-- single-row/by-ID lookups — residual exposure, tracked separately.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- worker_secrets — Worker-held proof secrets. RLS on, NO policies: no
-- browser role can read them; only SECURITY DEFINER functions can.
-- (Same shape as 010; created idempotently here so 012 works standalone.)
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
-- Identical body to 010's np_check_proof; whichever migration applies
-- first, the function exists and behaves the same.
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
-- tracking_list_clicks — now authenticated. Worker (valid proof) sees
-- all rows as before; a signed-in affiliate sees only their own rows;
-- admins see all; anonymous callers get insufficient_privilege.
-- New parameter p_proof is appended with a default so existing named-arg
-- callers keep working (they now fail closed unless they pass a proof
-- or a JWT).
-- NOTE: the new p_proof parameter makes this a DIFFERENT signature, so
-- CREATE OR REPLACE does not remove the old 5-arg overload — the old
-- (vulnerable) overload is dropped explicitly below, otherwise a 5-arg
-- anon call would still resolve to it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_list_clicks(timestamptz, timestamptz, uuid, text, integer);
CREATE OR REPLACE FUNCTION public.tracking_list_clicks(
  p_from timestamptz,
  p_to timestamptz,
  p_offer_id uuid,
  p_affiliate_code text,
  p_limit integer DEFAULT 1000,
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
  v_is_admin boolean;
BEGIN
  v_is_worker := public.np_check_proof('tracking_list_clicks', p_proof);
  v_is_admin := public.is_admin();
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tracking_list_clicks: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT * FROM public.clicks
       WHERE (p_from IS NULL OR created_at >= p_from)
         AND (p_to IS NULL OR created_at <= p_to)
         AND (p_offer_id IS NULL OR offer_id = p_offer_id)
         AND (p_affiliate_code IS NULL OR affiliate_code = p_affiliate_code)
         AND (v_is_worker OR v_is_admin OR affiliate_id = auth.uid())
       ORDER BY created_at DESC
       LIMIT LEAST(COALESCE(p_limit, 1000), 5000)
    ) c;
  RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_list_conversions — same auth model as tracking_list_clicks.
-- (Old 5-arg overload dropped explicitly — see the note above.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_list_conversions(timestamptz, timestamptz, uuid, text, integer);
CREATE OR REPLACE FUNCTION public.tracking_list_conversions(
  p_from timestamptz,
  p_to timestamptz,
  p_offer_id uuid,
  p_affiliate_code text,
  p_limit integer DEFAULT 1000,
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
  v_is_admin boolean;
BEGIN
  v_is_worker := public.np_check_proof('tracking_list_conversions', p_proof);
  v_is_admin := public.is_admin();
  IF NOT v_is_worker AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'tracking_list_conversions: sign-in or worker proof required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Each conversion carries its click's country/device/source, its
  -- affiliate code, and its ledger amount/status, so the Worker can
  -- apply the same stats filters it uses for demo traffic and rebuild
  -- ledger entries without a separate query.
  SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT to_jsonb(conv) || jsonb_build_object(
        'click', jsonb_build_object(
          'country', clk.country,
          'device', clk.device,
          'source', clk.source
        ),
        'affiliate_code', ap.affiliate_code,
        'ledger_id', led.id,
        'ledger_amount', led.amount,
        'ledger_status', led.status
      ) AS row_json
        FROM public.conversions conv
        LEFT JOIN public.clicks clk ON clk.click_id = conv.click_id
        LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = conv.affiliate_id
        LEFT JOIN public.commission_ledger led ON led.conversion_id = conv.id
       WHERE (p_from IS NULL OR conv.created_at >= p_from)
         AND (p_to IS NULL OR conv.created_at <= p_to)
         AND (p_offer_id IS NULL OR conv.offer_id = p_offer_id)
         AND (p_affiliate_code IS NULL OR conv.affiliate_id IN (
               SELECT profile_id FROM public.affiliate_profiles
                WHERE affiliate_code = p_affiliate_code))
         AND (v_is_worker OR v_is_admin OR conv.affiliate_id = auth.uid())
       ORDER BY conv.created_at DESC
       LIMIT LEAST(COALESCE(p_limit, 1000), 5000)
    ) s;
  RETURN v_rows;
END;
$$;
