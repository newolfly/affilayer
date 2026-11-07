# AffiLayer — Forensic Code + Infrastructure Audit (Agent B)

- **Date:** 2026-11-07 (Asia/Dhaka)
- **Scope:** repo `~/workspace/affilayer`, branch `main`, HEAD `4fab5fe` ("Job 5: universal public demo login")
- **Method:** read-only static audit. Every finding cites file + line evidence read from the actual code. Nothing was executed against a live database (the Supabase backend is not live yet) and no live endpoint was called. No changes, no deploys, no payments.
- **What was read:** all of `apps/web/src`, `packages/shared/src`, `services/tracking/src`, `services/tracking-worker/src`, `supabase/migrations/001–004`, `supabase/tests/rls-checks.sql`, `apps/docs/*`, `docs/DEPLOYMENT.md`, `CONTRACT.md`, all `package.json` files, `.gitignore`, and `git log --all -p` (secret scan).
- **No secret values are reproduced in this document** (names and locations only).

## Verdict

**Do NOT wire up the Supabase backend as-is.** One critical privilege-escalation hole (C1) lets any signed-in user promote themselves to `super_admin` through the public anon key, which defeats every other RLS control in the schema. Fix C1 before any real user signs up. The demo-mode web app and the tracking Worker are otherwise honest about their limits, but the live Worker is an ephemeral in-memory tracker (H3) and the docs make one false claim about signed postbacks (H2). Supabase-mode admin financial actions are entirely unwired (H4).

## Severity counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 4 |
| Medium | 7 |
| Low | 13 |
| Pass (verified good) | 8 groups |
| Unverified (could not check) | 5 |

---

## CRITICAL

### C1 — Any authenticated user can promote themselves to `super_admin` (privilege escalation via RLS policy)

**Evidence:**

- `supabase/migrations/002_rls.sql:105-106` — `profiles_insert_own`: `FOR INSERT TO authenticated WITH CHECK (id = auth.uid())`. The check constrains only the `id` column. It places **no constraint on `role` or `status`**, so a signed-in user can insert their own profile row with `role = 'super_admin'`, `status = 'approved'`.
- `supabase/migrations/002_rls.sql:108-112` — `profiles_update_own_or_admin`: `USING (is_admin() OR id = auth.uid()) WITH CHECK (same)`. Again no column restriction: a user whose row was created correctly can later `UPDATE profiles SET role = 'super_admin'` on their own row.
- There is **no trigger anywhere** that creates profile rows on signup or guards `role`/`status`: `grep` for `handle_new_user` / triggers on `auth.users` across `supabase/` returns nothing; `003_functions.sql` contains only `updated_at` triggers, the ledger trigger, and three functions. `apps/web/src/lib/auth.tsx` `signUp` passes `role` in `options.data` (metadata) but nothing in the migrations ever reads it — the intended "trigger / admin flow" mentioned in the `auth.tsx:149-151` comment does not exist.
- `docs/DEPLOYMENT.md:174` shows the intended bootstrap (`update profiles set role = 'super_admin' ...` in the SQL editor as service role) — but that does not close the hole for self-service signups.

**Exploit chain (static reasoning, not executed):** sign up → `INSERT INTO profiles (id, email, role, status) VALUES (auth.uid(), 'x@y.z', 'super_admin', 'approved')` via the anon key → `public.is_admin()` (`002_rls.sql:36-46`) returns true → every admin RLS policy passes, `approve_conversion` / `reject_conversion` / `log_audit` accept the caller, audit logs become readable, all rows become visible.

**Fix (before any real signup):** add a `BEFORE INSERT OR UPDATE` trigger on `profiles` that forces `role`/`status` to `affiliate`/`pending` unless the caller is admin/service-role, or split the policies so `role`/`status` are only writable via a `SECURITY DEFINER` function; and add a `handle_new_user` trigger that creates the profile row with fixed defaults. Re-test with `rls-checks.sql` check 9-style negative cases for `profiles`.

---

## HIGH

### H1 — `affiliate_balances` view exposes every affiliate's money totals to any signed-in user

