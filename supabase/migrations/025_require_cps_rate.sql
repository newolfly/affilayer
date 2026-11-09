-- ============================================================================
-- AffiLayer — supabase/migrations/025_require_cps_rate.sql
--
-- Phase 1 item 1.3 — M-05 (forensic audit 9 Nov 2026): CPS commission is
-- invisible and misrepresented in the web UI.
--
--   * `apps/web/src/lib/data.ts` mapOffer dropped `rate_bps`, so the UI
--     showed a CPS offer's SALE value ($12) as if it were the payout —
--     the real commission is payout * rateBps / 10000 ($1.20 at 10%).
--   * `computeStats` summed conversion payout as both "revenue" and
--     "commission", overstating affiliate revenue up to 10x for CPS.
--   * CPS with `rate_bps` NULL paid $0 silently (shared
--     computeCommission treated a missing rate as 0), and the DB had no
--     CHECK requiring a rate for CPS.
--
-- Fix (this migration, DB layer only — app changes ride alongside it):
--   * CPS offers MUST carry a rate: rate_bps NOT NULL and > 0. Other
--     models are unaffected (their rate_bps stays NULL; the pre-existing
--     007 range CHECK 0..10000 still bounds any rate that is present).
--   * No live CPS offer exists without a rate (verified 9 Nov 2026:
--     the only live offer is a CPA row, and the CPS-without-rate query
--     returns zero rows), so ADD CONSTRAINT succeeds immediately.
--   * The app layers enforce the same rule independently: createOffer
--     and the advertiser form reject a CPS rate <= 0, the Worker /
--     tracking service reject a rateless-CPS conversion with 422 before
--     recording it, and shared computeCommission THROWS for rateless
--     CPS instead of paying $0.
-- ============================================================================

ALTER TABLE public.offers
  ADD CONSTRAINT offers_cps_requires_rate
  CHECK (payout_model <> 'CPS' OR (rate_bps IS NOT NULL AND rate_bps > 0));
