-- ============================================================================
-- AffiLayer — supabase/reconciliation/ledger_reconciliation.sql
--
-- Read-only ledger reconciliation. Flags every mismatch between what the
-- ledger says was PAID and what payout_transactions says actually moved,
-- plus the known open items from the forensic audit (H-03 pending
-- affiliates holding paid ledger; the V2 legacy conversions with no
-- ledger row; the house affiliate).
--
-- How the money is supposed to flow (migration 008):
--   complete_payout_request() creates ONE payout_transactions row
--   (status 'completed', amount = request amount) and flips ALL of the
--   affiliate's 'payable' ledger rows for that currency to 'paid'.
--   So, per affiliate and currency, SUM(ledger WHERE status='paid')
--   must equal SUM(payout_transactions WHERE status='completed').
--   There is NO direct ledger<->transaction link (ledger rows carry no
--   payout_request_id), so matching is by per-affiliate totals; section
--   A lists the specific paid rows that cover the unmatched amount,
--   oldest first.
--
-- Usage (read-only; run as often as needed):
--   psql "$DATABASE_URL" -f supabase/reconciliation/ledger_reconciliation.sql
--   -- or paste into the Supabase SQL editor and run statement by statement.
--   Every statement is a SELECT. A clean run shows zero rows in sections
--   A, B, E, F, G and H, and zero differences in sections C and D.
--
-- Known live discrepancy (9 Nov 2026, must be flagged by this query):
--   ledger "paid" $24.05 vs payout_transactions "completed" $12.03
--   (AFF-TEST-001 alone: paid $24.02 vs paid-out $12.01).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Paid ledger rows with no backing completed payout transaction.
--    Per affiliate+currency: unmatched = paid_ledger_sum - completed_txn_sum.
--    Lists the affiliate's paid rows oldest-first with a running total;
--    rows whose running total is within the unmatched amount are the
--    specific rows with no backing transaction.
-- ---------------------------------------------------------------------------
WITH sums AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid_sum
  FROM public.commission_ledger GROUP BY affiliate_id, currency
), txns AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS txn_sum
  FROM public.payout_transactions GROUP BY affiliate_id, currency
), unmatched AS (
  SELECT s.affiliate_id, s.currency,
         s.paid_sum - COALESCE(t.txn_sum, 0) AS unmatched_amount
  FROM sums s LEFT JOIN txns t
    ON t.affiliate_id = s.affiliate_id AND t.currency = s.currency
  WHERE s.paid_sum - COALESCE(t.txn_sum, 0) > 0
), ranked AS (
  SELECT l.id AS ledger_id, l.affiliate_id, l.currency, l.amount,
         l.created_at,
         SUM(l.amount) OVER (PARTITION BY l.affiliate_id, l.currency
                             ORDER BY l.created_at, l.id) AS running_total,
         u.unmatched_amount
  FROM public.commission_ledger l
  JOIN unmatched u
    ON u.affiliate_id = l.affiliate_id AND u.currency = l.currency
  WHERE l.status = 'paid'
)
SELECT 'A-unmatched-paid-ledger' AS section,
       ap.affiliate_code, p.status AS profile_status,
       r.ledger_id, r.amount, r.currency, r.created_at,
       r.unmatched_amount
FROM ranked r
LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = r.affiliate_id
LEFT JOIN public.profiles p ON p.id = r.affiliate_id
WHERE r.running_total - r.amount < r.unmatched_amount
ORDER BY r.affiliate_id, r.created_at;

-- ---------------------------------------------------------------------------
-- B. Completed payout transactions with no backing ledger.
--    B1: transactions whose payout_request_id is missing or whose request
--        is not 'paid'. B2: affiliates whose completed txn sum exceeds
--        their paid ledger sum (over-paid). B3: transactions not completed.
-- ---------------------------------------------------------------------------
SELECT 'B1-txn-without-paid-request' AS section,
       t.id AS transaction_id, t.affiliate_id, t.amount, t.currency,
       t.status, t.payout_request_id, r.status AS request_status