**Evidence:** `supabase/migrations/003_functions.sql:190` — `CREATE OR REPLACE VIEW public.affiliate_balances AS ...` with **no `security_invoker = true`**. Postgres views run with the view owner's privileges, so the RLS policies on `commission_ledger` / `payout_transactions` do **not** apply to reads through the view. `002_rls.sql:516` — `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated` covers views, and Supabase PostgREST exposes views, so any authenticated user can `GET /rest/v1/affiliate_balances` and read all affiliates' pending/approved/payable/paid totals. Note `supabase/tests/rls-checks.sql` check 4 even assumes an affiliate can query the view — the exposure is baked into the test plan.

**Fix:** recreate the view with `security_invoker = true` (Postgres 15+) and add a row filter on `affiliate_id = auth.uid()` for non-admins, or drop the view and compute balances in the app from the RLS-filtered ledger.

### H2 — Docs claim outbound postbacks carry an HMAC signature. They do not.

**Evidence:** `apps/docs/postbacks.html:6` (meta description: "macros, HMAC-SHA256 signatures and retries"), `:26-27` ("with macros expanded and an HMAC signature you can verify"), `:53-61` ("Every postback carries a signature header: `x-affilayer-signature: <hex>` … recompute the HMAC over the raw body with your secret"). The actual delivery code sends a **plain unsigned GET with no headers**: `services/tracking-worker/src/postbacks.ts:82` — `fetchFn(url, { method: 'GET' })`; same in `services/tracking/src/postbacks.ts` (delivery function — signature helpers there are only the inbound `verifySignature` for `POST /conversion`). The per-config `secret` column (`001_schema.sql:293`, `postback_configs.secret`) is **never read by any delivery code** (grep confirms zero readers). The docs describe the *inbound* `/conversion` verification scheme and present it as the *outbound* postback scheme.

**Impact:** any affiliate who implements verification exactly as documented will reject every real postback (the header never arrives); anyone who trusts "signed postbacks" as an authenticity guarantee is relying on a mechanism that does not exist. **Fix:** either sign outbound postbacks (add the header + per-config secret to `deliverPostbacks`) or correct the docs to say postbacks are unsigned and must be validated by `click_id` lookup.

### H3 — The live tracking Worker is an ephemeral, per-isolate, in-memory store — it cannot be financial truth

**Evidence:** `services/tracking-worker/src/index.ts:31-32` — `const store = new InMemoryStore();` with the header comment "One store per isolate … ephemeral, NOT shared across isolates"; `services/tracking-worker/src/store.ts:1-9` (same warning). Consequences, all verified in code:
- A conversion recorded on isolate A is invisible to isolate B, so the idempotency dedup (`index.ts:133-134`) only works within a single isolate; the same conversion can be counted once per isolate.
- All clicks / conversions / ledger entries vanish when an isolate recycles; there is no persistence, no backup, no reconciliation.
- `docs/DEPLOYMENT.md:197` is honest about this ("Store is in-memory per isolate — ephemeral. Do not treat Worker stats as financial truth"), but the public site and docs site present tracking as a working product feature, and the Worker is the deployed live tracker at `go.affilayer.com`.

**Fix:** before any real traffic, move the Worker to the Fastify + Postgres service (`services/tracking` + `pg-store.ts`) or a Durable Object store, and treat Worker stats as demo-only. This is a design limitation, disclosed in code comments, but it is a High because money (commissions, payouts) would be computed from data that can silently disappear or duplicate.

### H4 — Supabase-mode admin financial actions are entirely unwired (they only mutate the local demo store)

**Evidence:** `grep -rn '\.rpc(' apps/` returns **no calls in app source** (only the vendored Supabase JS bundle in `dist/`). `grep -rn 'approve_conversion|reject_conversion' apps/ services/` (excluding migrations/tests) returns **zero callers**. Meanwhile:
- `apps/web/src/pages/admin.tsx:178-185` — `AdminConversions.decide()` calls `updateDemo(...)` (localStorage) only; it never calls `supabase.rpc('approve_conversion')`.
- `apps/web/src/pages/admin.tsx:246` — `AdminPayouts.setStatus()` likewise only mutates the demo store.
- `apps/web/src/pages/affiliate.tsx:321-327` — payout requests are written with `updateDemo(...)` to localStorage, never to `payout_requests`.
- `apps/web/src/lib/data.ts` is SELECT-only in Supabase mode by design — there is no write path at all for these actions.

