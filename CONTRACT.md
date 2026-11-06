# AffiLayer — integration contract (read first, all builders)

## Monorepo
- npm workspaces: `apps/web`, `services/tracking`, `packages/shared`.
- Package names: `@affilayer/web`, `@affilayer/tracking`, `@affilayer/shared`.
- TypeScript strict. Node >= 20. No secrets committed; env via `.env.example` files only.

## packages/shared — @affilayer/shared (pure TS, no Node-only deps)
Exports (exact names):
- Types: `Role` ('super_admin'|'network_manager'|'advertiser'|'affiliate'),
  `OfferStatus` ('active'|'paused'|'expired'), `ConversionStatus` ('pending'|'approved'|'rejected'|'reversed'),
  `PayoutModel` ('CPA'|'CPL'|'CPS'|'CPC'), `Offer`, `Campaign`, `Click`, `Conversion`,
  `CommissionLedgerEntry`, `PayoutRequest`, `TrackingStep`, `SmartLinkRule`, `FraudSignal`.
- `computeCommission(payout: number, model: PayoutModel, rateBps?: number): number`
  (CPA/CPL = payout; CPS = payout * rateBps/10000; CPC = payout).
- `expandPostbackMacros(template: string, vars: Record<string,string>): string`
  macros: {click_id} {conversion_id} {payout} {currency} {status} {sub1}
- `generateClickId(): string` — `clk_` + 24 hex chars (crypto.getRandomValues, isomorphic).
- `isOfferEligible(offer, ctx: {country?: string; device?: string; trafficSource?: string}): boolean`
  (checks status, countries, devices, trafficSources, caps not exceeded when provided).
- `smartlinkPick(offers, ctx): Offer | null` — deterministic: eligible offers sorted by
  (payout desc, id asc), pick first. No AI language anywhere.
- `detectFraudSignals(clicks: {ip, userAgent, createdAt}[]): FraudSignal[]` — pure rules:
  duplicate click_id, >10 clicks same IP in 60s, empty user agent. Never auto-reject.
- `ledgerTransition(from: ConversionStatus, to: ConversionStatus): boolean` — allowed
  transitions only: pending->approved|rejected, approved->reversed, rejected->(none), reversed->(none).

