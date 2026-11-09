-- ============================================================================
-- AffiLayer — supabase/migrations/026_fix_np_log_audit_proof.sql
--
-- Phase 4 re-audit (10 Nov 2026) P0-1 / P0-2 / P0-3.
--
-- C-01 (CRITICAL): migration 021 gated log_audit to admin-or-proof, but
-- migration 010's Worker-proof functions (np_confirm_deposit,
-- np_sync_payout_status) call log_audit with actor NULL and NO proof
-- argument. On a Worker proof call there is no JWT, so log_audit raises
-- 'sign-in or worker proof required' and the whole transaction rolls
-- back — IPN settlement can never succeed (proven live: labelled $0.01
-- test deposit + valid proof -> InsufficientPrivilege, deposit stayed
-- 'waiting', 0 balance rows). Fix: compute the log_audit proof inside
-- both functions from worker_secrets (hex(HMAC-SHA256('log_audit',
-- secret)) — the same value np_check_proof verifies) and pass it as
-- the 6th arg. The proof is computed AFTER the function's own
-- worker-proof check, so the secret is known to exist by then
-- (np_check_proof returns false when it is NULL); a missing secret
-- still fails closed (NULL proof -> log_audit raises).
--
-- Also in np_sync_payout_status (M-09): the worker-proof check moves
-- BEFORE the batch lookup (fail closed, no existence oracle — the old
-- order leaked batch existence as 404-vs-401), and the FINISHED path
-- now sums + flips ONLY the reserved ledger ids, mirroring
-- complete_payout_request (019) — the old bulk payable flip deadlocked
-- under concurrent approvals for one affiliate and could flip rows
-- reserved for another approved request.
--
-- H-01 (HIGH): np_release_reservation is an internal helper only
-- (called by np_sync_payout_status on rejection and by the admin-gated
-- np_release_payout_reservation wrapper). It shipped with EXECUTE
-- granted to anon + authenticated and no check in the body (live anon
-- call -> 204). Revoke EXECUTE from PUBLIC/anon/authenticated;
-- postgres + service_role keep it. The SECURITY DEFINER callers still
-- work: their internal call runs as the definer (postgres).
--
-- H-03 (HIGH): affiliate_profiles.payout_currency is affiliate-writable
-- (RLS update-own via savePayoutWallet) and the executor pays
-- payout.amount verbatim in that currency. The ledger is USD-only and
-- payouts go out as USDT TRC20, so the column is now CHECK-constrained
-- to 'usdttrc20'. The Worker enforces the same allowlist at execution
-- time (handleExecutePayout); this CHECK is the save-time backstop.
-- All live rows are already 'usdttrc20' (verified 10 Nov 2026), so
-- ADD CONSTRAINT succeeds immediately.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- np_confirm_deposit: pass a valid log_audit proof (C-01).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_confirm_deposit(p_order_id text, p_proof text, p_status text, p_actually_paid numeric DEFAULT NULL::numeric, p_outcome_amount numeric DEFAULT NULL::numeric, p_outcome_currency text DEFAULT NULL::text, p_np_payment_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.advertiser_deposits%ROWTYPE;
  v_audit_proof text;
BEGIN
  IF NOT public.np_check_proof(p_order_id, p_proof) THEN
    RAISE EXCEPTION 'np_confirm_deposit: bad worker proof'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- C-01 (026): log_audit is admin-or-proof (021) and this Worker-proof
  -- path has no JWT. Compute the log_audit proof from the same secret
  -- np_check_proof verifies and carry it into the audit call below.
  SELECT encode(extensions.hmac('log_audit', value, 'sha256'), 'hex')
    INTO v_audit_proof
    FROM public.worker_secrets
    WHERE key = 'np_ipn_proof';

  SELECT * INTO v_row FROM public.advertiser_deposits WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit not found for order: %', p_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.status = 'finished' THEN
    RETURN 'already_finished';
  END IF;

  IF p_status NOT IN ('finished', 'partially_paid', 'failed', 'expired', 'refunded') THEN
    RAISE EXCEPTION 'np_confirm_deposit: cannot confirm a deposit with non-terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.advertiser_deposits
    SET status = p_status,
        np_payment_id = COALESCE(p_np_payment_id, np_payment_id),
        actually_paid = p_actually_paid,
        outcome_amount = p_outcome_amount,
        outcome_currency = p_outcome_currency,
        confirmed_at = CASE WHEN p_status = 'finished' THEN now() ELSE confirmed_at END
    WHERE id = v_row.id;

  IF p_status = 'finished' THEN
    INSERT INTO public.advertiser_balances (advertiser_id, currency, balance)
      VALUES (v_row.advertiser_id, v_row.currency, v_row.amount_usd)
      ON CONFLICT (advertiser_id, currency)
      DO UPDATE SET balance = public.advertiser_balances.balance + EXCLUDED.balance;

    PERFORM public.log_audit(
      NULL,
      'deposit.finished',
      'deposit',
      v_row.id,
      jsonb_build_object(
        'advertiser_id', v_row.advertiser_id,
        'amount_usd', v_row.amount_usd,
        'np_payment_id', v_row.np_payment_id,
        'order_id', v_row.order_id,
        'actually_paid', p_actually_paid,
        'outcome_amount', p_outcome_amount,
        'outcome_currency', p_outcome_currency
      ),
      v_audit_proof
    );
  END IF;

  RETURN p_status;
END;
$function$;

-- ---------------------------------------------------------------------------
-- np_sync_payout_status: proof before lookup + reserved-ids-only
-- settlement + valid log_audit proof (C-01, M-09).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_sync_payout_status(p_batch_id text, p_proof text, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.np_payouts%ROWTYPE;
  v_mapped text;
  -- Inline settlement (FINISHED path) mirrors 008's
  -- complete_payout_request step for step.
  v_req_status text;
  v_req_affiliate_id uuid;
  v_req_amount numeric(12, 2);
  v_req_currency char(3);
  v_reserved uuid[];
  v_payable numeric(12, 2);
  v_locked integer;
  v_flipped_count integer;
  v_transaction_id uuid;
  v_audit_proof text;
BEGIN
  -- M-09 (026): check the proof BEFORE the batch lookup. The old order
  -- leaked batch existence as no_data_found (404) vs bad proof (401);
  -- now every unauthenticated caller fails closed with 401.
  -- The proof subject is the batch id (present in the IPN body, so the
  -- Worker can compute it without a lookup).
  IF NOT public.np_check_proof(p_batch_id, p_proof) THEN
    RAISE EXCEPTION 'np_sync_payout_status: bad worker proof'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.np_payouts WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout batch not found: %', p_batch_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- C-01 (026): see np_confirm_deposit — the internal log_audit calls
  -- below need a valid proof because this path has no JWT.
  SELECT encode(extensions.hmac('log_audit', value, 'sha256'), 'hex')
    INTO v_audit_proof
    FROM public.worker_secrets
    WHERE key = 'np_ipn_proof';

  IF v_row.status = 'finished' THEN
    RETURN 'already_finished';
  END IF;

  -- Map NOWPayments batch statuses onto the local ones.
  v_mapped := CASE p_status
    WHEN 'FINISHED' THEN 'finished'
    WHEN 'REJECTED' THEN 'rejected'
    WHEN 'REJECTED_NOT_CHECKED' THEN 'rejected'
    WHEN 'PROCESSING' THEN 'processing'
    WHEN 'WAITING' THEN 'awaiting_2fa'
    WHEN 'CREATING' THEN 'created'
    WHEN 'NEW' THEN 'created'
    ELSE NULL
  END;
  IF v_mapped IS NULL THEN
    RAISE EXCEPTION 'np_sync_payout_status: unknown NOWPayments status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.np_payouts SET status = v_mapped WHERE batch_id = p_batch_id;

  IF v_mapped = 'finished' THEN
    -- Settle inline: the settlement steps mirror 008's
    -- complete_payout_request exactly (payable-sum check, insert the
    -- payout_transactions row, flip ledger payable -> paid, request ->
    -- paid, audit). It is inlined rather than called because 011 fixed
    -- the 008 admin gate to reject no-JWT callers — and this
    -- proof-gated path has no JWT. The proof check above IS the
    -- authorization for this path. reviewed_by is left as the admin who
    -- approved (complete_payout_request would overwrite it with NULL).
    SELECT status, affiliate_id, amount, currency, reserved_ledger_row_ids
      INTO v_req_status, v_req_affiliate_id, v_req_amount, v_req_currency, v_reserved
      FROM public.payout_requests
      WHERE id = v_row.payout_request_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payout request not found: %', v_row.payout_request_id
        USING ERRCODE = 'no_data_found';
    END IF;
    IF v_req_status <> 'approved' THEN
      RAISE EXCEPTION 'payout request % cannot be completed from status % (only approved can be completed)', v_row.payout_request_id, v_req_status
        USING ERRCODE = 'check_violation';
    END IF;

    -- M-09 (026): requests approved before 019 carry no reservation.
    -- Refuse rather than fall back to the bulk flip: the admin rejects
    -- and re-approves (which records the reservation). Zero such
    -- requests exist live.
    IF v_reserved IS NULL OR array_length(v_reserved, 1) IS NULL THEN
      RAISE EXCEPTION 'payout request % was approved before reservation tracking — reject it and re-approve so the reserved ledger rows are recorded', v_row.payout_request_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- M-09 (026): lock exactly the reserved rows and re-check the sum
    -- (and the count) BEFORE inserting the transaction — mirror of
    -- complete_payout_request (019b). A concurrent settlement of
    -- another request blocks on these row locks; a reserved row that is
    -- no longer payable fails here instead of silently over-paying.
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
      INTO v_payable, v_locked
      FROM (
        SELECT amount FROM public.commission_ledger
        WHERE id = ANY(v_reserved)
          AND status = 'payable'
        FOR UPDATE
      ) s;

    IF v_locked <> array_length(v_reserved, 1) THEN
      RAISE EXCEPTION 'payout request % ($% %) has % of % reserved ledger rows still payable — reject and re-approve it', v_row.payout_request_id, v_req_amount, v_req_currency, v_locked, array_length(v_reserved, 1)
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_payable <> v_req_amount THEN
      RAISE EXCEPTION 'payout request % ($% %) no longer matches the reserved payable balance ($% %) — reject and re-approve it', v_row.payout_request_id, v_req_amount, v_req_currency, v_payable, v_req_currency
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.payout_transactions
      (payout_request_id, affiliate_id, amount, currency, status, provider, transaction_ref, paid_at)
      VALUES (v_row.payout_request_id, v_req_affiliate_id, v_req_amount, v_req_currency, 'completed', 'NOWPayments', p_batch_id, now())
      RETURNING id INTO v_transaction_id;

    -- M-09 (026): flip ONLY the reserved ids (019c). Rows reserved for
    -- another approved request stay 'payable' even though they belong
    -- to the same affiliate+currency.
    UPDATE public.commission_ledger
      SET status = 'paid'
      WHERE id = ANY(v_reserved)
        AND status = 'payable';
    GET DIAGNOSTICS v_flipped_count = ROW_COUNT;
    IF v_flipped_count <> array_length(v_reserved, 1) THEN
      RAISE EXCEPTION 'payout request % flipped % of % reserved ledger rows to paid — aborting settlement', v_row.payout_request_id, v_flipped_count, array_length(v_reserved, 1)
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.payout_requests
      SET status = 'paid', reviewed_at = now()
      WHERE id = v_row.payout_request_id;
    PERFORM public.log_audit(
      NULL,
      'payout.completed',
      'payout',
      v_row.payout_request_id,
      jsonb_build_object(
        'affiliate_id', v_req_affiliate_id,
        'amount', v_req_amount,
        'currency', v_req_currency,
        'transaction_id', v_transaction_id,
        'provider', 'NOWPayments',
        'transaction_ref', p_batch_id,
        'from_status', 'approved',
        'to_status', 'paid'
      ),
      v_audit_proof
    );
    PERFORM public.log_audit(
      NULL,
      'payout.np_finished',
      'payout',
      v_row.payout_request_id,
      jsonb_build_object('batch_id', p_batch_id, 'affiliate_id', v_row.affiliate_id),
      v_audit_proof
    );
  ELSIF v_mapped = 'rejected' THEN
    PERFORM public.np_release_reservation(v_row.payout_request_id);
    PERFORM public.log_audit(
      NULL,
      'payout.np_rejected',
      'payout',
      v_row.payout_request_id,
      jsonb_build_object('batch_id', p_batch_id, 'affiliate_id', v_row.affiliate_id),
      v_audit_proof
    );
  END IF;

  RETURN v_mapped;
END;
$function$;

-- ---------------------------------------------------------------------------
-- H-01: np_release_reservation is an internal helper only. Revoke EXECUTE
-- from PUBLIC/anon/authenticated; postgres + service_role keep it. The
-- SECURITY DEFINER callers (np_sync_payout_status on rejection,
-- np_release_payout_reservation admin wrapper) call it as the definer.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.np_release_reservation(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- H-03: payout currency allowlist at the save layer. The ledger is
-- USD-only and payouts go out as USDT TRC20; the wallet currency column
-- is affiliate-writable (RLS update-own), so constrain it at the DB.
-- The Worker enforces the same allowlist at execution time.
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliate_profiles
  ADD CONSTRAINT affiliate_profiles_payout_currency_check
  CHECK (payout_currency = 'usdttrc20');
