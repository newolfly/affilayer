-- ============================================================================
-- AffiLayer — supabase/migrations/015_admin_rpc_not_found_4xx.sql
--
-- R23: admin RPCs return HTTP 500 for "not found" — fix to a 4xx.
--
-- Live-probe evidence (9 Nov 2026, admin JWT, PostgREST):
--   approve_payout_request(random UUID) -> HTTP 500, code P0002
--   approve_conversion(random UUID)    -> HTTP 500, code P0002
--   approve_conversion(already-approved)-> HTTP 400, code 23514
--   reject_payout_request(rejected)    -> HTTP 400, code 23514
--   approve_payout_request (no JWT)    -> HTTP 401, code 42501 (gate OK)
--
-- Migration 011 already set the not-found raises to errcode
-- 'no_data_found' (P0002), on the assumption PostgREST maps it to 404.
-- It does not: PostgREST maps P0002 to HTTP 500. A true 404 is not
-- reachable from a RAISE — the only SQLSTATEs PostgREST maps to 404 are
-- 42P01 (undefined_table) and 42883 (undefined_function), neither of
-- which fits a missing row. So the not-found raises move to
-- 'check_violation' (23514), which PostgREST maps to HTTP 400 (proven
-- live by the state-conflict raises in the same functions). The message
-- text still says exactly what is missing, so callers can distinguish
-- "not found" from a state conflict by the message.
--
-- Scope: the same five functions 011 redefined (approve/reject
-- conversion, approve/reject/complete payout). Bodies are otherwise
-- byte-identical to 011 — same NULL-OR admin gate, same state checks,
-- same ledger logic. Only the five not-found errcodes change.
--
-- NOTE: migration 010's np_* RPCs carry the same 'no_data_found'
-- pattern (7 occurrences), but 010 is unapplied and ON HOLD per Sojib
-- (9 Nov 02:47). Apply the same swap to 010 when its rollout resumes;
-- do not fold it into this file.
--
-- NOT APPLIED LIVE. Apply via the Supabase dashboard SQL editor or
-- direct Postgres, then re-probe: approve_payout_request with a random
-- UUID as admin must return HTTP 400 (not 500) with the "not found"
-- message.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- approve_conversion (003) — pending -> approved; ledger pending -> approved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_conversion(
  p_conversion_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_payout numeric(12, 2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'approve_conversion: only admins may approve conversions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, payout
    INTO v_status, v_affiliate_id, v_payout
    FROM public.conversions
    WHERE id = p_conversion_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversion not found: %', p_conversion_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'conversion % cannot be approved from status % (only pending can be approved)', p_conversion_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.conversions
    SET status = 'approved'
    WHERE id = p_conversion_id;

  -- Status-only change: permitted by the ledger trigger (pending ->
  -- approved is a sanctioned transition; amount/affiliate/currency are
  -- untouched, so the immutability guard does not fire).
  UPDATE public.commission_ledger
    SET status = 'approved'
    WHERE conversion_id = p_conversion_id AND status = 'pending';

  PERFORM public.log_audit(
    p_actor,
    'conversion.approved',
    'conversion',
    p_conversion_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'payout', v_payout,
      'from_status', 'pending',
      'to_status', 'approved'
    )
  );

  RETURN 'approved';
END;
$$;

-- ---------------------------------------------------------------------------
-- reject_conversion (003) — pending -> rejected; ledger pending -> rejected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_conversion(
  p_conversion_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_payout numeric(12, 2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'reject_conversion: only admins may reject conversions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, payout
    INTO v_status, v_affiliate_id, v_payout
    FROM public.conversions
    WHERE id = p_conversion_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversion not found: %', p_conversion_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'conversion % cannot be rejected from status % (only pending can be rejected)', p_conversion_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.conversions
    SET status = 'rejected'
    WHERE id = p_conversion_id;

  UPDATE public.commission_ledger
    SET status = 'rejected'
    WHERE conversion_id = p_conversion_id AND status = 'pending';

  PERFORM public.log_audit(
    p_actor,
    'conversion.rejected',
    'conversion',
    p_conversion_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'payout', v_payout,
      'from_status', 'pending',
      'to_status', 'rejected'
    )
  );

  RETURN 'rejected';
END;
$$;

-- ---------------------------------------------------------------------------
-- approve_payout_request (008) — pending -> approved; reserves ledger rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payout_request(
  p_request_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_amount numeric(12, 2);
  v_currency char(3);
  v_covered numeric(12, 2) := 0;
  v_row record;
  v_flipped uuid[] := '{}';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'approve_payout_request: only admins may approve payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, amount, currency
    INTO v_status, v_affiliate_id, v_amount, v_currency
    FROM public.payout_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'payout request % cannot be approved from status % (only pending can be approved)', p_request_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'payout request % has amount % (must be greater than 0)', p_request_id, v_amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reserve whole approved ledger rows, oldest first, until they cover
  -- the request exactly. Any raise below rolls the flips back: the
  -- function is one transaction, so a failed approval reserves nothing.
  FOR v_row IN
    SELECT id, amount FROM public.commission_ledger
    WHERE affiliate_id = v_affiliate_id
      AND currency = v_currency
      AND status = 'approved'
    ORDER BY created_at ASC, id ASC
  LOOP
    EXIT WHEN v_covered >= v_amount;
    UPDATE public.commission_ledger SET status = 'payable' WHERE id = v_row.id;
    v_covered := v_covered + v_row.amount;
    v_flipped := v_flipped || v_row.id;
  END LOOP;

  IF v_covered < v_amount THEN
    RAISE EXCEPTION 'payout request % ($% %) exceeds the affiliate approved balance ($%)', p_request_id, v_amount, v_currency, v_covered
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_covered > v_amount THEN
    RAISE EXCEPTION 'payout request % ($% %) does not match whole approved ledger rows (reserved $%) — request the full approved balance instead', p_request_id, v_amount, v_currency, v_covered
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.payout_requests
    SET status = 'approved', reviewed_by = p_actor, reviewed_at = now()
    WHERE id = p_request_id;

  PERFORM public.log_audit(
    p_actor,
    'payout.approved',
    'payout',
    p_request_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'amount', v_amount,
      'currency', v_currency,
      'ledger_row_ids', v_flipped,
      'from_status', 'pending',
      'to_status', 'approved'
    )
  );

  RETURN 'approved';
END;
$$;

-- ---------------------------------------------------------------------------
-- reject_payout_request (008) — pending -> rejected only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payout_request(
  p_request_id uuid,
  p_actor uuid,
  p_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_amount numeric(12, 2);
  v_currency char(3);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'reject_payout_request: only admins may reject payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, amount, currency
    INTO v_status, v_affiliate_id, v_amount, v_currency
    FROM public.payout_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'payout request % cannot be rejected from status % (only pending can be rejected)', p_request_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.payout_requests
    SET status = 'rejected', reviewed_by = p_actor, reviewed_at = now(),
        note = COALESCE(p_reason, note)
    WHERE id = p_request_id;

  PERFORM public.log_audit(
    p_actor,
    'payout.rejected',
    'payout',
    p_request_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'amount', v_amount,
      'currency', v_currency,
      'reason', p_reason,
      'from_status', 'pending',
      'to_status', 'rejected'
    )
  );

  RETURN 'rejected';
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_payout_request (008) — approved -> paid. Records the
-- settlement: a payout_transactions row plus the reserved ledger rows
-- flipping payable -> paid. The payable sum must still equal the request
-- amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_payout_request(
  p_request_id uuid,
  p_actor uuid,
  p_provider text DEFAULT NULL,
  p_transaction_ref text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_amount numeric(12, 2);
  v_currency char(3);
  v_payable numeric(12, 2);
  v_transaction_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'complete_payout_request: only admins may complete payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, amount, currency
    INTO v_status, v_affiliate_id, v_amount, v_currency
    FROM public.payout_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'payout request % cannot be completed from status % (only approved can be completed)', p_request_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_payable
    FROM public.commission_ledger
    WHERE affiliate_id = v_affiliate_id
      AND currency = v_currency
      AND status = 'payable';

  IF v_payable <> v_amount THEN
    RAISE EXCEPTION 'payout request % ($% %) no longer matches the reserved payable balance ($% %) — reject and re-approve it', p_request_id, v_amount, v_currency, v_payable, v_currency
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payout_transactions
    (payout_request_id, affiliate_id, amount, currency, status, provider, transaction_ref, paid_at)
    VALUES (p_request_id, v_affiliate_id, v_amount, v_currency, 'completed', p_provider, p_transaction_ref, now())
    RETURNING id INTO v_transaction_id;

  UPDATE public.commission_ledger
    SET status = 'paid'
    WHERE affiliate_id = v_affiliate_id
      AND currency = v_currency
      AND status = 'payable';

  UPDATE public.payout_requests
    SET status = 'paid', reviewed_by = p_actor, reviewed_at = now()
    WHERE id = p_request_id;

  PERFORM public.log_audit(
    p_actor,
    'payout.completed',
    'payout',
    p_request_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'amount', v_amount,
      'currency', v_currency,
      'transaction_id', v_transaction_id,
      'provider', p_provider,
      'transaction_ref', p_transaction_ref,
      'from_status', 'approved',
      'to_status', 'paid'
    )
  );

  RETURN 'paid';
END;
$$;