So in Supabase mode an admin clicking "Approve" changes nothing in the database while the UI shows the change locally (and the change vanishes on reload / differs per browser). The `approve_conversion` / `reject_conversion` functions (`003_functions.sql`) exist but are dead code. Also, no function exists for the ledger's `approved → payable → paid` transitions — the trigger allows them (`003_functions.sql:79-135`) but only the service role can perform them directly; there is no payout-execution job at all.

**Fix:** wire the admin actions to `supabase.rpc('approve_conversion' | 'reject_conversion')` and build the payout execution path (service-role job) before claiming payouts work in Supabase mode. Until then the Supabase-mode admin finance UI is a placeholder.

---

## MEDIUM

### M1 — Conversion dedup is check-then-insert, not atomic: concurrent duplicates can double-count

**Evidence:** `services/tracking-worker/src/index.ts:133-153` — `findConversionByIdempotencyKey` / `findConversionByClickAndOffer`, then `await store.recordConversion(...)`. Between the check and the insert there are `await` points, so two concurrent identical `POST /conversion` requests in one isolate can both pass the check and both insert. Identical logic in `services/tracking/src/routes.ts`. With Postgres (`services/tracking/src/pg-store.ts:138-150`) the plain `INSERT` has no `ON CONFLICT` handling and `routes.ts` has no `try/catch` around `recordConversion`, so the DB unique index backstops the duplicate with a **500 error instead of `200 {duplicate: true}`**. The DB-level dedup itself is sound (`001_schema.sql:264-266` partial unique index on `(click_id, offer_id)` + `UNIQUE idempotency_key`).

**Fix:** `INSERT ... ON CONFLICT DO NOTHING` + return the existing row, or a serializable transaction; add a `try/catch` mapping unique-violation to the duplicate response.

### M2 — Conversions are accepted for click IDs that were never recorded

**Evidence:** `services/tracking-worker/src/index.ts:139-153` — `const click = await store.getClick(clickId)` may be `undefined`, yet the conversion is still recorded with `affiliateCode: undefined`. Same in `routes.ts`. A holder of `POSTBACK_SECRET` can fabricate conversions for arbitrary `click_id`s. (The DB schema is stricter: `001_schema.sql` `conversions.click_id REFERENCES clicks(click_id)`.) Mitigated by the HMAC trust boundary, but the Worker does not enforce click existence.

### M3 — Postback macro values are inserted into URLs without URL-encoding

**Evidence:** `packages/shared/src/index.ts:222-232` — `expandPostbackMacros` does a raw string replace with no `encodeURIComponent`. `services/tracking-worker/src/postbacks.ts:73` feeds it `sub1`, which is affiliate/visitor-controlled. A `sub1` containing `&`, `?`, `#` or spaces breaks the affiliate's postback URL or injects extra query parameters (e.g. `sub1 = "x&status=approved"`). **Fix:** encode each substituted value with `encodeURIComponent` (careful: the template itself must not be encoded).

### M4 — No rate limiting or bot filtering on the click endpoint

**Evidence:** `services/tracking-worker/src/index.ts:212-230` (`GET /c/:affiliateCode/:offerId`) and `routes.ts` equivalent: every GET unconditionally records a click and 302s. No per-IP rate limit, no bot/user-agent check, no CAPTCHA. `detectFraudSignals` (`packages/shared/src/index.ts:274-352`) is detection-only by design ("never auto-reject"). Anyone can inflate click counts (and therefore EPC/CR denominators) by curling the tracking URL. The demo offers make this low-impact today; it becomes a fraud vector the moment real offers exist.

