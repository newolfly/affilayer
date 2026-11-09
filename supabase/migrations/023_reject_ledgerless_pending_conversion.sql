-- ============================================================================
-- AffiLayer — supabase/migrations/023_reject_ledgerless_pending_conversion.sql
--
-- Phase 1 item 1.1 (9 Nov 2026) — resolve the 3 ledger-less conversions
-- listed by supabase/reconciliation/ledger_reconciliation.sql section H.
--
-- DECISIONS (verified live before applying; all three re-checked 9 Nov 23:0x):
--
-- #1  a71d67a0-a2bc-4344-8954-3bac90e07cc0 — REJECTED by this migration.
--     Conversion was 'pending', $12.00 USD, idempotency 'reg-20261109-02',
--     affiliate 57e5841c-ff7d-479c-9208-b29c38dbafbb (AFF-TEST-001),
--     offer dddddddd-0000-4000-8000-000000000101 (H-5 test offer),
--     created 8 Nov 22:27. V2-era conversion whose ledger row was never
--     written (Worker crashed between recordConversion and
--     recordLedgerEntry; the duplicate-path backfill in
--     services/tracking-worker/src/index.ts did not exist yet).
--     REJECT, not backfill, because:
--       * The affiliate's profiles.status is 'pending' — NEVER approved.
--         Migration 022 now gates tracking_record_conversion on
--         profiles.status = 'approved'. Backfilling a $12.00 ledger row
--         would create exactly the H-03 violation 022 was written to
--         stop (a pending, unvetted affiliate accruing payable
--         commission — AFF-TEST-001 already holds $24.02 paid ledger
--         from the pre-gate era). A backfilled row would flow
--         pending -> approved -> payable -> paid: $12 of real money
--         owed to an unvetted test affiliate.
--       * The conversion is test data (H-5 test offer, reg-20261109-02),
--         not real advertiser traffic; nothing was ever delivered.
--     This is the audit's P1-7 "backfill or reject" sanction, resolved
--     as REJECT. Effect: conversion pending -> rejected (a conversion-
--     status change, NOT a ledger edit — no ledger row exists for it
--     and none is created). Any pending ledger row for it would flip
--     to 'rejected' too (there is none; the UPDATE is a no-op guard).
--     The reason is recorded in the audit_logs details below — the
--     stock reject_conversion() RPC carries no reason parameter, and
--     it cannot be called here anyway: the LIVE function gates on
--     `auth.uid() IS NULL OR NOT is_admin()` (hardened after 003),
--     so a no-JWT direct-DB / SQL-editor call always raises
--     insufficient_privilege (proven by dry-run 9 Nov, rolled back).
--     This migration performs the RPC's exact updates directly as DB
--     owner, plus the audit row with the reason.
--
-- #2  f95a4ce4-1e09-47de-8303-04d138b75058 — NO ACTION (already terminal).
--     Status 'reversed', $0.01, idempotency 'audit-hole-2', affiliate
--     AFF-DLNAWY. Reversed is terminal per migration 003 (ledger
--     pipeline pending -> approved -> payable -> paid, with reversed /
--     rejected terminal; approve/reject_conversion only accept
--     pending). A reversed conversion can never become payable, so no
--     ledger row is expected or wanted. This migration only ASSERTS it
--     is still 'reversed' and has no ledger row, and fails loudly if
--     that ever changes.
--
-- #3  72c244fe-f00d-417c-8832-4f79fdb127ee — NO ACTION (already terminal).
--     Status 'rejected', $0.01, idempotency 'audit-flow-3', same
--     affiliate as #2. Same reasoning as #2. Asserted, not touched.
--
-- EXPECTED RESULT: section H shows 0 rows afterwards (all three
-- conversions are now either rejected/reversed, i.e. expected-no-
-- ledger, or — for #1 — rejected with the reason on file here and in
-- audit_logs). No historical ledger row is edited, created, or
-- deleted by this migration (0 ledger rows exist for all three).
--
-- Idempotent: re-running is a no-op once #1 is 'rejected' (the audit
-- insert is guarded by NOT EXISTS). If #1 is in any status other than
-- 'pending'/'rejected', or #2/#3 are not reversed/rejected, the
-- migration raises instead of silently proceeding.
-- ============================================================================

