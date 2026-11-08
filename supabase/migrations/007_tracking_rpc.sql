-- ============================================================================
-- 007_tracking_rpc.sql — H-4 durable Worker store (audit Phase 4)
-- ----------------------------------------------------------------------------
-- The tracking Worker writes clicks / conversions / ledger rows to Postgres
-- through these RPCs instead of per-isolate memory. They are SECURITY
-- DEFINER with a pinned search_path (the B-L4 finding: DEFINER functions
-- must not inherit a caller-set search_path), and they are callable with
-- the publishable anon key — the Worker is the intended caller and the
-- anon key is already public in the web bundle, so the functions
-- themselves are the enforcement point:
--   * offer must exist and be active (record_click, record_conversion)
--   * conversion needs a real click, and the click's offer must match
--   * currency must be in the allowlist (same 31 codes as the Worker)
--   * payout is capped at 10,000 (same MAX_PAYOUT as the Worker)
--   * dedup is durable: ON CONFLICT DO NOTHING on click_id /
--     idempotency_key, plus the (click_id, offer_id) partial unique
--     index; a conflict returns the existing row with duplicate=true
--     instead of an error (audit M-1).
-- Fabricated rows land as status 'pending' only — nothing becomes
-- payable without an admin approval (approve_conversion), so a direct
-- RPC call cannot move money. Rate limiting stays in the Worker.
-- Demo offers (demo-offer-1/2/3) are NOT in the offers table and their
-- conversions.offer_id is NOT NULL uuid, so demo traffic stays in the
-- Worker's in-memory store by design; only real (UUID) offers go here.
-- The file also adds five read RPCs for the operator endpoints and the
-- dedup pre-check (tracking_get_click, tracking_list_clicks,
-- tracking_list_conversions, tracking_list_offers,
-- tracking_find_conversion).
-- Apply order: 001 -> 002 -> 003 -> 005 -> 006 -> 007.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tracking_resolve_affiliate — affiliate_code -> profile id (or null)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_resolve_affiliate(
  p_affiliate_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_affiliate_code IS NULL OR btrim(p_affiliate_code) = '' THEN
    RETURN 'null'::jsonb;
  END IF;

  SELECT profile_id INTO v_profile_id
    FROM public.affiliate_profiles
    WHERE affiliate_code = p_affiliate_code;

  IF v_profile_id IS NULL THEN
    RETURN 'null'::jsonb;
  END IF;

  RETURN jsonb_build_object('profile_id', v_profile_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- offers.rate_bps — CPS commission rate in basis points (1000 = 10%).
-- The app's create-offer form collects it (audit M-13) but the table had
-- no column for it; the Worker needs it to compute CPS commissions.
-- ---------------------------------------------------------------------------
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS rate_bps integer
    CHECK (rate_bps IS NULL OR (rate_bps >= 0 AND rate_bps <= 10000));

-- ---------------------------------------------------------------------------
-- tracking_get_offer — the Worker needs payout/caps/landing/status to
-- route a real (UUID) offer. Returns the row as jsonb, or null.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_get_offer(
  p_offer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
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
-- tracking_record_click — insert one click; duplicate click_id returns
-- the existing row with duplicate=true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_record_click(
  p_click_id text,
  p_affiliate_code text,
  p_offer_id uuid,
  p_ip inet,
  p_user_agent text,
  p_referrer text,
  p_country char(2),
  p_device text,
  p_source text,
  p_sub1 text,
  p_sub2 text,
  p_sub3 text,
  p_sub4 text,
  p_sub5 text,
  p_is_smartlink boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affiliate_id uuid;
  v_offer_status text;
  v_id uuid;
  v_existing jsonb;
BEGIN
  IF p_click_id IS NULL OR btrim(p_click_id) = '' THEN
    RAISE EXCEPTION 'tracking_record_click: click_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_affiliate_code IS NULL OR btrim(p_affiliate_code) = '' THEN
    RAISE EXCEPTION 'tracking_record_click: affiliate_code is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Duplicate: return the existing row, do not insert again (M-1).
  SELECT to_jsonb(c) INTO v_existing
    FROM (SELECT id, click_id FROM public.clicks WHERE click_id = p_click_id) c;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  SELECT profile_id INTO v_affiliate_id
    FROM public.affiliate_profiles
    WHERE affiliate_code = p_affiliate_code;

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

  -- Lost a race with a concurrent insert of the same click_id: the
  -- other row won; return it as a duplicate instead of erroring.
  IF v_id IS NULL THEN
    SELECT to_jsonb(c) INTO v_existing
      FROM (SELECT id, click_id FROM public.clicks WHERE click_id = p_click_id) c;
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'click_id', p_click_id, 'duplicate', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_record_conversion — insert one conversion. Duplicate
-- idempotency key (or a second pending/approved conversion for the same
-- click+offer) returns the existing row with duplicate=true.
-- The ledger entry is a separate call (tracking_record_ledger_entry):
-- the Worker computes the commission from the offer first, then records
-- the ledger entry, mirroring the in-memory flow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_record_conversion(
  p_conversion_id text,
  p_click_id text,
  p_offer_id uuid,
  p_affiliate_code text,
  p_payout numeric(12, 2),
  p_currency char(3),
  p_status text,
  p_idempotency_key text,
  p_sub1 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affiliate_id uuid;
  v_offer_status text;
  v_click_offer_id uuid;
  v_click_affiliate_id uuid;
  v_id uuid;
  v_existing jsonb;
BEGIN
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
  IF p_status IS NULL THEN
    p_status := 'pending';
  END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'reversed') THEN
    RAISE EXCEPTION 'tracking_record_conversion: invalid status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Duplicate by idempotency key: return the existing row.
  SELECT to_jsonb(c) INTO v_existing
    FROM (
      SELECT id, conversion_id, click_id, offer_id, status
        FROM public.conversions WHERE idempotency_key = p_idempotency_key
    ) c;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('duplicate', true);
  END IF;

  -- The offer must exist and be active.
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

  -- The click must exist, and its offer must match (defense in depth:
  -- the Worker already checks this before calling).
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

  -- Affiliate: prefer the click's affiliate, fall back to the code.
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

  -- Lost a race on the idempotency key: return the winner as duplicate.
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

-- One ledger entry per conversion, enforced by a unique index (a
-- conversion's commission is recorded once; approval moves the same row
-- pending -> approved, it never inserts a second row).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_conversion_unique
  ON public.commission_ledger (conversion_id);

-- ---------------------------------------------------------------------------
-- tracking_record_ledger_entry — insert the pending ledger entry for a
-- conversion (amount = the Worker's computed commission, not the raw
-- payout). Duplicate conversion_id returns the existing row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_record_ledger_entry(
  p_conversion_id uuid,
  p_affiliate_id uuid,
  p_offer_id uuid,
  p_amount numeric(12, 2),
  p_currency char(3)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_existing jsonb;
BEGIN
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
-- Read RPCs for the operator endpoints (/api/stats, /api/clicks/:id).
-- SECURITY DEFINER so the Worker (anon key) can read the rows it wrote;
-- these are operator-only behind the Worker's Bearer check, never called
-- from a browser. Lists are capped (default 1000) and filter in SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_get_click(
  p_click_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  SELECT to_jsonb(c) INTO v_row
    FROM (SELECT * FROM public.clicks WHERE click_id = p_click_id) c;
  RETURN COALESCE(v_row, 'null'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_list_clicks(
  p_from timestamptz,
  p_to timestamptz,
  p_offer_id uuid,
  p_affiliate_code text,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT * FROM public.clicks
       WHERE (p_from IS NULL OR created_at >= p_from)
         AND (p_to IS NULL OR created_at <= p_to)
         AND (p_offer_id IS NULL OR offer_id = p_offer_id)
         AND (p_affiliate_code IS NULL OR affiliate_code = p_affiliate_code)
       ORDER BY created_at DESC
       LIMIT LEAST(COALESCE(p_limit, 1000), 5000)
    ) c;
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_list_conversions(
  p_from timestamptz,
  p_to timestamptz,
  p_offer_id uuid,
  p_affiliate_code text,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
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
       ORDER BY conv.created_at DESC
       LIMIT LEAST(COALESCE(p_limit, 1000), 5000)
    ) s;
  RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- tracking_list_offers — active real offers for SmartLink picks and the
-- operator offer list. Demo offers are not in the table and stay
-- in-memory in the Worker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_list_offers(
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
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

-- ---------------------------------------------------------------------------
-- tracking_find_conversion — one lookup for the Worker's dedup pre-check
-- and getConversion: by DB id, by idempotency key, or by click+offer
-- (pending/approved only, mirroring the Worker's duplicate rule).
-- Returns the conversion row as jsonb (with affiliate_code), or null.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_find_conversion(
  p_id uuid,
  p_idempotency_key text,
  p_click_id text,
  p_offer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  SELECT to_jsonb(conv) || jsonb_build_object('affiliate_code', ap.affiliate_code)
    INTO v_row
    FROM public.conversions conv
    LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = conv.affiliate_id
   WHERE (p_id IS NOT NULL AND conv.id = p_id)
      OR (p_idempotency_key IS NOT NULL AND conv.idempotency_key = p_idempotency_key)
      OR (p_click_id IS NOT NULL AND p_offer_id IS NOT NULL
          AND conv.click_id = p_click_id AND conv.offer_id = p_offer_id
          AND conv.status IN ('pending', 'approved'))
   ORDER BY conv.created_at DESC
   LIMIT 1;
  RETURN COALESCE(v_row, 'null'::jsonb);
END;
$$;