### M5 — `/api/stats` and `/api/clicks/:clickId` are unauthenticated public reads

**Evidence:** `services/tracking-worker/src/index.ts:300-313` — both GET routes have no auth check. `/api/stats` exposes aggregate revenue/commission; `/api/clicks/:clickId` returns the full click record including raw `ip` and `userAgent`. `click_id` values are 96-bit random (`generateClickId`, `packages/shared/src/index.ts:236-242`), so enumeration is impractical, but the stats endpoint needs no ID at all. **Fix:** require an operator key on the stats/lookup routes (or remove them from the public Worker).

### M6 — Offer caps are never enforced at the tracking edge

**Evidence:** no `cap` / `daily_cap` / `monthly_cap` check exists in either `/c/` or `/s/` path (`services/tracking-worker/src/index.ts:212-270`; `services/tracking/src/routes.ts`). `smartlinkPick` is called without `clicksSoFar` (`index.ts:256-260`), so the cap branch of `isOfferEligible` (`packages/shared/src/index.ts:258`) can never fire. Caps exist in the schema (`001_schema.sql`, `offers.daily_cap` / `monthly_cap`) and in demo data (`demo-data.ts:16-18`) but are decorative at the edge. An advertiser's budget/cap can be exceeded without any control tripping.

### M7 — Click country is client-spoofable

**Evidence:** `services/tracking-worker/src/index.ts:71-73` — `geoFrom` returns `params.get('geo')` **before** `cf-ipcountry`; `services/tracking/src/routes.ts:49-57` same (`q ?? vercel ?? cf`). A visitor can self-report any country with `?geo=XX`, corrupting GEO reporting, SmartLink eligibility, and GEO-targeted offer matching. **Fix:** prefer the `cf-ipcountry` / `x-vercel-ip-country` header and ignore or validate the query hint.

---

## LOW

### L1 — `signInDemo` (role picker) has no Supabase-mode guard
`apps/web/src/lib/auth.tsx:108-110` — unlike `signInDemoCredentials` (`:111-117`, which refuses when Supabase is configured), the one-click role picker calls `doSignInDemo` unconditionally. The UI hides the picker in Supabase mode (`apps/web/src/pages/auth.tsx:69,221` render it only when `isDemoMode`), but the context function is callable from devtools. In Supabase mode it would put a demo identity into state and `RequireAuth` (`apps/web/src/App.tsx:67-72`, which trusts the client-side `user.role`) would render the admin UI shell — with empty data, because RLS denies the queries (no auth session). UI-only, no data access. Still, add the same guard for symmetry.

### L2 — Demo session is restored from localStorage without validation
`apps/web/src/lib/auth.tsx:55-64` — `JSON.parse(raw) as AuthUser`, no shape/role check. Editing `affilayer-demo-session` in devtools can set `role: 'super_admin'` and open the admin dashboard in demo mode. Demo-only, local to the user's own browser, no backend involved. Low.

### L3 — `postback_configs.secret` is readable through RLS SELECT policies
`supabase/migrations/002_rls.sql` `postback_configs_select_own_or_org_or_admin` allows the affiliate / org members / admins to SELECT the whole row, including the `secret` column. Combined with H2 (the secret is never used by delivery), the column should not hold real secrets; if per-config signing is ever implemented, restrict the column (separate table or redact in the policy). Low today because the seeded value is fake (see L7).

### L4 — SECURITY DEFINER functions do not set `search_path`
`002_rls.sql` (`is_admin`, `current_org_id`, `is_org_member`, `current_affiliate_code`) and `003_functions.sql` (`log_audit`, `approve_conversion`, `reject_conversion`) are all `SECURITY DEFINER` without `SET search_path = public, pg_temp`. Classic hardening gap; low exploitability in Supabase (authenticated users cannot create schemas/functions by default). Add `SET search_path` to each.