FROM public.payout_transactions t
LEFT JOIN public.payout_requests r ON r.id = t.payout_request_id
WHERE t.status = 'completed'
  AND (r.id IS NULL OR r.status <> 'paid');

WITH sums AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid_sum
  FROM public.commission_ledger GROUP BY affiliate_id, currency
), txns AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS txn_sum
  FROM public.payout_transactions GROUP BY affiliate_id, currency
)
SELECT 'B2-overpaid-affiliate' AS section,
       ap.affiliate_code, t.currency,
       s.paid_sum, t.txn_sum, t.txn_sum - s.paid_sum AS overpaid_amount
FROM txns t
LEFT JOIN sums s
  ON s.affiliate_id = t.affiliate_id AND s.currency = t.currency
LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = t.affiliate_id
WHERE t.txn_sum > COALESCE(s.paid_sum, 0);

SELECT 'B3-txn-not-completed' AS section,
       t.id AS transaction_id, t.affiliate_id, t.amount, t.currency,
       t.status, t.payout_request_id
FROM public.payout_transactions t
WHERE t.status <> 'completed';

-- ---------------------------------------------------------------------------
-- C. Per-affiliate reconciliation: paid ledger vs completed payouts.
--    difference > 0 means paid ledger with no backing transaction;
--    difference < 0 means paid out more than the ledger records.
-- ---------------------------------------------------------------------------
WITH ledger AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid_sum,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_sum,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS approved_sum,
         COALESCE(SUM(amount) FILTER (WHERE status = 'payable'), 0) AS payable_sum,
         COALESCE(SUM(amount) FILTER (WHERE status = 'reversed'), 0) AS reversed_sum
  FROM public.commission_ledger GROUP BY affiliate_id, currency
), txns AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS txn_sum
  FROM public.payout_transactions GROUP BY affiliate_id, currency
), reqs AS (
  SELECT affiliate_id, currency,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS requests_paid_sum
  FROM public.payout_requests GROUP BY affiliate_id, currency
)
SELECT 'C-per-affiliate' AS section,
       ap.affiliate_code, p.status AS profile_status,
       COALESCE(l.currency, t.currency, r.currency) AS currency,
       COALESCE(l.paid_sum, 0) AS ledger_paid,
       COALESCE(t.txn_sum, 0) AS txns_completed,
       COALESCE(l.paid_sum, 0) - COALESCE(t.txn_sum, 0) AS difference,
       COALESCE(r.requests_paid_sum, 0) AS requests_paid,
       COALESCE(l.pending_sum, 0) AS ledger_pending,
       COALESCE(l.approved_sum, 0) AS ledger_approved,
       COALESCE(l.payable_sum, 0) AS ledger_payable,
       COALESCE(l.reversed_sum, 0) AS ledger_reversed
FROM ledger l
FULL OUTER JOIN txns t
  ON t.affiliate_id = l.affiliate_id AND t.currency = l.currency
FULL OUTER JOIN reqs r
  ON r.affiliate_id = COALESCE(l.affiliate_id, t.affiliate_id)
 AND r.currency = COALESCE(l.currency, t.currency)
LEFT JOIN public.affiliate_profiles ap
  ON ap.profile_id = COALESCE(l.affiliate_id, t.affiliate_id, r.affiliate_id)
LEFT JOIN public.profiles p
  ON p.id = COALESCE(l.affiliate_id, t.affiliate_id, r.affiliate_id)
ORDER BY difference DESC NULLS LAST, ap.affiliate_code;

-- ---------------------------------------------------------------------------
-- D. Global totals: the headline reconciliation.
-- ---------------------------------------------------------------------------
SELECT 'D-global' AS section,
       (SELECT COALESCE(SUM(amount), 0) FROM public.commission_ledger
         WHERE status = 'paid') AS ledger_paid_total,
       (SELECT COALESCE(SUM(amount), 0) FROM public.payout_transactions
         WHERE status = 'completed') AS txns_completed_total,
       (SELECT COALESCE(SUM(amount), 0) FROM public.commission_ledger
         WHERE status = 'paid')
       - (SELECT COALESCE(SUM(amount), 0) FROM public.payout_transactions
           WHERE status = 'completed') AS difference,
       (SELECT COALESCE(SUM(amount), 0) FROM public.payout_requests
         WHERE status = 'paid') AS requests_paid_total;

