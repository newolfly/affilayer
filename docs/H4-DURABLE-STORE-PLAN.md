# H-4 Durable Worker store — plan (8 Nov 2026)

## Problem (audit H-4)

The live tracking Worker keeps clicks, conversions and ledger entries in
per-isolate memory. They vanish on isolate recycle, dedup only works
inside one isolate, and the dashboard never reads Worker data at all
(it computes stats from the local demo store only). Live-proven: two
302 clicks followed by GET /api/stats returning all zeros (different
isolate). No real traffic until this is fixed.

## Design decisions

1. **Postgres (Supabase) is the durable store, not Durable Objects.**
   The tables already exist (migration 001: clicks, conversions,
   commission_ledger) with the right unique indexes, and the schema
   comment already says clicks are "written by the tracking service
   (service role) ONLY". A Durable Object would duplicate that schema
   and leave the dashboard with no way to read the data (the Worker
   stats endpoint is operator-gated and the browser cannot hold the
   operator token).

2. **No service_role key leaves the dashboard.** The Worker writes via
   new SECURITY DEFINER RPC functions (migration 007), callable with
   the publishable anon key — the same pattern 003 already uses for
   approve_conversion / reject_conversion / log_audit. The functions
   validate server-side (currency allowlist, payout cap, offer must
   exist and be active, click must exist) and do the inserts. The anon
   key is already public in the web bundle; nothing new is secret.
   The Worker sends SUPABASE_URL + SUPABASE_ANON_KEY as wrangler
   `[vars]` (both public values), never as secrets.

3. **Hybrid routing: demo stays in-memory, real is durable.**
   Demo offers (demo-offer-1/2/3) have text ids and do not exist in
   the offers table; conversions.offer_id is NOT NULL uuid, so a demo
   conversion cannot go to Postgres at all. The Worker routes by offer
   id: demo ids → existing InMemoryStore (demo is explicitly not real);
   UUIDs → look the offer up in Supabase, then SupabaseStore.
   Postback configs/events stay in-memory inside the Worker (delivery
   records, not financial truth); SupabaseStore delegates those methods
   to an internal InMemoryStore.

4. **Dedup (audit M-1) gets its durable backstop here.** The functions
   use ON CONFLICT DO NOTHING on click_id / idempotency_key, and the
   (click_id, offer_id) partial unique index covers the second path.
   A conflict returns the existing row with duplicate=true instead of
   a 500.

## What gets built

1. Migration 007 (`supabase/migrations/007_tracking_rpc.sql`) — DONE 8 Nov
   ~06:15, statically verified (10 functions, dollar-quotes + parens
   balanced): `tracking_resolve_affiliate`, `tracking_get_offer`,
   `tracking_record_click`, `tracking_record_conversion`,
   `tracking_record_ledger_entry` (one entry per conversion, unique
   index), `tracking_get_click`, `tracking_list_clicks`,
   `tracking_list_conversions`, `tracking_list_offers`,
   `tracking_find_conversion`; plus `offers.rate_bps`. All SECURITY
   DEFINER with SET search_path = public.
2. Worker `SupabaseStore` (`services/tracking-worker/src/supabase-store.ts`,
   fetch-based PostgREST RPC calls, no new dependencies) + hybrid
   routing in `index.ts` (demo → memory, UUID → Supabase) + `[vars]`
   SUPABASE_URL / SUPABASE_ANON_KEY — DONE 8 Nov ~06:16. Worker tsc
   clean, smoke 22/22, vitest 25/25.
3. Dashboard wiring (second half of H-4): in Supabase mode the
   affiliate/advertiser/admin dashboards read clicks, conversions and
   ledger from Supabase via RLS instead of the demo store.
   — NOT DONE yet.
4. Tests: shared logic checks + smoke test keeps the in-memory path;
   the Supabase path is verified by applying 007 in the SQL editor
   and calling the RPCs directly, then by a live Worker probe once a
   real offer exists (none exists yet — no real advertiser account).
5. Deploy Worker (fresh Cloudflare token) + live-verify demo path
   unchanged.

## Known limitations (accepted for the MVP)

- SmartLink cap enforcement calls `listClicks()` (up to 1000 rows
  from Postgres) on every SmartLink request — a round-trip per click.
  Fine at low volume; a count RPC is the later optimisation.
- The operator stats endpoint merges demo + Supabase rows (capped at
  1000 each). Real stats at volume come from the dashboard's Supabase
  reads, not the operator endpoint.
- Direct RPC calls with the public anon key can fabricate *pending*
  conversions (they need a real click + real offer, and nothing becomes
  payable without admin approval). Rate limiting stays in the Worker.

## Verification checklist

- [ ] 007 applies clean in the SQL editor (project owner session).
- [ ] RPC calls: record_click twice with same click_id → second is
      duplicate, one row. record_conversion with unknown click → error.
      Bad currency / payout > 10000 → error. Unknown offer → error.
- [ ] Worker tsc clean; smoke 22/22 (in-memory path unchanged).
- [ ] Live: demo-offer-1 click still 302s; /api/stats still 401
      without token; no demo behaviour change.
- [ ] Dashboard (Supabase mode) shows rows written by the Worker —
      provable only once a real offer + real affiliate exist.

## Open (not decided here)

- Real offers need a real advertiser account + organisation; none
  exists yet. The Supabase path cannot be proven end-to-end live
  until one does.
- Postback configs/events durability: deliberately out of scope.
