# AffiLayer audit — Agent D: User-POV + Adversarial Dry Tests

**Scope:** live site https://affilayer.com (deployment `8c6233fc`, commit `4fab5fe`, Job 5 demo login) + docs https://affilayer-docs.pages.dev + tracking Worker https://go.affilayer.com
**Date:** 7 November 2026, ~21:40–22:10 +06
**Method:** read-only. curl probes of live endpoints (GETs + one unsigned POST error-path probe), `browser.open` page text where usable, and line-by-line reading of the served source in `~/workspace/affilayer` (web app `apps/web/src`, tracking Worker `services/tracking-worker/src`, shared package `packages/shared/src`, prerendered `apps/web/dist`). No forms submitted, no accounts created, no payments attempted, no live browser available — anything that needed a live browser is marked **UNVERIFIED** below.
**Severity scale:** Critical = core product loop broken for every user · High = a real visitor is misled or blocked · Medium = misleading claim, broken promise or integrity gap · Low = cosmetic / latent / edge.

## Verdict in one paragraph

The demo login, the dashboards and the copy are in good shape — but **the core product loop is broken twice over**: (1) every tracking link the affiliate dashboard generates points at `http://localhost:3001` because the live build was made without `VITE_TRACKING_URL`, and (2) even with the URL fixed, the dashboard's offer IDs (`demo-offer-1/2/3`) do not exist in the live Worker, which only knows `offer-a`/`offer-b` — a live click returns `404 {"error":"offer not found"}`. On top of that, **registration is a dead end** (the full form submits, then fails with a Supabase error), the **contact form and support tickets silently discard messages** (localStorage only), and **10 header-nav links on Spanish/Portuguese pages are soft-404s** that bounce the visitor to the English homepage. Fix order: C1 → C2 → H1 → H2 → H3 → H4 → H5.

## Severity counts

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 5 |
| Medium | 6 |
| Low | 6 |
| Pass (spot-checked, no finding) | 14 |
| Unverified (needs live browser) | 5 |

---

## 1. New affiliate journey (demo) — Home → Affiliates → Register → demo login → dashboard

Traced from code (`apps/web/src/pages/public.tsx`, `pages/auth.tsx`, `lib/auth.tsx`, `packages/shared/src/demo-login.ts`) and confirmed against the live site's served JS where possible. The parent agent's live browser check (21:36–21:37) already verified the login steps; this section verifies the path *to* the login.

| Step | What happens | Verdict |
|---|---|---|
| Home hero | Two Register CTAs (affiliate + advertiser) both link to `/register`; role is chosen on the register page. A "Try the public demo →" link to `/login` sits under the CTAs, with the demo credentials named. | Pass |
| `/affiliates` | Own illustration + highlights + 5-step funnel. Step links: 1 `/register`, 2 `/onboarding`, 3 `/app/affiliate/offers`, 4 `/app/affiliate/tracking-links`, 5 `/app/affiliate/earnings`. Steps 3–5 are auth-gated; a signed-out visitor clicking them lands on `/login` (RequireAuth, `App.tsx:65-71`) with no explanation that sign-in was required. | Low (see L6) |
| `/register` | Full form (name, email, password ≥8, role cards, account type, company/website for advertisers, country, messenger). On submit in demo mode `signUp` returns `{ error: 'Supabase is not configured — use the demo role-picker below.' }` (`lib/auth.tsx:96`) — **after the visitor filled the whole form**. The page does carry a demo note below the submit button and a "Demo: continue as Demo Affiliate" shortcut, but the primary CTA fails. | **H1 (High)** |
| `/login` | Demo box is clearly labelled "Demo mode — sample data, nothing is real", lists both demo accounts + `1234` openly, plus one-click role buttons. `demo-publisher` / `1234` → Affiliate dashboard; `demo-advertiser` / `1234` → Advertiser dashboard; wrong password → plain `Incorrect demo password.`; username matched case-insensitively and trimmed (`demo-login.ts:30-46`); password field is `required`, so an empty password is blocked by the browser before the code runs — if bypassed, the code returns `Incorrect demo password.` | Pass |
| Demo login guardrails | `signInDemoCredentials` refuses outright when Supabase is configured (`lib/auth.tsx:104-106`) — demo credentials can never reach real auth or create a real user. A real-looking email in demo mode goes to `signIn`, which returns the "Supabase is not configured" error without any network call. | Pass |
| Affiliate dashboard | Demo banner on every dashboard page (`components/layout.tsx:336-342`): "Demo data — not real. This page shows sample data because Supabase is not configured." Gold/orange **Demo** badge + role pill in the header. First-steps card is honest about demo storage. | Pass |
| Offer application | "Apply for this offer" writes an application to the local demo store and shows "Application submitted. You will be notified when the advertiser reviews it." No notification mechanism exists in demo mode. | Low (L2) |

