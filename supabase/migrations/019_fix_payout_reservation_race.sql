-- ============================================================================
-- AffiLayer — supabase/migrations/019_fix_payout_reservation_race.sql
--
-- M-06 (forensic audit 9 Nov 2026) — payout approve/complete ledger
-- reservation is not atomic + M-04 recurrence (bulk paid-flip).
--   approve_payout_request locked only the payout-request row; its
--   reservation loop SELECTed 'approved' ledger rows with no FOR UPDATE
--   and flipped them with no status guard, so two concurrent approvals
--   for the same affiliate+currency could reserve the same rows.
--   complete_payout_request summed 'payable' rows without locking, then
--   inserted the payout_transactions row and flipped ALL payable rows
--   for the affiliate+currency to 'paid' — so completing request A also
--   paid rows reserved for request B, while only A's transaction
--   existed. (P1-11: flip only the specific row ids reserved at
--   approval time, already collected in v_flipped.)
--   Fix:
--     (a) approval reservation loop SELECTs the approved rows FOR
--         UPDATE and flips each with an AND status='approved' guard
--         (a lost race raises instead of double-reserving);
--     (b) complete locks exactly the reserved rows and re-checks the
--         sum (and the row count) before inserting the transaction;
--     (c) complete flips ONLY the row ids stored at approval time in
--         the new payout_requests.reserved_ledger_row_ids column —
--         never a bulk affiliate+currency flip.
--   Reservation ids are persisted on the request (not only in the
--   audit-log details) so complete() can prove which rows it owns.
--   A request approved before this migration (reserved ids NULL) is
--   refused at complete time with 'reject and re-approve': zero such
--   requests exist live at apply time (all live requests are paid or
--   rejected), so nothing is stranded.
--
-- THE $12.02 (M-04, item 5) — cause, proven from audit_logs + the live
-- tables on 9 Nov 2026 (NOT a race, NOT a bulk-flip over-pay):
--   Ledger 'paid' $24.05 vs payout_transactions 'completed' $12.03.
--   Three completed test payouts had their payout_requests AND
--   payout_transactions rows deleted during 8 Nov test cleanup, while
--   their ledger rows are immutable/undeletable and stayed 'paid':
--     * req 139feb32 (TEST-001 $12.00, completed 14:34, txn 3db7c7c8)
--       -> orphan paid ledger row 22222222-2222-4000-8000-000000000101
--       ($12.00; reserved ids in the audit row prove it was this req).
--     * req 6dc36e36 (ED2E63 $0.01, completed 21:33, txn 675fd26d)
--       -> orphan paid ledger row 44444444-4444-4000-8000-000000000201
--       ($0.01).
--     * req a0000001 (TEST-001 $0.01, completed 22:48, txn eab803d5)
--       -> orphan paid ledger row 46e8059d-0d91-4707-9087-e3d9351aa656
--       ($0.01).
--   $12.00 + $0.01 + $0.01 = $12.02. The surviving payouts are all
--   fully backed (ef604df3 $12.01 -> rows 7d76a559 $0.01 + 2ca01188
--   $12.00; DLNAWY 2 x $0.01). The reconciliation query's section A
--   attributes TEST-001's $12.01 difference to the OLDEST paid rows
--   (22222222 $12.00 + 7d76a559 $0.01) by running total; the audit
--   trail shows the true orphan set is 22222222 + 46e8059d (7d76a559
--   IS backed by ef604df3's transaction). Same $12.01 total either
--   way. These are test-data residue: historical ledger rows are NOT
--   rewritten by this migration. Recurrence of the bulk-flip class is
--   closed by (c) above; recurrence of the deletion class is a
--   process rule (never delete payout_requests/transactions rows for
--   a completed payout — ledger rows cannot follow them).
-- ============================================================================

-- The reservation: which ledger rows an approved request owns.
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS reserved_ledger_row_ids uuid[];

-- ---------------------------------------------------------------------------
-- approve_payout_request — pending -> approved; reserves ledger rows.
-- (Full redefinition from the live def incl. 011 admin gate and 015
-- errcodes; changes vs live: FOR UPDATE reservation loop, status
-- guard on the flip, reserved ids persisted on the request.)
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
  -- M-06 (019): the reservation SELECT locks the rows (FOR UPDATE), so
  -- a concurrent approval for the same affiliate+currency blocks until
  -- this one commits, then re-reads and sees these rows as 'payable'
  -- (no longer 'approved') and cannot reserve them again.
  FOR v_row IN
    SELECT id, amount FROM public.commission_ledger
    WHERE affiliate_id = v_affiliate_id
      AND currency = v_currency
      AND status = 'approved'
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_covered >= v_amount;
    -- Belt-and-braces status guard: with the row lock held this
    -- cannot lose a race, but a lost race must raise, never flip.
    UPDATE public.commission_ledger SET status = 'payable'
      WHERE id = v_row.id AND status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payout request % lost the reservation race on ledger row % — retry the approval', p_request_id, v_row.id
        USING ERRCODE = 'check_violation';
    END IF;
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

  -- Persist the reservation on the request: complete() flips exactly
  -- these ids (019c), never a bulk affiliate+currency flip.
  UPDATE public.payout_requests
    SET status = 'approved', reviewed_by = p_actor, reviewed_at = now(),
        reserved_ledger_row_ids = v_flipped
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
-- complete_payout_request — approved -> paid.
-- (Full redefinition from the live def; changes vs live: locks exactly
-- the reserved rows and re-checks sum + count before inserting the
-- transaction; flips ONLY the reserved ids.)
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
  v_reserved uuid[];
  v_payable numeric(12, 2);
  v_locked integer;
  v_flipped_count integer;
  v_transaction_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'complete_payout_request: only admins may complete payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, amount, currency, reserved_ledger_row_ids
    INTO v_status, v_affiliate_id, v_amount, v_currency, v_reserved
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

  -- Requests approved before 019 carry no reservation. Refuse rather
  -- than fall back to the bulk flip: the admin rejects and re-approves
  -- (which records the reservation). Zero such requests exist live.
  IF v_reserved IS NULL OR array_length(v_reserved, 1) IS NULL THEN
    RAISE EXCEPTION 'payout request % was approved before reservation tracking — reject it and re-approve so the reserved ledger rows are recorded', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- M-06 (019b): lock exactly the reserved rows and re-check the sum
  -- (and the count) BEFORE inserting the transaction. A concurrent
  -- complete of another request blocks on these row locks; a reserved
  -- row that is no longer payable (already paid elsewhere) fails here
  -- instead of silently over-paying. The aggregate runs over a locked
  -- subquery (FOR UPDATE cannot sit on an aggregate directly).
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_payable, v_locked
    FROM (
      SELECT amount FROM public.commission_ledger
      WHERE id = ANY(v_reserved)
        AND status = 'payable'
      FOR UPDATE
    ) s;

  IF v_locked <> array_length(v_reserved, 1) THEN
    RAISE EXCEPTION 'payout request % ($% %) has % of % reserved ledger rows still payable — reject and re-approve it', p_request_id, v_amount, v_currency, v_locked, array_length(v_reserved, 1)
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_payable <> v_amount THEN
    RAISE EXCEPTION 'payout request % ($% %) no longer matches the reserved payable balance ($% %) — reject and re-approve it', p_request_id, v_amount, v_currency, v_payable, v_currency
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payout_transactions
    (payout_request_id, affiliate_id, amount, currency, status, provider, transaction_ref, paid_at)
    VALUES (p_request_id, v_affiliate_id, v_amount, v_currency, 'completed', p_provider, p_transaction_ref, now())
    RETURNING id INTO v_transaction_id;

  -- M-04 recurrence fix (019c): flip ONLY the reserved ids. Rows
  -- reserved for another approved request stay 'payable' even though
  -- they belong to the same affiliate+currency.
  UPDATE public.commission_ledger
    SET status = 'paid'
    WHERE id = ANY(v_reserved)
      AND status = 'payable';
  GET DIAGNOSTICS v_flipped_count = ROW_COUNT;
  IF v_flipped_count <> array_length(v_reserved, 1) THEN
    RAISE EXCEPTION 'payout request % flipped % of % reserved ledger rows to paid — aborting settlement', p_request_id, v_flipped_count, array_length(v_reserved, 1)
      USING ERRCODE = 'check_violation';
  END IF;

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
      'ledger_row_ids', v_reserved,
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