## services/tracking — @affilayer/tracking (Fastify, TS)
- `npm run dev` (tsx watch), `npm run build` (tsc), `npm test` (vitest).
- Env: `PORT` (default 3001), `TRACKING_BASE_URL` (default http://localhost:3001),
  `POSTBACK_SECRET` (HMAC key, required for /conversion signature check; tests set it),
  `DATABASE_URL` (optional; when unset use in-memory store).
- Store interface `src/store.ts`: `InMemoryStore` implements `Store` (clicks, conversions,
  postbackEvents, ledger). Postgres adapter file `src/pg-store.ts` may be a thin
  implementation over `pg` using the same interface; if DATABASE_URL unset, never import pg at runtime.
- Routes (exact):
  - `GET /health` -> `{ ok: true }`
  - `GET /c/:affiliateCode/:offerId` query `sub1..sub5`, `source` -> 302 to offer landing URL
    (offer data comes from the store; seed 2 demo offers in-memory when no DB).
    Records click with click_id, ip, user-agent, referrer, geo from `x-vercel-ip-country`
    or `cf-ipcountry` header or `geo` query (tests use query). Sets click id in redirect
    as `?click_id=...` appended to landing URL.
  - `GET /s/:smartlinkCode` query `country, device, source` -> deterministic pick via
    shared smartlinkPick, 302 to landing URL, records click with smartlink flag.
  - `POST /conversion` JSON `{ click_id, offer_id, payout, currency, status?, idempotency_key, sub1? }`
    + header `x-affilayer-signature` = HMAC-SHA256 hex over raw body with POSTBACK_SECRET.
    400 on bad signature/missing fields. Dedup: same idempotency_key OR same click_id+offer_id
    returns the original conversion (200, `duplicate: true`). Creates conversion (pending),
    commission ledger entry (pending), dispatches configured postbacks (record postback_events,
    retry up to 3 with backoff — implement `deliverPostbacks()`; actual HTTP fetch in try/catch).
  - `GET /api/stats` query `offer_id?, affiliate_code?, from?, to?, country?, device?, source?`
    -> server-side aggregation `{ clicks, unique_clicks, conversions, approved, rejected,
    pending, revenue, commission, epc, cr }`.
  - `GET /api/clicks/:clickId` -> click + attributed conversion (or 404).
- Tests (vitest, `npm test` must pass): attribution (click -> conversion linked),
  postback HMAC verification + macro expansion, idempotency/dedup, commission calc,
  ledger state transitions, SmartLink deterministic pick, fraud signal rules.
- No fake stats: stats come only from recorded events. No payment integration.

## apps/web — @affilayer/web (Vite + React + TS + Tailwind v4)
- `npm run dev` (vite), `npm run build` (tsc + vite build), `npm run preview`.
- Deps: react, react-dom, react-router-dom, @supabase/supabase-js, tailwindcss,
  @tailwindcss/vite. No other heavy deps; charts = small custom SVG components in
  `src/components/charts.tsx`.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TRACKING_URL`
  (default http://localhost:3001). NEVER a service-role key in the browser.
- Data layer `src/lib/data.ts`: if Supabase env is set, use Supabase client;
  otherwise DEMO MODE with clearly labeled demo data (every demo page shows a
  "Demo data — not real" banner; demo data lives in `src/lib/demo-data.ts` and is
  explicitly fake/sample). Auth: Supabase email/password when configured; in demo
  mode a role-picker login (clearly labeled demo) that sets a local role.
- Routes (react-router):
  Public: `/` Home, `/about`, `/advertisers`, `/affiliates`, `/how-it-works`,
  `/contact`, `/terms`, `/privacy`.
  Auth: `/login`, `/register`, `/onboarding` (role + profile + traffic source +
  vertical + GEO + volume + payment profile), `/pending` (approval status).
  App (role-guarded): `/app/affiliate/*` (dashboard, offers, offer detail + apply,
  my-campaigns, tracking-links [generator using TRACKING_URL /c/{code}/{offer}],
  reports, postbacks, earnings, payouts, profile, tickets),
  `/app/advertiser/*` (dashboard, campaigns, create-offer, affiliates, conversions,
  reports, billing), `/app/admin/*` (overview, users, affiliates, advertisers,
  offers, campaigns, conversions, fraud, ledger, payouts, compliance, audit-logs, settings).
- UI: dark navy (#0B1220 / slate-900) background, white content cards, dense tables,
  filters on reports (date range, affiliate, advertiser, offer, country, device, source),
  responsive. No fake real-world stats; numbers come from demo data labeled as demo,
  or from the tracking service /api/stats when configured.
- No "AI optimization" or "guaranteed earnings" language anywhere.

## supabase/migrations
- `001_schema.sql`: all 19 tables from the brief (profiles, organizations,
  affiliate_profiles, advertiser_profiles, campaigns, offers, offer_applications,
  affiliate_offer_access, tracking_links, clicks, conversions, postback_configs,
  postback_events, commission_ledger, payout_requests, payout_transactions,
  fraud_events, compliance_reviews, support_tickets, audit_logs).
  UUID PKs (gen_random_uuid()), FKs, created_at/updated_at timestamps, CHECK
  constraints (payout models, statuses, amounts >= 0), unique indexes for dedup
  (conversions: idempotency_key; conversions: click_id+offer_id+action unique
  where not reversed), indexes for reporting filters.
- `002_rls.sql`: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policies for every
  user-facing table. Rule: users see only their own rows (auth.uid() = user_id or
  via organization membership); admins (role in profiles = super_admin/network_manager)
  see all; tracking/financial write tables (clicks, conversions, commission_ledger,
  postback_events, payout_transactions) deny direct INSERT/UPDATE from authenticated
  users (service-role only) — enforce with policies that allow SELECT for owners
  but no INSERT/UPDATE/DELETE for `authenticated`.
- `003_functions.sql`: `updated_at` trigger fn, immutable-ledger trigger (raise if
  UPDATE/DELETE on commission_ledger), balance view `affiliate_balances`
  (pending/approved/payable from ledger), `approve_conversion`/`reject_conversion`
  security-definer functions with state-transition checks + audit_logs insert.
- `004_seed.sql`: DEMO DATA ONLY, clearly commented as demo. A few demo orgs/users
  (passwords NOT included — auth users must be created via Supabase Auth), 3 demo
  offers, demo clicks/conversions/ledger rows. Never presented as real.
- Also `supabase/README.md`: how to apply (`supabase db push` / SQL editor), and a
  `tests/rls-checks.sql` file with SELECT assertions a human can run (each check
  commented with expected result) — RLS cannot be fully tested without a live DB.

## Docs (parent will write root README/DEPLOYMENT; children write their own READMEs)
- Each package writes a short README.md in its own folder (run/build/test, env).