**Demo-banner coverage:** the banner appears on **every** dashboard page (it lives in `AppLayout`), and the login page carries its own demo box. But **no public page discloses demo mode** — the public site presents itself as a live network while registration is non-functional. That is the honesty gap behind H1.

---

## 2. New advertiser journey (demo) — Home → Advertisers → Register → demo login → create-offer

| Step | What happens | Verdict |
|---|---|---|
| `/advertisers` | Own illustration + highlights + 4-step funnel. Step 2 links to `/app/advertiser/create-offer`, step 3 to `/app/advertiser/affiliates`, step 4 to `/app/advertiser/conversions` — all auth-gated (same silent redirect to `/login` as above). | Low (L6) |
| `/register` as advertiser | Same dead end as H1, plus company + website are `required` fields the visitor fills in for nothing. | **H1** |
| Advertiser dashboard | Same demo banner + badge as the affiliate side. Stats cards read from the local demo store only. | Pass |
| Create-offer form (`pages/advertiser.tsx:62-134`) | Complete: name, description, vertical, conversion type, countries, devices, traffic sources, landing URL, payout model (CPA/CPL/CPS/CPC), payout, currency, creatives, daily/total caps, approval checkbox. Validation: payout must be a finite number ≥ 0; landing URL must parse and be `http:`/`https:`; name/description/vertical/conversion type/countries/devices/traffic sources/landing URL/payout are `required`. On submit it writes to the demo store, logs an audit entry, and shows a green confirmation that **explicitly says "demo mode: stored in this browser only"**. | Pass |
| Create-offer gaps | (a) The CPS hint says "for CPS this is the order value; commission rate is set separately" — **there is no commission-rate field anywhere in the form**, and `computeCommission` with an unset rate returns **$0** (`packages/shared/src/index.ts:205-215`). Every CPS offer created through the app's own form pays $0 commission. (b) `capDaily`/`capTotal` are `type="number" min="0"` — browser-enforced on submit; no server-side check exists, but there is no server in demo mode. | **M5 (Medium)** |
| Conversions page | Advertiser-facing copy promises "Approve, reject or reverse attributed conversions" (Advertise funnel step 4, FirstSteps advertiser step 4) — but `AdvertiserConversions` states "this UI is read-only in the MVP" and renders no approve/reject controls. Approve/reject exists **only in the admin** (`pages/admin.tsx:179-198`). | **M2 (Medium)** |
| Billing page | Honest: "No payment integration is part of this MVP — invoices and payouts are administered outside the app." The "$102.00 payable" card is labelled "From demo ledger data — not real". | Pass |
| Payout request (affiliate side) | Validated: amount > 0, ≥ $50 minimum, ≤ approved balance; confirmation "Payout request submitted for review" + footnote "Demo mode: requests are not sent anywhere." | Pass |
| Postbacks page | "The tracking service calls it when a conversion is recorded" — but the footnote saves it: "Demo mode: postbacks are stored locally only and are not sent anywhere." (The demo store's postback configs are never synced to the Worker, so they truly never fire.) | Pass (with footnote) |

---

## 3. Findings register

### Critical

**D-C1 — Tracking-link generator points at `http://localhost:3001` (live build missing `VITE_TRACKING_URL`)**
- Evidence: live served chunk `https://affilayer.com/assets/affiliate-C9a6yrA_.js` contains `const V="http://localhost:3001"` as the `TRACKING_URL` constant used by `trackingLink()` (`apps/web/src/lib/tracking.ts:3-4` — fallback when `VITE_TRACKING_URL` is unset). `go.affilayer.com` occurs **0 times** anywhere in `apps/web/dist/`. The deploy-prep build (March-era note in the repo history) baked the URL in; the Job 5 build (`4fab5fe`, deployed `8c6233fc`) did not.
- Impact: every tracking link generated from the affiliate dashboard (`/app/affiliate/tracking-links`) points at the visitor's own machine and is dead for 100% of users. The core product loop — generate link → click → track — fails at the first step.
- Fix: rebuild with `VITE_TRACKING_URL=https://go.affilayer.com` and redeploy; add a build-time assertion that the built bundle contains `go.affilayer.com` and not `localhost:3001`.

**D-C2 — Dashboard offer IDs do not exist in the live Worker (catalogue mismatch)**
- Evidence (live, 7 Nov ~22:00): `GET https://go.affilayer.com/c/AFF-DEMO-001/demo-offer-1` → `404 {"error":"offer not found"}`. Web demo offers are `demo-offer-1/2/3` (`apps/web/src/lib/demo-data.ts:16-18`); the Worker only seeds `offer-a` / `offer-b` (`services/tracking-worker/src/store.ts:57-76`). The Worker lookup is `store.getOffer(offerId)` → 404 when absent (`services/tracking-worker/src/index.ts:204-207`).
- Impact: even after C1 is fixed, every dashboard-generated link 404s on the live tracker. The web app and the tracker use two different offer catalogues with no shared source.
- Fix: single source of truth for offer IDs (seed the Worker from the same demo offers, or make the dashboard generate links only for offers the Worker knows). Live-probe after fix: the same URL must 302.

### High

**D-H1 — Registration is a dead end in demo mode, with no public disclosure**
- Evidence: `signUp` in demo mode always returns `'Supabase is not configured — use the demo role-picker below.'` (`lib/auth.tsx:94-99`). The visitor fills the entire form (including `required` company + website for advertisers) before the error appears. Meanwhile the public site promises "Free to join. Applications are reviewed by our team, typically within 2 business days." (`lib/i18n-dict.ts:46`, footer trust row on every page) and the FAQ says "You can check your status on the approval page at any time" (`lib/faq-data.ts:33`). No public page says registration is unavailable or demo-only. The only working path to a dashboard is the demo login.
- Impact: a real visitor who tries to join hits a confusing error after full effort, and the site's promises about review timelines are false in the current state.
- Fix: in demo mode, replace the register form's submit path with an honest interstitial ("Registration opens when the backend connects — try the public demo meanwhile") *before* the visitor fills anything, or hide/disable the form with that message. Keep the demo shortcut.

**D-H2 — Contact form and support tickets silently discard messages**
- Evidence: `ContactForm.submit` (`pages/public.tsx:316-330`) writes the message to the visitor's own `localStorage` key `affilayer-contact` and shows "Message received — thank you. We will reply to {email}." The only disclosure is a parenthetical: "(Demo note: while Supabase is not configured, messages are stored in your browser only.)" (`lib/i18n-dict.ts:87`). No email, ticket or backend call is made. The FAQ page routes unanswered questions to "the contact form on the home page" (`pages/public.tsx:605-608`). Support tickets (`pages/affiliate.tsx:383-404`) are the same: stored in localStorage, confirmation "Ticket submitted." with **no demo note at all**. The Contact page also says "use the ticket system inside your account" — both support channels are dead ends in demo mode.
- Impact: a real visitor's enquiry or support request is lost while the site tells them a reply is coming. The `mailto:` links (support@ / partner@) are real links and are not part of this finding.
- Fix: in demo mode, say plainly on the form itself — above the submit button — "Demo mode: this message stays in your browser and is not sent." Do not show "We will reply" when no reply can come. Same note on the ticket form.

**D-H3 — 10 header-nav links on Spanish/Portuguese pages are soft-404s**
- Evidence: `PublicLayout.publicLinks` localises every nav item with `localizePath()` (`components/layout.tsx:150-161`), and `localizePath` prefixes *any* path (`lib/i18n.tsx:38-41`) with no check against `LOCALIZED_BASE_PATHS`. So on an ES/PT page, About → `/es/about`, Advantages → `/es/advantages`, Blog → `/es/blog`, FAQ → `/es/faq`, Contact → `/es/contact` (and the `/pt/` equivalents). But `App.tsx` defines ES/PT routes only for `/`, `/affiliates`, `/advertisers`, `/how-it-works`, `/geo`, `/geo/:code`, and `dist/es/` + `dist/pt/` contain only those pages — no `es/about`, `es/advantages`, `es/blog`, `es/contact`, `es/faq` files exist. Live check: `GET https://affilayer.com/es/about` returns HTTP 200 but serves the generic SPA shell (title "AffiLayer — Global CPA Affiliate Network", not "About AffiLayer | …"), and on hydration the catch-all route redirects to `/` (English home). The footer Company column uses unlocalised paths (`/about` etc.) and works; the LanguageSwitcher correctly falls back to the language home for non-localised pages.
- Impact: on every Spanish/Portuguese page, 5 of the 10 header nav links (plus the mobile menu, which uses the same list) dump the visitor on the English homepage. The EN experience is unaffected.
- Fix: only localise paths in `LOCALIZED_BASE_PATHS`; link everything else to the English path (or add the missing ES/PT routes + prerenders).

**D-H4 — No 404 page: every bad URL silently bounces home**
- Evidence: `App.tsx` catch-all is `<Route path="*" element={<Navigate to="/" replace />} />` (`App.tsx:231`). Live: `GET https://affilayer.com/nonexistent-page` → HTTP 200 (Cloudflare Pages SPA fallback serves `index.html`), then the router redirects to `/`. There is no 404 page, no "not found" message, no status. This also masks H3 — the dead ES/PT links return 200 at the edge.
- Impact: mistyped or stale links, bad bookmarks and search-engine crawls all look "fine" while showing the wrong content; SEO soft-404s.
- Fix: add a real 404 route/component and serve it for unmatched paths (Pages `_redirects`/SPA-fallback notwithstanding, the app must render a "Page not found" state instead of redirecting).

**D-H5 — Worker accepts conversions for clicks that never existed (orphan conversions)**
- Evidence: `handleConversion` (`services/tracking-worker/src/index.ts:132-186`) looks up the click only to copy `affiliateCode` — `const click = await store.getClick(clickId)` — and records the conversion regardless of whether the click exists, with `affiliateCode: click?.affiliateCode` (undefined when absent) and a ledger entry with `affiliateCode: ''`. No check that the click exists, no upper bound on `payout`, no currency allowlist (any non-empty string accepted), no rate limiting anywhere in the Worker, and `GET /api/stats` is public and unauthenticated.
- Impact: anyone who can sign a conversion (or anyone at all, if the secret ever leaks or is misconfigured) can fabricate payable conversions with no originating click and no attributable affiliate. Financial-integrity hole in the tracking core.
- Fix: reject conversions whose `click_id` has no recorded click (400/422); validate currency against ISO 4217; cap payout to a sane maximum; add rate limiting; require auth (or remove) `/api/stats` before it carries real numbers.

### Medium

**D-M1 — "Typically within 2 business days" is stated as a live operating fact, but no review pipeline exists**
- Evidence: the claim appears in the footer trust row on **every** page (`lib/i18n-dict.ts:35` `trust.review`), the home note (`:46`), the FAQ (`lib/faq-data.ts:33`), and the geo Q&A on all 8 country pages in all 3 locales (`lib/i18n-dict.ts:181` `geo.qa.1.a`). In demo mode there is no team review: registration fails outright (H1), onboarding via the demo shortcut lands in the visitor's own localStorage, and the only "review" UI is the admin demo queue. The timeline is unverifiable and currently untrue.
- Fix: qualify it until the pipeline is live ("Applications are reviewed by our team once registration opens") or remove the timeframe.

**D-M2 — Advertiser copy promises conversion approve/reject; the advertiser UI is read-only**
- Evidence: Advertise funnel step 4 "Review conversions — Approve, reject or reverse attributed conversions" (`pages/public.tsx:841-847`) and FirstSteps advertiser step 4 (`components/layout.tsx:430`) both point the *advertiser* at `/app/advertiser/conversions`, where `AdvertiserConversions` states "Status changes go through approve/reject functions … this UI is read-only in the MVP" (`pages/advertiser.tsx:158-159`). Approve/reject controls exist only in the admin (`pages/admin.tsx:179-198`).
- Fix: either give advertisers the controls or change the copy to "Review conversions — approve and reject are handled by the network team" (whichever the product intends).

**D-M3 — JavaScript disabled = stuck on the loader forever, with no message**
- Evidence: `apps/web/index.html` renders a static branded loader inside `#root`; React replaces it on mount. The only `<noscript>` content is a `<style>` that unhides `.reveal` elements — there is no noscript message or fallback content. With JS disabled (or the JS bundle failing to load), the visitor sees the pulsing "AffiLayer" loader indefinitely and nothing else.
- Fix: add a `<noscript>` block with a plain message ("AffiLayer needs JavaScript enabled — or email support@affilayer.com").

**D-M4 — Tracker and dashboard are two disconnected systems; live stats are non-deterministic**
- Evidence: `getStats` is documented "prefer the tracking service /api/stats when reachable, else compute locally" (`lib/data.ts:196`) but the implementation only ever computes locally from the demo store — **no code in `apps/web/src` ever fetches the Worker** (verified by grep; the only Worker reference is explanatory text on the tracking-links page). The Worker store is in-memory per isolate (`services/tracking-worker/src/index.ts:29-33`). Live-proven: two clicks that returned 302s with click IDs (`/c/AFF123/offer-a`, `/s/test`) were followed by `GET /api/stats` returning all zeros — the stats request hit a different isolate.
- Impact: a real click never appears in any dashboard, and the same stats endpoint returns different numbers per request. Documented as by-design in code comments, but it means the "tracking you can audit" story does not hold end to end.
- Fix: durable store for the Worker (Durable Objects / Postgres) and wire the dashboard to the Worker's stats; until then, say so in the docs.

**D-M5 — CPS offers created in the app can never pay commission ($0)**
- Evidence: see §2. The form has no commission-rate field; `computeCommission('CPS', rateBps=undefined)` returns `payout * 0 / 10000 = 0` (`packages/shared/src/index.ts:205-215`). The seeded demo CPS offer (`demo-offer-2`, $12) would therefore accrue $0 commission through the Worker path.
- Fix: add a commission-rate (bps) field to the create-offer form for CPS, or remove CPS from the model list until the rate exists.

**D-M6 — SmartLink: helper URL is wrong, the product toggle is cosmetic, and the blog over-claims**
- Evidence: `smartLink()` builds `/s/{affiliateCode}/{code}` (`lib/tracking.ts:13-19`) but the Worker route is `/s/:smartlinkCode` — one segment (`services/tracking-worker/src/index.ts:215-216`). Live: `GET https://go.affilayer.com/s/AFF-DEMO-001/test` → `404 {"error":"not found"}`, while `GET /s/test` → 302. The helper is currently unused in the UI (grep: no call sites), so this is latent — but the docs correctly document `/s/{smartlink_code}` (`apps/docs/tracking.html:48`), so the helper contradicts the docs. Separately, the login page's "CPA offers / SmartLink" toggle only changes the description text (`pages/auth.tsx:50-64`); there is no SmartLink management UI anywhere in the app, and the launch blog post claims SmartLink "shows which offer each click landed on" (`lib/blog-data.ts:23`) — no such UI exists.
- Fix: change the helper to `/s/{code}` (with the affiliate code as a query param if needed), and either build the SmartLink view or soften the blog/login copy.

### Low

**D-L1 — "My campaigns" lists offers the affiliate never joined.** `AffiliateMyCampaigns` filters only by `status === 'active'` and even says so ("In demo mode this lists active offers as a sample", `pages/affiliate.tsx:141-154`). The label is wrong; the disclosure is present. Fix: label it "Active offers (sample)" or filter by actual applications.

**D-L2 — Offer-application confirmation promises a notification that cannot come.** "Application submitted. You will be notified when the advertiser reviews it." (`pages/affiliate.tsx:104-105`). No notification mechanism exists in demo mode. Fix: "Application recorded in this demo — no notification is sent."

**D-L3 — Demo landing pages are `example.com`.** Worker demo offers land on `https://example.com/landing-a|b`; web demo offers on `https://example.com/finance-card|shop|saas-trial`. A visitor testing a real click lands on example.com with no explanation. Fix: point demo landings at a page on affilayer.com that explains the click was tracked, or label the redirect.

**D-L4 — Conversion auth errors use 400, not 401.** Missing or wrong signature → `400 {"error":"bad signature"}` (`services/tracking-worker/src/index.ts:140-143`); missing `POSTBACK_SECRET` → 500. Cosmetic API hygiene; fix to 401 for auth failures.

**D-L5 — Paused offers appear in the tracking-link generator.** The offer dropdown in `AffiliateTrackingLinks` lists every offer including `demo-offer-3` (status `paused`). Fix: filter to `active` offers.

**D-L6 — Funnel steps 3–5 (affiliate) / 2–4 (advertiser) link straight into auth-gated pages.** A signed-out visitor clicking them is redirected to `/login` with no explanation (`RequireAuth`, `App.tsx:65-71`). Fix: send them to `/login?next=…` with a "Sign in to continue" note, or point the funnel CTAs at `/register` until signed in.

---

## 4. Edge cases (dry, from code + live probes)

### 4a. Tracking clicks — live probes (7 Nov ~22:00 +06)

| Probe | Result |
|---|---|
| `GET go.affilayer.com/c/AFF-DEMO-001/demo-offer-1` (dashboard-generated link) | **404 `{"error":"offer not found"}`** — D-C2 |
| `GET go.affilayer.com/c/AFF123/offer-a` (Worker-seeded) | 302 → `https://example.com/landing-a?click_id=clk_…` — works, lands on example.com (D-L3) |
| `GET go.affilayer.com/c/AFF123/nonexistent-offer` | 404 `{"error":"offer not found"}` (code path `index.ts:204-207`) — correct behaviour |
| `GET go.affilayer.com/s/AFF-DEMO-001/test` (helper format) | **404 `{"error":"not found"}`** — D-M6 |
| `GET go.affilayer.com/s/test` (documented format) | 302 → `https://example.com/landing-b?click_id=clk_…` — works |
| `GET go.affilayer.com/health` | 200 `{"ok":true}` |
| `GET go.affilayer.com/api/stats` | 200, all zeros — **despite two 302 clicks seconds earlier** (per-isolate store, D-M4). Also: this endpoint is public, no auth. |

### 4b. Conversion POSTs — stated from code (`services/tracking-worker/src/index.ts:132-186`, `postbacks.ts:34-46`)

The live unsigned-POST probe could not complete from this VM (egress timeout, HTTP 000) — the responses below are from the code, which is unambiguous on each path.

| Case | Exact response |
|---|---|
| No signature header | `400 {"error":"bad signature"}` (`verifySignature` returns false when signature is undefined) |
| Wrong signature | `400 {"error":"bad signature"}` (HMAC-SHA256 hex, constant-time compare; optional `sha256=` prefix accepted) |
| Duplicate `idempotency_key` | `200 {"ok":true,"duplicate":true,"conversion":{…original…}}` (also deduped on same `click_id`+`offer_id` even with a different key) |
| Negative payout | `400 {"error":"missing or invalid fields: click_id, offer_id, payout, currency, idempotency_key are required"}` (validation: `payout < 0` rejected; zero is accepted) |
| Missing `click_id` | Same 400 as above |
| Missing `currency` / `offer_id` / `idempotency_key` / non-numeric payout | Same 400 as above |
| `POSTBACK_SECRET` unset | `500 {"error":"POSTBACK_SECRET not configured"}` (not applicable live — the secret is set) |
| Valid signed conversion, new key | `201 {"ok":true,"duplicate":false,"conversion":{…},"ledgerEntry":{…},"commission":…,"postbacks":[…]}` — conversion always starts `pending`; postback failures never fail the conversion |
| Conversion for a `click_id` that was never recorded | **Accepted (201)** with `affiliateCode: undefined` and a ledger entry with `affiliateCode: ''` — D-H5 |
| Currency `"XXX"` / payout `1e12` | Accepted (no allowlist, no upper bound) — D-H5 |

### 4c. Login edge cases — from code (`packages/shared/src/demo-login.ts`, `apps/web/src/pages/auth.tsx`, `lib/auth.tsx`)

| Case | Result |
|---|---|
| Empty password | Browser blocks submit (`required` on the input). If bypassed, `checkDemoCredentials` returns `Incorrect demo password.` (empty string ≠ `1234`) |
| Real-looking email + any password, demo mode | No Supabase call; error `Supabase is not configured — use the demo role-picker below.` |
| `DEMO-PUBLISHER` / `Demo-Publisher` | Works — username is trimmed + lowercased before matching |
| ` demo-publisher ` (spaces) | Works — trimmed |
| ` 1234 ` (spaces in password) | Works — password is trimmed before comparison (`demo-login.ts:44`) |
| `demo-publisher` + wrong password | `Incorrect demo password.`, stays on `/login` (live-verified 21:36) |
| Demo username after Supabase is configured | Refused outright: `Demo login is only available in demo mode.` — demo credentials never reach real auth |

### 4d. Contact form — from code (`pages/public.tsx:296-352`)

All four fields are `required` (name, email `type="email"`, subject, message) — empty submission is blocked by the browser. On submit: the message is appended to `localStorage['affilayer-contact']` and a "Message received" confirmation is shown. **No network request is made.** See D-H2.

---

## 5. Broken links — 69 internal links checked live

Source of truth: every `href="/…"` extracted from all 99 prerendered HTML files in `apps/web/dist/` (69 unique internal links), each fetched live at `https://affilayer.com{path}` in parallel (8-way, 20 s timeout). **Result: 69/69 returned HTTP 200.** That number is misleading on its own: Cloudflare Pages' SPA fallback serves `index.html` with 200 for *any* path, so HTTP status cannot distinguish a real page from a soft-404. Body-level verification separates them:

| Class | Links | Evidence |
|---|---|---|
| Real pages (prerendered file + matching route) | 59 | `dist/<path>/index.html` exists and the route exists in `App.tsx` |
| **Soft-404s (200 at the edge, no route, no file, router bounces to `/`)** | **10** | `/es/about`, `/es/advantages`, `/es/blog`, `/es/contact`, `/es/faq`, `/pt/about`, `/pt/advantages`, `/pt/blog`, `/pt/contact`, `/pt/faq` — see D-H3. Live body check on `/es/about` returned the generic shell title, not the About title. |
| Auth-gated app links (200 via SPA fallback; redirect to `/login` when signed out) | 6 | `/app/affiliate/offers`, `/app/affiliate/tracking-links`, `/app/affiliate/earnings`, `/app/advertiser/create-offer`, `/app/advertiser/affiliates`, `/app/advertiser/conversions`, plus `/onboarding` — all valid routes, correct behaviour for signed-in users |
| Redirecting links | 0 | No 3xx observed in the sweep |

No hard 404s and no redirect chains in the 69. The sitemap (50 URLs) contains only real routes — the 10 dead ES/PT paths are **not** in the sitemap; they exist only in the header/mobile nav on ES/PT pages. External links (`mailto:`, docs) were not in this sweep's scope except as noted: `docs.affilayer.com` does not resolve (known, DNS record missing — the docs site itself works at `affilayer-docs.pages.dev`).

---

## 6. Honest-copy spot check

Every sentence below was read in the source (`apps/web/src/pages/*.tsx`, `lib/i18n-dict.ts`, `lib/faq-data.ts`, `lib/blog-data.ts`, `lib/geo-data.ts`, `pages/geo.tsx`) and, where the claim is about the live system, checked against the code.

| # | Sentence (where it appears) | Assessment |
|---|---|---|
| 1 | "Applications reviewed by our team, typically within 2 business days." (footer trust row every page; home note; FAQ; geo Q&A ×8 countries ×3 locales) | **Unverifiable / currently untrue** — no review pipeline exists; registration fails in demo mode. D-M1. |
| 2 | "Payouts manual and admin-approved, Net30 by default." (footer; FAQ; Terms §4; geo bullets) | **Aspirational, presented as fact.** The policy is stated consistently and the demo ledger does model Net30/manual approval, but no real payout has ever been processed and no payment rail is connected. Acceptable as a stated policy *if* registration worked; misleading while it doesn't. |
| 3 | "Every commission written to an auditable ledger." (footer trust row) | **True in the demo model** (append-only ledger in the demo store; Worker records a ledger entry per conversion) — but the demo ledger lives in the visitor's browser and the Worker ledger is per-isolate ephemeral. The claim is about the product design, not a live guarantee. Low risk. |
| 4 | "Operated by MarketSync Global LLC, New Mexico, USA." (footer; About) | **Verifiable and true** per the company's own records (Business ID 0008064284). Pass. |
| 5 | "We do not promise results … performance depends on the offer, the audience and the traffic." (About) | **True and honest.** Pass. |
| 6 | "A small network built on open books, not big promises." / "No promised results — we promise open records, not earnings." (About slogan; Advantages) | **True.** Pass. |
| 7 | "There is no public partner directory yet — partnerships are agreed one by one." (Partner) | **True and honest.** Pass. |
| 8 | "White-label setups are arranged one by one — there is no self-serve white-label plan yet. Pricing is agreed per setup." (White label) | **True and honest** — but the same page also says "Your affiliates never see AffiLayer", a promise about a product that does not exist yet. Low: qualify it as the intended experience. |
| 9 | "AffiLayer puts your offer in front of affiliates who run traffic across many countries and verticals." (Advertise) | **Unverifiable** — there is no affiliate base yet (the only affiliate in the system is the demo profile). Aspirational copy presented as a current capability. Medium-adjacent; covered by the same fix as M1 (say "as the network grows" or similar). |
| 10 | "A real person replies, usually within 2 business days." (Partner page, step 2 — for `partner@affilayer.com`) | **Unverifiable** — the mailbox exists, but no reply SLA is evidenced and the same 2-day figure is used site-wide without a basis. Low/Medium. |
| 11 | "A real person answers." (Contact slogan) + "Include your click ID so we can look it up." | **Misleading in context** — the contact *form* (the page's main action) never reaches a person (D-H2). The mailto route is real. |
| 12 | "The network opens with direct CPA offers, SmartLink routing, full-funnel tracking and an auditable commission ledger — and nothing we have not actually built." (Blog, launch post) | **Mostly true, with two overstatements:** SmartLink routing exists in the Worker but has no management UI and the web helper generates broken URLs (D-M6); "full-funnel tracking" is two disconnected systems (D-M4). The same post honestly discloses what is *not* live yet (Supabase backend, small catalogue) — the best disclosure on the site. |
| 13 | "Your traffic, your links, your ledger." / "One network. Every click tracked, every commission accounted for." (slogans) | **Aspirational.** The ledger claim fails for real clicks today (D-C1/C2/D-M4). |
| 14 | Geo pages: "AffiLayer is open worldwide… the same tracking, the same ledger, the same manual payout review." / "AffiLayer accepts applications from affiliates and advertisers worldwide." | **No invented local facts** — checked: geo pages contain no payout figures, no local offices/staff/payment methods, no country-specific offer counts (verified in `geo-data.ts`, `pages/geo.tsx` and `dist/geo/br/index.html` — no `$` amounts anywhere). The 2-business-day claim repeats here too (D-M1). Pass on local claims. |
| 15 | "Free to join." (home note) | **True as a price** (no fee is charged) but **false as an action** — joining currently fails (H1). |

**Copy verdict:** the site is unusually careful about not inventing numbers, testimonials or clients — no fake stats were found anywhere. The dishonesty is structural, not numerical: present-tense claims about a live network (reviews, replies, payouts, affiliates) while the product is demo-only with no backend.

---

## 7. Error states

| State | What the visitor sees | Verdict |
|---|---|---|
| 404 (`/nonexistent-page`) | HTTP 200, SPA shell, then a silent redirect to `/`. No "not found" page, no message. | **D-H4** |
| JS disabled (or bundle fails to load) | The static branded loader ("AffiLayer" + sweeping gold bar) forever. The `<noscript>` block contains only a `<style>` rule; there is no message, no content, no contact alternative. | **D-M3** |
| Tracking Worker down | The site renders identically — **the web app never calls the Worker** (grep-verified: no `fetch(` to the Worker anywhere in `apps/web/src`). Only generated tracking links fail, and only when followed. The dashboard shows local demo data regardless. | Pass for the site; the failure mode is invisible to the visitor until they click a link (which is already broken per D-C1). |
| Supabase unconfigured | The whole app runs in demo mode with the banner + badge. Correct and labelled — *inside* the dashboard. Public pages do not disclose it. | Pass (dashboard) / H1 (public) |
| Corrupt demo session (`localStorage` unparseable) | `load()` in `demo-store.ts` catches and re-seeds; `AuthProvider` ignores corrupt session JSON. Fail-safe. | Pass |

---

## 8. Passes (spot-checked, no finding)

1. Demo login both roles + wrong-password rejection — live-verified 21:36–21:37, all 4 checks pass; code guardrails confirmed (never calls Supabase in demo mode; refuses when configured).
2. Create-offer validation + explicit demo-only confirmation.
3. Payout-request validation (min $50, ≤ approved balance) + demo footnote.
4. Postbacks page footnote ("stored locally only, not sent anywhere").
5. Conversion dedup: idempotency key *and* click+offer, 201 new / 200 duplicate.
6. Signature verification: HMAC-SHA256, constant-time compare, `sha256=` prefix accepted; missing/wrong signature rejected.
7. Nonexistent offer on the tracker returns a correct 404 JSON.
8. Login with a real-looking email in demo mode makes no Supabase call and returns a clear error.
9. Blog launch post discloses what is not live yet (Supabase backend, small catalogue).
10. Geo pages: no invented local facts, figures, offices or staff.
11. No fake stats, testimonials, client logos or invented numbers anywhere in public copy.
12. Sitemap: exactly 50 URLs, all real routes; dead ES/PT paths not included.
13. Docs site (`affilayer-docs.pages.dev`): tracking/postbacks/payouts/API pages match the Worker's actual behaviour; SmartLink URL format documented correctly (`/s/{smartlink_code}`).
14. Demo banner on every dashboard page; Demo badge in the dashboard header; audit log records demo actions.

---

## 9. Unverified (needs a live browser — not attempted)

1. **Visual rendering at ~390 px** (header, hero, cards, hamburger, demo banner above/below the fold) — the browser has no viewport resize; needs a phone check.
2. **ES/PT nav bounce on hydration** — strongly evidenced (no route, no prerendered file, catch-all redirect, generic shell served live) but the actual click → redirect was not observed in a live browser.
3. **Unsigned POST /conversion live response** — VM egress timed out (HTTP 000); the 400 response is from code only.
4. **Register error visibility** — whether the "Supabase is not configured" error is visible without scrolling on mobile (the demo note sits below the submit button).
5. **Whether `support@` / `partner@` mailboxes actually receive mail** — the `mailto:` links are real and the mailboxes were verified ON at the provider earlier (per prior session notes); end-to-end receipt was not tested.

---

## 10. Recommended fix order

1. **C1** — rebuild with `VITE_TRACKING_URL=https://go.affilayer.com`; assert the bundle contains it. (Build config, ~10 min.)
2. **C2** — unify the offer catalogue between the web demo store and the Worker seed. Re-probe the dashboard-generated link live; it must 302.
3. **H1** — honest register interstitial in demo mode; stop promising 2-day reviews until the pipeline exists.
4. **H2** — demo disclosure on the contact + ticket forms *before* submit; never show "We will reply" when nothing is sent.
5. **H3** — only localise paths in `LOCALIZED_BASE_PATHS` in the header/mobile nav.
6. **H4** — real 404 page instead of redirect-to-home.
7. **H5** — require the click to exist for conversions; validate currency; cap payout; rate-limit; auth or remove `/api/stats`.
8. **M1/M2/M5/M6** — copy corrections (review timeline, advertiser approve/reject, CPS rate field, SmartLink helper + blog claim).
9. **M3/M4** — noscript message; durable Worker store + dashboard wired to Worker stats.
10. **L1–L6** — label and small-UI fixes.

*End of Agent D report. Read-only throughout: no changes were made to the site, the Worker, or any data. Live probes were GETs and one unsigned error-path POST that wrote nothing.*
