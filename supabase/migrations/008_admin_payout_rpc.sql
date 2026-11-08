-- ============================================================================
-- AffiLayer — supabase/migrations/008_admin_payout_rpc.sql
--
-- H-5 (audit 7 Nov 2026) — Supabase-mode admin financial actions were
-- unwired: the web app called no RPCs at all, and the admin payout /
-- conversion pages only mutated the local demo store, so in Supabase mode
-- an approval changed nothing in the database. This migration adds the
-- missing admin payout RPCs; the web wiring (data.ts + admin pages) calls
-- these plus the existing approve_conversion / reject_conversion (003).
--
-- Ledger pipeline (enforced by the 003 immutability trigger):
--   pending -> approved -> payable -> paid
-- Approve RESERVES the money (approved -> payable, whole ledger rows,
-- oldest first); complete SETTLES it (payable -> paid + a
-- payout_transactions row). The trigger forbids approved -> paid directly,
-- so the two-step shape is not optional.
--
-- Amount rule (deliberate MVP constraint, stated in the error text):
-- a payout request must equal the affiliate's approved ledger balance
-- for that currency, in whole ledger rows. Partial-row settlement would
-- overstate what was paid, so approve/complete both refuse it instead
-- of silently flipping a row that covers more than the request. The
-- affiliate page already caps requests at the approved balance; the
-- admin rejects anything else with a note and the affiliate re-requests.
--
-- Authorization mirrors approve_conversion (003): SECURITY DEFINER so
-- the function can write the service-role-only tables, with an explicit
-- is_admin() gate for any signed-in caller. A non-admin calling any of
-- these gets insufficient_privilege; the ledger trigger still guards the
-- status transitions for everyone, including the service role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- approve_payout_request — pending -> approved; reserves ledger rows.
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
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
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
-- reject_payout_request — pending -> rejected only. The reason is stored
-- in the request note so the affiliate can see why.
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
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
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
-- complete_payout_request — approved -> paid. The money itself moves
-- outside the app (bank / crypto / manual transfer, per the MVP copy);
-- this records the settlement: a payout_transactions row plus the
-- reserved ledger rows flipping payable -> paid. The payable sum must
-- still equal the request amount — if new conversions were approved
-- after the payout was approved, the balance moved and the admin must
-- reject and re-approve instead of settling a stale amount.
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
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
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