### L5 — `smartLink()` helper builds a URL the tracking service will 404
`apps/web/src/lib/tracking.ts:18-21` builds `/s/{affiliateCode}/{code}` (two segments), but the service route is `/s/{smartlinkCode}` (one segment) — `services/tracking-worker/src/index.ts:252`, `services/tracking/src/routes.ts` (`/s/:smartlinkCode`). Currently dead code (no callers in `apps/web/src`), so latent only. Fix the helper or delete it before anyone wires it into the UI. (The documented route in `apps/docs/tracking.html:49` is the correct one-segment form.)

### L6 — `affiliate_balances` sums money across currencies
`supabase/migrations/003_functions.sql:190-215` — `SUM(amount)` per status with no `GROUP BY currency`. An affiliate with USD and EUR ledger rows gets a single meaningless combined total. Fix by grouping on currency (or restricting the network to one currency).

### L7 — Seed file contains a published demo "secret" and unusable fixed UUIDs
`supabase/migrations/004_seed.sql:158,161` — literal `'demo-secret-do-not-use-in-production'` in `postback_configs.secret`. Fake and clearly labeled, but it is a secret-shaped value in a committed file; never run the seed against a production project (the header says so). Same file (`:30-41`) uses fixed profile UUIDs (`bbbbbbbb-…`) that cannot be created through the Auth dashboard — the seed fails with a foreign-key violation unless the UUIDs are replaced first (the header documents this, but it is a trap for the documented "first Super Admin" flow).

### L8 — Admin copy overstates what the UI can do
- `apps/web/src/pages/admin.tsx:207` — "Approved conversions can be reversed later" — the UI only exposes Approve/Reject for `pending` rows; no reverse action exists anywhere (demo or Supabase mode).
- `apps/web/src/pages/admin.tsx:225` — Ledger page copy says "pending → approved → reversed", but the DB ledger pipeline is `pending → approved → payable → paid` (`001_schema.sql` `commission_ledger` CHECK; `003_functions.sql:79-135` trigger). Also the "Ledger" page renders **conversions**, not ledger entries — the demo store has no ledger at all (`apps/web/src/lib/demo-store.ts` `DemoState` has no `ledger` field).

### L9 — Postback delivery has no fetch timeout
`services/tracking-worker/src/postbacks.ts:82` — `fetchFn(url, { method: 'GET' })` with no timeout/abort signal, and delivery is awaited inside the conversion request (`index.ts:170-176`). A hanging affiliate endpoint holds the conversion response; worst case the Worker hits its CPU/time limit mid-delivery. Add an `AbortSignal.timeout(...)` (e.g. 5 s) per attempt.

### L10 — Raw IPs and user agents are stored with no retention policy
`services/tracking-worker/src/index.ts:66-90` (`recordClickFields` stores `ip`, `userAgent`); `001_schema.sql` `clicks.ip inet, user_agent text`. No retention, anonymisation, or deletion job exists anywhere. Privacy exposure under GDPR-style rules; also `uniqueClicks` (`index.ts:234`) keys on raw IP, so NAT/CGNAT collapses distinct users and shared/VPN IPs distort "unique" counts.

