-- ============================================================================
-- AffiLayer — supabase/migrations/032_balance_mirror.sql
--
-- Balance mirror (27 Nov 2026, design
-- ~/workspace/work/affilayer-balance-mirror-design-2026-11-27.md):
-- every provider credit must reach the commission_ledger, correctly
-- attributed, exactly once, in USD. This migration is the DB half:
--
--  1. provider_reconciliations — the audit trail that the mirror held
--     on a given day (NOT money: rows are the comparison, never the
--     settlement). Admin-only.
--  2. tracking_record_conversion + tracking_record_ledger_entry gain
--     optional metadata/note params (DROP + CREATE, same as 014 — the
--     new params have defaults, so the Worker's named-arg calls are
--     unaffected). The FX originals (provider amount/currency/rate)
--     and the ledger note summary need a record-time write: the ledger
--     trigger forbids note changes after insert, so the note must be
--     set at insert time.
--  3. record_provider_credit — admin-only manual provider credit
--     (NOWPayments monthly figure; any future manual credit). The
--     amount passed is ALREADY the affiliate amount, net of the
--     provider share — no rate math is applied here.
--  4. reverse_conversion — admin-only correction path. Ledger rows
--     are IMMUTABLE: a wrong credit is reversed (a sanctioned
--     transition) and re-recorded fresh, never edited in place.
--     Payable/paid rows cannot be reversed (they are reserved in a
--     payout request) — release the reservation first.
--  5. set_reconciliation_status — admin-only status change on a
--     reconciliation row, with an audit row.
--
-- No offer activation, no money movement, no affiliate-facing change.
-- Promo: shares live in each feed (Worker constants / import script),
-- each carrying the revert date 26 Feb 2027 in a comment and in the
-- promo checklist — not in this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. provider_reconciliations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_reconciliations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL
                    CHECK (provider IN ('lospollos', 'cj', 'nowpayments', 'mobidea')),
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  provider_total    numeric(12, 2),
  provider_currency char(3),
  ledger_total      numeric(12, 2) NOT NULL DEFAULT 0,
  ledger_currency   char(3) NOT NULL DEFAULT 'USD',
  difference        numeric(12, 2) GENERATED ALWAYS AS
                    (CASE WHEN provider_total IS NULL THEN NULL
                          ELSE provider_total - ledger_total END) STORED,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'matched', 'mismatch', 'explained')),
  checked_by        uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  note              text,
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_reconciliations_period_unique
    UNIQUE (provider, period_start, period_end)
);

ALTER TABLE public.provider_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_reconciliations_admin_all ON public.provider_reconciliations;
CREATE POLICY provider_reconciliations_admin_all ON public.provider_reconciliations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_reconciliations TO authenticated;

DROP TRIGGER IF EXISTS trg_provider_reconciliations_updated_at ON public.provider_reconciliations;
CREATE TRIGGER trg_provider_reconciliations_updated_at
  BEFORE UPDATE ON public.provider_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2a. tracking_record_conversion — same as 022, plus optional p_metadata.