DO $$
DECLARE
  v_status_1 text;
  v_status_2 text;
  v_status_3 text;
  v_ledger_count integer;
BEGIN
  -- --- #1: reject the pending V2 conversion for the never-approved affiliate.
  SELECT status INTO v_status_1
    FROM public.conversions
    WHERE id = 'a71d67a0-a2bc-4344-8954-3bac90e07cc0'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '023: conversion a71d67a0-a2bc-4344-8954-3bac90e07cc0 not found';
  END IF;

  IF v_status_1 = 'pending' THEN
    UPDATE public.conversions
      SET status = 'rejected'
      WHERE id = 'a71d67a0-a2bc-4344-8954-3bac90e07cc0';

    -- Mirror reject_conversion(): flip any pending ledger row for it.
    -- Expected 0 rows (none ever existed); the guard keeps this correct
    -- if a row appears between verification and apply.
    UPDATE public.commission_ledger
      SET status = 'rejected'
      WHERE conversion_id = 'a71d67a0-a2bc-4344-8954-3bac90e07cc0'
        AND status = 'pending';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    SELECT 'ec5a6910-d83c-4e13-aaf0-318ebf5d359e', 'conversion.rejected', 'conversion',
           'a71d67a0-a2bc-4344-8954-3bac90e07cc0',
           jsonb_build_object(
             'affiliate_id', '57e5841c-ff7d-479c-9208-b29c38dbafbb',
             'affiliate_code', 'AFF-TEST-001',
             'payout', 12.00,
             'currency', 'USD',
             'idempotency_key', 'reg-20261109-02',
             'offer_id', 'dddddddd-0000-4000-8000-000000000101',
             'from_status', 'pending',
             'to_status', 'rejected',
             'reason', 'V2-era ledger-less conversion (8 Nov 22:27, no ledger row ever written). REJECTED, not backfilled: affiliate AFF-TEST-001 was never approved (profiles.status=pending); migration 022 gates record_conversion on approved status, so a $12.00 payable ledger row for a pending affiliate would recreate the H-03 violation. Test data (H-5 test offer), no advertiser delivery. P1-7 sanction resolved as reject. No ledger row created, edited, or deleted.',
             'migration', '023_reject_ledgerless_pending_conversion',
             'reconciliation', 'section H item 1 of 3'
           )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.audit_logs
      WHERE entity_id = 'a71d67a0-a2bc-4344-8954-3bac90e07cc0'
        AND action = 'conversion.rejected'
    );

    RAISE NOTICE '023: conversion a71d67a0 rejected (was pending, $12.00, AFF-TEST-001 pending affiliate)';
  ELSIF v_status_1 = 'rejected' THEN
    RAISE NOTICE '023: conversion a71d67a0 already rejected — no-op (idempotent re-run)';
  ELSE
    RAISE EXCEPTION '023: conversion a71d67a0 in unexpected status % (expected pending or rejected)', v_status_1;
  END IF;

  -- --- #2 / #3: assert still terminal with no ledger row; touch nothing.
  SELECT status INTO v_status_2
    FROM public.conversions WHERE id = 'f95a4ce4-1e09-47de-8303-04d138b75058';
  IF v_status_2 IS DISTINCT FROM 'reversed' THEN
    RAISE EXCEPTION '023: conversion f95a4ce4 expected reversed, found %', v_status_2;
  END IF;

  SELECT status INTO v_status_3
    FROM public.conversions WHERE id = '72c244fe-f00d-417c-8832-4f79fdb127ee';
  IF v_status_3 IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION '023: conversion 72c244fe expected rejected, found %', v_status_3;
  END IF;

  SELECT COUNT(*) INTO v_ledger_count
    FROM public.commission_ledger
    WHERE conversion_id IN (
      'a71d67a0-a2bc-4344-8954-3bac90e07cc0',
      'f95a4ce4-1e09-47de-8303-04d138b75058',
      '72c244fe-f00d-417c-8832-4f79fdb127ee'
    );
  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION '023: expected 0 ledger rows for the three conversions, found %', v_ledger_count;
  END IF;

  RAISE NOTICE '023: #2 reversed and #3 rejected confirmed terminal, 0 ledger rows — no action taken';
END;
$$;