### L11 — No upper bound on conversion payout
`services/tracking-worker/src/index.ts:126-131` validates `payout` only as `Number.isFinite(payout) && payout >= 0`. A holder of `POSTBACK_SECRET` can submit a conversion with an arbitrarily large payout (e.g. $1e12), which flows straight into revenue/commission/ledger. Add a sanity cap (e.g. reject payouts above the offer's configured payout, or an absolute ceiling).

### L12 — The "19 tables" claim is wrong: there are 20
`supabase/migrations/001_schema.sql` contains **20** `CREATE TABLE public.…` statements (verified by listing them: organizations, profiles, affiliate_profiles, advertiser_profiles, campaigns, offers, offer_applications, affiliate_offer_access, tracking_links, clicks, conversions, postback_configs, postback_events, commission_ledger, payout_requests, payout_transactions, fraud_events, compliance_reviews, support_tickets, audit_logs). RLS is enabled on all 20 (`002_rls.sql` — 20 `ENABLE ROW LEVEL SECURITY` statements, verified). The "19 tables" figure in `CONTRACT.md`, `README.md` and the brief is stale. Docs-only, but it shows the schema count was never re-checked after `audit_logs` was added.

### L13 — `approve_conversion` records `p_actor` without verifying it
`supabase/migrations/003_functions.sql:224-280` — `p_actor` is taken as a parameter and written to the audit log; the function checks only that the *caller* is an admin, not that `p_actor = auth.uid()`. Any admin can approve a conversion attributed to a different admin in the audit trail. Admin-to-admin, low impact; bind `p_actor` to `auth.uid()` when a JWT is present.

---

## PASSES (verified good)

- **P1 — No live secrets in the repo or its history.** Grep for key/token/private-key patterns across all tracked files and `git log --all -p` found no live values — only comments, docs, and placeholders. `.gitignore` covers `node_modules/`, `dist/`, `.env`, `.env.local`, `*.log`. Both `.env.example` files contain placeholders only (`VITE_SUPABASE_URL=` empty; `POSTBACK_SECRET=<redacted>`). `POSTBACK_SECRET` lives only in `~/.affilayer-secrets` (chmod 600) and as a Wrangler secret. `wrangler.toml:19-22` contains only a commented placeholder.
- **P2 — Demo / real isolation on the public login path.** `signInDemoCredentials` refuses outright when Supabase is configured (`apps/web/src/lib/auth.tsx:111-117`); demo credentials never reach Supabase auth and never create a real user. The demo store is localStorage-only (`apps/web/src/lib/demo-store.ts`, key `affilayer-demo-v1`); demo data never leaves the browser. In Supabase mode `data.ts` is SELECT-only; the browser client uses the anon key only and never a service-role key (`apps/web/src/lib/supabase.ts:11-17`). Role guards exist on all dashboard routes (`apps/web/src/App.tsx:67-72,178,192,202`).
- **P3 — HMAC verification on `POST /conversion` is fail-closed and correct.** Missing `POSTBACK_SECRET` → 500 (`services/tracking-worker/src/index.ts:100-103`); missing/bad signature → 400 (`postbacks.ts:31-43`); comparison is length-checked then constant-time over hex; optional `sha256=` prefix is accepted and lower-cased. The Fastify service is identical (`services/tracking/src/postbacks.ts:18-24`, `routes.ts` raw-body parser preserving the exact signed bytes).
- **P4 — RLS and ledger integrity are well-designed (except C1/H1).** RLS enabled on all 20 tables; **no** INSERT/UPDATE/DELETE policy for `authenticated` on `clicks`, `conversions`, `postback_events`, `commission_ledger`, `payout_transactions`, `audit_logs`; `payout_requests` UPDATE is admin-only; the ledger trigger blocks money-column edits and DELETEs for everyone including the service role (`003_functions.sql:79-135`) and only allows the sanctioned status pipeline; DB-level dedup via `UNIQUE idempotency_key` + partial unique `(click_id, offer_id)` (`001_schema.sql:264-266`); `approve/reject_conversion` enforce pending-only, admin-only, and write an audit row (`003_functions.sql:224-350`).
- **P5 — Financial math and state machine are correct where implemented.** `computeCommission` (`packages/shared/src/index.ts:201-214`): CPA/CPL/CPC pay the flat payout, CPS pays `payout × rateBps / 10000` and pays **0** without a rate; amounts are rounded to 2 dp. `ledgerTransition` (`:356-362`) is enforced in the demo admin (`apps/web/src/pages/admin.tsx:181`) and unit-tested (`packages/shared/test/shared.test.ts:153-164`). Postback retries are 1 + 3 with exponential backoff (`services/tracking-worker/src/postbacks.ts:67,79-95`) and failures never fail the conversion — matching the docs on those points. Payouts are manual + admin-approved with no auto-payout path anywhere in code; demo payout requests enforce minimum ($50 default, `DEFAULT_SETTINGS` in `demo-store.ts:55-62`) and approved-balance caps client-side (`apps/web/src/pages/affiliate.tsx:313-321`).
- **P6 — Public copy is honest.** No fake stats, testimonials, clients, guaranteed earnings, or AI claims found. Explicit disclaimers: `apps/web/src/pages/public.tsx:686` ("No guaranteed earnings"), `:692` (Terms: "does not guarantee traffic, conversions or earnings"), `apps/web/src/lib/faq-data.ts:16` (SmartLink "does not use AI optimisation and it does not guarantee earnings"), `apps/web/public/llms.txt:10`. Demo data uses `example.com` / `.test` domains and TEST-NET IPs (`192.0.2.x`, `004_seed.sql`), and the seed header forbids presenting it as real. Payout methods/minimums are correctly *not* published as fact (`apps/docs/payouts.html:54-55`).
- **P7 — Dependency tree is small and clean.** No git dependencies, no `postinstall` scripts, no package that phones home. Top-level: root workspaces; web: `@supabase/supabase-js ^2.45.0`, `react ^19.1.0`, `react-router-dom ^7.6.0`, `vite ^5.4.21`, `tailwindcss ^4.1.0`, `typescript ^5.8.0`; shared: `vitest ^2.1.8`; tracking: `fastify ^5.3.0`, optional `pg ^8.13.0`; worker: `wrangler ^4.0.0`, `@cloudflare/workers-types ^5.20261104.1`. `npm audit` **could not run** — the registry is blocked by VM egress policy (403 `policy_denied` on `registry.npmjs.org/-/npm/v1/security/audits/quick`) — see U1.
- **P8 — No dangerous browser sinks.** No `dangerouslySetInnerHTML`, `eval(`, or `new Function` in app/worker/shared code. The tracking-link builder URL-encodes affiliate codes, offer IDs, and sub-params (`apps/web/src/lib/tracking.ts:8-21`). Click IDs are 96-bit `crypto.getRandomValues` (`packages/shared/src/index.ts:236-242`).

---

## UNVERIFIED (could not check — stated plainly, not assumed)

- **U1 — `npm audit` / vulnerability status of dependencies.** Blocked by VM egress policy (see P7). No CVE verdict can be given for the pinned versions from this audit.
- **U2 — RLS behaviour against a live database.** `supabase/tests/rls-checks.sql` is 16 commented-out manual checks, explicitly documented as non-runnable without a live project and a real user JWT. The C1 escalation was established by static reading of the policies; it was **not** executed. All RLS findings in this report need a live run of `rls-checks.sql` (plus a new negative check: attempt `UPDATE profiles SET role='super_admin'` as a plain affiliate) before the backend goes live.
- **U3 — Geo-page payout-range figures ($100–$1,500).** A prior browser check reported these on `/geo/br`; they do **not** appear anywhere in the current source at HEAD `4fab5fe` (grep for `1500`, `1,500`, `$100` across `apps/web/src` and `apps/docs` returns nothing; `apps/web/src/pages/geo.tsx` and `lib/geo-data.ts` contain no payout figures). Could not verify or refute — needs a live-page re-check against the current deployment.
- **U4 — Live Worker state.** Whether `POSTBACK_SECRET` is actually set on the deployed `affilayer-tracking` Worker and whether live conversions behave as the code says — out of scope for this static audit; the parent agent verifies live.
- **U5 — Live Pages environment.** Whether `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set in the deployed `affilayer-web` build (which decides demo vs real mode live) — not verifiable from the repo.

---

## Fix order (recommended)

1. **C1** — close the profiles role escalation (trigger and/or policy split + negative RLS test). Blocks any real signup.
2. **H1** — `security_invoker` on `affiliate_balances` (or drop the view).
3. **H2** — sign outbound postbacks, or correct `apps/docs/postbacks.html`.
4. **H4** — wire admin finance actions to the DB functions; build the payout-execution path.
5. **H3** — move live tracking off the ephemeral Worker store before real traffic.
6. **M1–M7** — dedup atomicity, click-existence check, macro encoding, rate limiting, stats auth, cap enforcement, geo header precedence.
7. **Lows** — search_path, timeouts, payout ceiling, copy fixes, helper cleanup.
8. Re-run `rls-checks.sql` live (with the new C1 negative check) and re-audit after the fixes.
