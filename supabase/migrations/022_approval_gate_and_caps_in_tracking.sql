-- ============================================================================
-- AffiLayer — supabase/migrations/022_approval_gate_and_caps_in_tracking.sql
--
-- H-03 / P1-5 (forensic audit 9 Nov 2026) — no affiliate-approval gate
-- anywhere in tracking: tracking_record_click / tracking_record_conversion
-- resolved the affiliate with no status check, so pending (unvetted)
-- affiliates earned and got paid (live: AFF-TEST-001 pending holds
-- $24.02 paid ledger). Fix: resolve the affiliate, then require
-- profiles.status = 'approved', otherwise raise insufficient_privilege
-- ('affiliate not approved'). Applied in BOTH record_click and
-- record_conversion, after affiliate resolution and after the duplicate
-- short-circuit (a replayed click_id / idempotency key still returns
-- duplicate=true without creating a row). The Worker's SmartLink
-- sentinel affiliate_code 'smartlink' records with affiliate_id NULL
-- by design — the gate is skipped when there is no affiliate to check.
-- Existing clicks/conversions/ledger rows for pending affiliates are
-- untouched; only NEW records are gated.
--
-- P1-10 / M-01 — offer caps never enforced. Fix in record_click:
--   * daily_cap (offers.daily_cap) = max clicks for the offer in the
--     current UTC calendar day; monthly_cap (offers.monthly_cap) = max
--     clicks for the offer in the current UTC calendar month. These are
--     the DB columns as source of truth: the app/Worker names for them
--     are capDaily / capTotal (data.ts createOffer maps capDaily ->
--     daily_cap, capTotal -> monthly_cap; mapOffer maps them back).
--     "capTotal" is the MONTHLY cap, not an all-time total — the
--     monthly window is the correct reading of the monthly_cap column.
--   * NULL cap = uncapped (the live offer has both NULL: unaffected).
--   * Counts are per offer across all affiliates (caps are an
--     advertiser budget, not a per-affiliate limit).
--   * A per-offer advisory lock (pg_advisory_xact_lock) serializes the
--     check-then-insert for capped offers so two concurrent clicks at
--     cap-1 cannot both pass; uncapped offers take no lock.
--   * Rejection is check_violation ('daily/monthly cap reached').
--   Caps are enforced ONLY in record_click (the click is where the
--   budget is consumed); record_conversion does not re-check caps.
--
-- NOT gated here (follow-up, out of the task scope): 
-- tracking_record_ledger_entry has no approval check — it is
-- proof-or-admin only (Worker-only path) and unreachable for pending
-- affiliates now that conversion creation is gated, but a proof
-- holder could still mint a ledger row directly. If the Worker proof
-- is ever exposed, ledger entry needs the same gate.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tracking_record_click — proof or admin JWT only (014); + approval gate
-- + caps. Full redefinition from the LIVE def (014); signature unchanged.
-- ---------------------------------------------------------------------------
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
  v_affiliate_status text;
  v_offer_status text;
  v_daily_cap integer;
  v_monthly_cap integer;
  v_clicks_today integer;
  v_clicks_month integer;
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

  -- H-03 (022): only approved affiliates earn clicks. The SmartLink
  -- sentinel has no affiliate (v_affiliate_id IS NULL) and is skipped.
  IF v_affiliate_id IS NOT NULL THEN
    SELECT status INTO v_affiliate_status
      FROM public.profiles WHERE id = v_affiliate_id;
    IF v_affiliate_status IS NULL OR v_affiliate_status <> 'approved' THEN
      RAISE EXCEPTION 'tracking_record_click: affiliate not approved (status %)', COALESCE(v_affiliate_status, 'unknown')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_offer_id IS NOT NULL THEN
    SELECT status, daily_cap, monthly_cap
      INTO v_offer_status, v_daily_cap, v_monthly_cap
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

    -- P1-10 / M-01 (022): enforce caps. NULL = uncapped. The advisory
    -- lock serializes check-then-insert per offer so the cap is exact
    -- under concurrency; it is only taken when the offer has a cap.
    IF v_daily_cap IS NOT NULL OR v_monthly_cap IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('affilayer-offer-cap:' || p_offer_id::text));
      IF v_daily_cap IS NOT NULL THEN
        SELECT COUNT(*) INTO v_clicks_today
          FROM public.clicks
          WHERE offer_id = p_offer_id
            AND created_at >= date_trunc('day', now());
        IF v_clicks_today >= v_daily_cap THEN
          RAISE EXCEPTION 'tracking_record_click: offer % daily cap reached (% clicks today, cap %)', p_offer_id, v_clicks_today, v_daily_cap
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
      IF v_monthly_cap IS NOT NULL THEN
        SELECT COUNT(*) INTO v_clicks_month
          FROM public.clicks
          WHERE offer_id = p_offer_id
            AND created_at >= date_trunc('month', now());
        IF v_clicks_month >= v_monthly_cap THEN
          RAISE EXCEPTION 'tracking_record_click: offer % monthly cap reached (% clicks this month, cap %)', p_offer_id, v_clicks_month, v_monthly_cap
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
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
-- forced to 'pending' (014); + approval gate. Full redefinition from the
-- LIVE def (014); signature unchanged.
-- ---------------------------------------------------------------------------
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
  v_affiliate_status text;
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

  -- H-03 (022): only approved affiliates earn conversions. The
  -- affiliate here is the click's affiliate (or the code's, if the
  -- click carried none) — a pending affiliate's click can no longer
  -- convert, and neither can a direct call with their code.
  SELECT status INTO v_affiliate_status
    FROM public.profiles WHERE id = v_affiliate_id;
  IF v_affiliate_status IS NULL OR v_affiliate_status <> 'approved' THEN
    RAISE EXCEPTION 'tracking_record_conversion: affiliate not approved (status %)', COALESCE(v_affiliate_status, 'unknown')
      USING ERRCODE = 'insufficient_privilege';
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