-- DROP + CREATE (not CREATE OR REPLACE): adding a parameter changes the
-- signature, and an overload would make the Worker's named-arg calls
-- ambiguous. The 022 approval gate, the 014 proof gate, the forced
-- pending status, and the offer-active / click-match checks are all
-- preserved verbatim.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_record_conversion(text, text, uuid, text, numeric, character, text, text, text, text);
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
  p_proof text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
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
      USING ERRCODE = 'check_violation';
  END IF;

  -- H-03 (022): only approved affiliates earn conversions.
  SELECT status INTO v_affiliate_status
    FROM public.profiles WHERE id = v_affiliate_id;
  IF v_affiliate_status IS NULL OR v_affiliate_status <> 'approved' THEN
    RAISE EXCEPTION 'tracking_record_conversion: affiliate not approved (status %)', COALESCE(v_affiliate_status, 'unknown')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.conversions (
    conversion_id, click_id, offer_id, affiliate_id, payout, currency,
    status, idempotency_key, sub1, metadata
  ) VALUES (
    p_conversion_id, p_click_id, p_offer_id, v_affiliate_id, p_payout, p_currency,
    p_status, p_idempotency_key, p_sub1, COALESCE(p_metadata, '{}'::jsonb)
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
-- 2b. tracking_record_ledger_entry — same as 014, plus optional p_note.
-- The note must be set at insert time: the ledger immutability trigger
-- forbids note changes afterwards.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tracking_record_ledger_entry(uuid, uuid, uuid, numeric, character, text);
CREATE OR REPLACE FUNCTION public.tracking_record_ledger_entry(
  p_conversion_id uuid,
  p_affiliate_id uuid,
  p_offer_id uuid,
  p_amount numeric,
  p_currency character,
  p_proof text DEFAULT NULL,
  p_note text DEFAULT NULL
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
    conversion_id, affiliate_id, offer_id, amount, currency, status, note
  ) VALUES (
    p_conversion_id, p_affiliate_id, p_offer_id, p_amount, p_currency, 'pending', p_note
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
-- 3. record_provider_credit — admin-only manual provider credit.
--
-- Attribution (NOWPayments gap, design §3.3): the affiliate is named by
-- the admin, who verified the merchant in the provider dashboard. The
-- amount is ALREADY the affiliate amount, net of the provider share —
-- no rate math is applied here. The conversion is born pending and only
-- becomes payable through the normal approval flow.
-- Idempotency: manual:<provider>:<provider reference>. A repeat call
-- with the same amount reports already-recorded (and backfills a
-- missing ledger row); a repeat with a DIFFERENT amount reports a
-- mismatch and records nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_provider_credit(
  p_affiliate_id uuid,
  p_offer_id uuid,
  p_provider text,
  p_provider_reference text,
  p_amount numeric,
  p_currency character,
  p_note text,
  p_actor uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_affiliate_code text;
  v_affiliate_status text;
  v_offer_status text;
  v_key text;
  v_existing jsonb;
  v_existing_payout numeric;
  v_existing_id uuid;
  v_conversion_id text;
  v_conv jsonb;
  v_conv_uuid uuid;
  v_led jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'record_provider_credit: only admins may record provider credits'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('nowpayments', 'cj', 'mobidea', 'lospollos', 'manual') THEN
    RAISE EXCEPTION 'record_provider_credit: unknown provider %', p_provider
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_provider_reference IS NULL OR btrim(p_provider_reference) = '' THEN
    RAISE EXCEPTION 'record_provider_credit: provider reference is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'record_provider_credit: amount % out of range 0..10000', p_amount
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_currency IS NULL OR NOT (p_currency = ANY (ARRAY[
      'USD','EUR','GBP','CAD','AUD','JPY','CHF','NZD','SGD','HKD','INR',
      'BRL','MXN','ZAR','PLN','SEK','NOK','DKK','CZK','HUF','ILS','KRW',
      'TWD','THB','MYR','IDR','PHP','VND','TRY','AED','SAR'
    ])) THEN
    RAISE EXCEPTION 'record_provider_credit: unsupported currency %', p_currency
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT affiliate_code INTO v_affiliate_code
    FROM public.affiliate_profiles WHERE profile_id = p_affiliate_id;
  IF v_affiliate_code IS NULL THEN
    RAISE EXCEPTION 'record_provider_credit: unknown affiliate %', p_affiliate_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT status INTO v_affiliate_status FROM public.profiles WHERE id = p_affiliate_id;
  IF v_affiliate_status IS NULL OR v_affiliate_status <> 'approved' THEN
    RAISE EXCEPTION 'record_provider_credit: affiliate not approved (status %)', COALESCE(v_affiliate_status, 'unknown')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_offer_status FROM public.offers WHERE id = p_offer_id;
  IF v_offer_status IS NULL THEN
    RAISE EXCEPTION 'record_provider_credit: unknown offer %', p_offer_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_offer_status <> 'active' THEN
    RAISE EXCEPTION 'record_provider_credit: offer % is % (not active)', p_offer_id, v_offer_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_key := 'manual:' || p_provider || ':' || btrim(p_provider_reference);

  -- Duplicate: same key already recorded.
  SELECT to_jsonb(c), c.payout, c.id INTO v_existing, v_existing_payout, v_existing_id
    FROM (SELECT id, payout FROM public.conversions WHERE idempotency_key = v_key) c;
  IF v_existing IS NOT NULL THEN
    IF ABS(v_existing_payout - p_amount) > 0.005 THEN
      RETURN jsonb_build_object(
        'duplicate', true,
        'amount_mismatch', true,
        'existing_amount', v_existing_payout,
        'requested_amount', p_amount,
        'id', v_existing_id,
        'idempotency_key', v_key
      );
    END IF;
    -- Same amount: backfill a missing ledger row, then report duplicate.
    v_led := public.tracking_record_ledger_entry(
      p_conversion_id := v_existing_id,
      p_affiliate_id := p_affiliate_id,
      p_offer_id := p_offer_id,
      p_amount := p_amount,
      p_currency := p_currency,
      p_note := p_note
    );
    RETURN jsonb_build_object(
      'duplicate', true,
      'amount_mismatch', false,
      'id', v_existing_id,
      'idempotency_key', v_key
    );
  END IF;

  v_conversion_id := gen_random_uuid()::text;
  v_conv := public.tracking_record_conversion(
    p_conversion_id := v_conversion_id,
    p_click_id := NULL,
    p_offer_id := p_offer_id,
    p_affiliate_code := v_affiliate_code,
    p_payout := p_amount,
    p_currency := p_currency,
    p_status := 'pending',
    p_idempotency_key := v_key,
    p_sub1 := NULL,
    p_metadata := (COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'provider', p_provider,
      'provider_reference', btrim(p_provider_reference),
      'manual_credit', true,
      'entered_by', p_actor
    ))
  );
  v_conv_uuid := (v_conv ->> 'id')::uuid;

  v_led := public.tracking_record_ledger_entry(
    p_conversion_id := v_conv_uuid,
    p_affiliate_id := p_affiliate_id,
    p_offer_id := p_offer_id,
    p_amount := p_amount,
    p_currency := p_currency,
    p_note := p_note
  );

  PERFORM public.log_audit(
    p_actor,
    'provider_credit.recorded',
    'conversion',
    v_conv_uuid,
    jsonb_build_object(
      'provider', p_provider,
      'provider_reference', btrim(p_provider_reference),
      'affiliate_id', p_affiliate_id,
      'offer_id', p_offer_id,
      'amount', p_amount,
      'currency', p_currency,
      'idempotency_key', v_key
    )
  );

  RETURN jsonb_build_object(
    'id', v_conv_uuid,
    'conversion_id', v_conversion_id,
    'duplicate', false,
    'amount', p_amount,
    'currency', p_currency,
    'idempotency_key', v_key
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. reverse_conversion — admin-only correction path.
-- Flips a pending/approved conversion AND its ledger row to 'reversed'
-- (a sanctioned transition in the ledger trigger). Reversed rows pay
-- $0 and are terminal. Payable/paid rows are refused: they are
-- reserved in a payout request — release the reservation first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_conversion(
  p_conversion_id uuid,
  p_actor uuid,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_payout numeric;
  v_ledger_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'reverse_conversion: only admins may reverse conversions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, payout
    INTO v_status, v_affiliate_id, v_payout
    FROM public.conversions
    WHERE id = p_conversion_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversion not found: %', p_conversion_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IN ('rejected', 'reversed') THEN
    RAISE EXCEPTION 'conversion % cannot be reversed from status %', p_conversion_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_ledger_status
    FROM public.commission_ledger
    WHERE conversion_id = p_conversion_id;
  IF v_ledger_status IN ('payable', 'paid') THEN
    RAISE EXCEPTION 'conversion % cannot be reversed: its ledger row is % (in payout) — release the reservation first', p_conversion_id, v_ledger_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.conversions
    SET status = 'reversed'
    WHERE id = p_conversion_id;

  UPDATE public.commission_ledger
    SET status = 'reversed'
    WHERE conversion_id = p_conversion_id AND status IN ('pending', 'approved');

  PERFORM public.log_audit(
    p_actor,
    'conversion.reversed',
    'conversion',
    p_conversion_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'payout', v_payout,
      'from_status', v_status,
      'to_status', 'reversed',
      'reason', COALESCE(p_reason, '')
    )
  );

  RETURN 'reversed';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. set_reconciliation_status — admin-only status change on a
-- reconciliation row, with an audit row (the table records the
-- difference; it never settles it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_reconciliation_status(
  p_row_id uuid,
  p_status text,
  p_note text,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'set_reconciliation_status: only admins may change reconciliation status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('open', 'matched', 'mismatch', 'explained') THEN
    RAISE EXCEPTION 'set_reconciliation_status: unknown status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_old
    FROM public.provider_reconciliations
    WHERE id = p_row_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconciliation row not found: %', p_row_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.provider_reconciliations
    SET status = p_status,
        note = COALESCE(p_note, note),
        checked_by = p_actor
    WHERE id = p_row_id;

  PERFORM public.log_audit(
    p_actor,
    'reconciliation.status',
    'provider_reconciliation',
    p_row_id,
    jsonb_build_object('from_status', v_old, 'to_status', p_status)
  );

  RETURN p_status;
END;
$$;