-- ---------------------------------------------------------------------------
-- E. Pending affiliates holding paid ledger (H-03: unvetted affiliates
--    must never accrue payable/paid commissions).
-- ---------------------------------------------------------------------------
SELECT 'E-pending-with-paid-ledger' AS section,
       ap.affiliate_code, p.email, p.status AS profile_status,
       l.status AS ledger_status, COUNT(*) AS rows, SUM(l.amount) AS amount,
       l.currency
FROM public.commission_ledger l
JOIN public.profiles p ON p.id = l.affiliate_id
LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = l.affiliate_id
WHERE p.status <> 'approved' AND l.status IN ('paid', 'payable', 'approved')
GROUP BY ap.affiliate_code, p.email, p.status, l.status, l.currency
ORDER BY amount DESC;

-- ---------------------------------------------------------------------------
-- F. House affiliate (AFF-HOUSE): must never have payout-related rows.
--    Its ledger rows are expected (bare-SmartLink conversions attribute
--    to the house); any payout_requests / payout_transactions row for it
--    is a guard failure.
-- ---------------------------------------------------------------------------
SELECT 'F-house-ledger' AS section,
       l.id AS ledger_id, l.status, l.amount, l.currency, l.created_at
FROM public.commission_ledger l
WHERE l.affiliate_id = '0918583c-1a3b-4566-975d-e65186c3d36a'
ORDER BY l.created_at;

SELECT 'F-house-payout-rows-MUST-BE-EMPTY' AS section,
       'payout_requests' AS source, r.id, r.amount, r.currency, r.status
FROM public.payout_requests r
WHERE r.affiliate_id = '0918583c-1a3b-4566-975d-e65186c3d36a'
UNION ALL
SELECT 'F-house-payout-rows-MUST-BE-EMPTY' AS section,
       'payout_transactions' AS source, t.id, t.amount, t.currency, t.status
FROM public.payout_transactions t
WHERE t.affiliate_id = '0918583c-1a3b-4566-975d-e65186c3d36a';

-- ---------------------------------------------------------------------------
-- G. Negative amounts / negative balances.
-- ---------------------------------------------------------------------------
SELECT 'G-negative-amount' AS section,
       'commission_ledger' AS source, l.id, l.affiliate_id, l.amount,
       l.currency, l.status
FROM public.commission_ledger l WHERE l.amount < 0
UNION ALL
SELECT 'G-negative-amount' AS section,
       'payout_requests' AS source, r.id, r.affiliate_id, r.amount,
       r.currency, r.status
FROM public.payout_requests r WHERE r.amount < 0
UNION ALL
SELECT 'G-negative-amount' AS section,
       'payout_transactions' AS source, t.id, t.affiliate_id, t.amount,
       t.currency, t.status
FROM public.payout_transactions t WHERE t.amount < 0;

WITH balances AS (
  SELECT affiliate_id,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'approved', 'payable')), 0)
           AS outstanding
  FROM public.commission_ledger GROUP BY affiliate_id
)
SELECT 'G-negative-balance' AS section,
       ap.affiliate_code, b.outstanding
FROM balances b
LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = b.affiliate_id
WHERE b.outstanding < 0;

-- ---------------------------------------------------------------------------
-- H. Conversions with no ledger row (V2 legacy: the ledger write was
--    never retried on the duplicate path; these conversions can never
--    become payable).
-- ---------------------------------------------------------------------------
SELECT 'H-conversion-without-ledger' AS section,
       c.id AS conversion_id, c.affiliate_id, ap.affiliate_code,
       c.payout AS conversion_payout, c.currency, c.status,
       c.created_at
FROM public.conversions c
LEFT JOIN public.commission_ledger l ON l.conversion_id = c.id
LEFT JOIN public.affiliate_profiles ap ON ap.profile_id = c.affiliate_id
WHERE l.id IS NULL
ORDER BY c.created_at;
