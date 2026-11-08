-- ============================================================================
-- AffiLayer — supabase/migrations/011_fix_admin_gates.sql
--
-- Fixes the admin-gate hole found 9 Nov 2026 (same class as the 007
-- list-RPC leak): the admin RPCs gated on
--   IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN RAISE ...
-- That condition only rejects a *signed-in non-admin*. Called with no JWT
-- at all (just the publishable anon key, which ships in the web bundle),
-- auth.uid() is NULL, the gate never raises, and the function runs as if
-- an admin called it. Anyone holding the anon key plus a row UUID could
-- approve/reject conversions and approve/reject/complete payouts with no
-- money moving.
--
-- Fix: every gate becomes
--   IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE ...
-- Verified against is_admin() (002): it is SELECT EXISTS (... WHERE
-- p.id = auth.uid() ...), so it returns FALSE (not NULL) for a NULL uid
-- — the OR formulation is correct regardless.
--
-- Scope: the three 008 payout RPCs plus approve/reject_conversion (003),
-- which carry the same hole on the same money path (approving a
-- conversion makes its ledger row payable). log_audit (003) is
-- deliberately NOT changed here: 010's proof-gated, no-JWT paths call it
-- (np_confirm_deposit / np_sync_payout_status log with a NULL actor), so
-- tightening it would break the NOWPayments settlement path. Its
-- exposure is audit-row forgery only (no money movement) and is tracked
-- separately.
--
-- The old comment on approve_conversion ("backend callers with no JWT")
-- is superseded: backend callers must now use the worker-proof pattern
-- (010/012), never a bare anon-key call.
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
      USING ERRCODE = 'no_data_found';
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
      USING ERRCODE = 'no_data_found';
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
      USING ERRCODE = 'no_data_found';
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
      USING ERRCODE = 'no_data_found';
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
      USING ERRCODE = 'no_data_found';
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
