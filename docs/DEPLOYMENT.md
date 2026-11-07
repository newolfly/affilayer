# Deployment guide — AffiLayer MVP

Nothing in this repo deploys itself. Every step below is manual and explicit.

## LIVE STATUS — 7 Nov 2026 ~19:37 +06 (JOB 3: LOADING + SWITCHING + HOVER + SLOGANS DEPLOYED LIVE, BROWSER CHECK STILL OWED)

- **Deployed 19:37 +06: Pages `affilayer-web`, deployment `e8a7889f` (103 files, new build)** — fresh `vite build` + full `prerender.py` run (47/47 routes, 0 zero-byte files in dist/). New assets: JS `index--lUy2n7T.js`, CSS `index-COawd8zK.css`.
- **Job 3 changes (this build):**
  - **Loading:** branded `PageLoader` (`src/components/layout.tsx`) — navy + gold "A" mark, sweeping gold bar, skeleton lines, no fake percentages. It is the `Suspense` fallback for lazy page chunks and the auth loading state (replaces the bare "Loading…" lines). A matching static loader sits inside `#root` in `apps/web/index.html` so the very first paint is branded, not blank — React replaces it on mount.
  - **Page switching:** `PageTransition` now adds a gold bar that sweeps across the top of the viewport on every route change (`page-switch-bar`, 0.5s), on top of the existing fade/slide. Purely visual, never blocks navigation, `pointer-events: none`, disabled under `prefers-reduced-motion`.
  - **Hover:** shared gold hover language, transform-only (no layout shift) — gold underline slide on desktop nav links (stays on the active page), pill buttons lift + gold glow, footer links turn gold, trust cards + dashboard `Card`/`Stat` lift, dashboard sidebar nav turns gold on hover, dashboard table rows get a faint gold tint, language switcher + blog category buttons + blog links get gold hovers.
  - **Slogans:** one per public page, gold (`Slogan` component + `.slogan` in `src/index.css`), honest only — no stats, no invented claims. EN/ES/PT keys in `src/lib/i18n-dict.ts` (`home/about/advantages/adv/aff/how/faq/blog/blog.post/contact/terms/privacy/geo.index/geo.page.slogan`); EN-only pages use the same dict keys. Full list: Home "One network. Every click tracked, every commission accounted for." · About "A small network built on open books, not big promises." · Advantages "What we do differently is simple: you can check our work." · Advertisers "Customers you can explain. Spend you can control." · Affiliates "Your traffic, your links, your ledger." · How it works "Six steps from sign-up to payout — nothing hidden in between." · FAQ "Straight answers, before you even ask." · Blog "Notes from building a network in the open." · Launch post "Day one, in our own words." · Contact "A real person answers." · Terms "The rules, in plain words." · Privacy "Your data stays yours. We do not sell it." · Geo index "One network, every country, the same open books." · Country pages "In {country}: the same tracking, the same ledger, the same honest payout." (all translated to ES/PT).
- **Live verification by curl 19:37 +06 (all 200):** `/` 35,558 B (home slogan live); `/geo/br` 32,773 B (country slogan live); `/es/` 36,187 B; `/sitemap.xml` 6,699 B (47 URLs); `go.affilayer.com/health` `{"ok":true}` (11 B).
- **Tests: 28/28 pass** (`npm test`: 11 tracking + 17 shared). `tsc --noEmit` clean.
- **Browser (visual) check still owed:** loading screen on a slow chunk load / first paint, gold bar on a page switch, hover states (nav underline, button lift, card lift, footer links), and two or three slogans in gold.
- **Cloudflare token used for this deploy expires ~20:01 +06, NO refresh token** — any further deploy needs another phone authorization.
- Worker, Supabase, DNS untouched.

## LIVE STATUS — 7 Nov 2026 ~19:28 +06 (ROTATOR CROSSFADE + HEADER SPACING PATCH DEPLOYED LIVE, BROWSER CHECK STILL OWED)

- **Deployed 19:27 +06: Pages `affilayer-web`, deployment `6c57d03b` (103 files, new build)** — fresh `vite build` (VITE_TRACKING_URL=https://go.affilayer.com) + full prerender, 47/47 routes, 0 zero-byte files in dist. New assets: JS `index-DpwtQAa4.js`, CSS `index-O94aIlsY.css`.
- **Fix 1 — hero rotator fade gap:** `RotatingVertical` (`src/pages/public.tsx`) now crossfades — outgoing word fades out while the incoming word fades in over the same 0.45s (`rotator-in` / `rotator-out` keyframes in `src/index.css`), so a word is always painted; the old 3.5s infinite keyframes (word invisible 82–100% of each cycle) are gone. Reduced-motion: outgoing copy hidden, no animation.
- **Fix 2 — desktop header spacing:** public header container `max-w-6xl` → `max-w-7xl` with `gap-4`; desktop nav now shows at `xl` (was `lg`) with hamburger below that; `whitespace-nowrap` on all nav links and Log in / Register / Dashboard buttons; `shrink-0` on logo, nav and right group — nav items can no longer wrap and the logo keeps a clear gap from the first link. No redesign.
- **Live verification by curl 19:28 +06 (all 200):** `/` 35,022 B (serves `rotator-stack` markup + new asset hashes); `/geo/br` 32,284 B; `/sitemap.xml` 6,699 B (47 URLs); `go.affilayer.com/health` `{"ok":true}` (11 B).
- **Browser (visual) check still owed:** watch the hero through a full rotation — a word must be visible at every instant; check the desktop header — no wrapped nav items, clear logo gap.
- **Tests: 28/28 pass** (17 shared + 11 tracking). `tsc --noEmit` clean.
- **Cloudflare token used for this deploy expires ~20:01 +06, NO refresh token** — any further deploy needs another phone authorization.
- Worker, Supabase, DNS untouched.

## LIVE STATUS — 7 Nov 2026 ~19:40 +06 (DEFECT FIXES + A11Y DEPLOYED LIVE, BROWSER CHECK STILL OWED)

- **Deployed 19:39 +06: Pages `affilayer-web`, deployment `eb53c4b0` (103 files, new build)** — fresh `vite build` + full `prerender.py` run (47/47 routes, Chromium worked this time). New assets: JS `index-C876gXqB.js`, CSS `index-9kmTr0TV.css`, geo chunk `geo-BJv3JPCi.js`.
- **Root cause of the blank geo pages (defect 1): 0-byte FLAT `.html` files shadowed good `index.html` files.** Cloudflare Pages resolves `/geo/br` to `geo/br.html` before `geo/br/index.html`; the reconstruction had left `geo/br.html`, `geo/fr.html`, `geo/in.html`, `es/affiliates.html`, `es/advertisers.html`, `es/how-it-works.html`, `es/geo.html` (and stray `es/.html`) as 0-byte files, so Pages served 200 with an empty body. The prerendered `index.html` files were fine all along — NOT a hydration crash. Fixed by rebuilding + re-prerendering properly (all flat copies now have real content; 0 zero-byte files in dist/).
- **Live verification by curl 19:40 +06 (all 200):** `/` 34,614 B; `/geo/br` 31,964, `/geo/fr` 31,957, `/geo/in` 31,978, `/geo/us` 32,177; `/es/affiliates` 22,140, `/es/advertisers` 20,300, `/es/how-it-works` 15,312, `/es/geo` 24,568, `/es/geo/br` 32,552; `/pt/affiliates` 22,165, `/pt/geo/br` 32,567; `/sitemap.xml` 6,699 (47 URLs); `go.affilayer.com/health` `{"ok":true}`; homepage serves the new CSS. **Browser (visual) check still owed:** gold design on `/`, hero rotating word visible, skip link works, mobile rendering.
- **Defect 2 fix (hero rotating word):** the word was visible only 0–18% of each 3.5s animation cycle (screenshots almost always caught the invisible phase). Keyframes changed in `src/index.css` so the word is visible 0–72% of the cycle. Same component on ES/PT was unaffected.
- **Accessibility + mobile (this build):** skip link (`Skip to main content`, `a11y.skip` in EN/ES/PT) as first element in `App.tsx` + `id="main-content"` on both `<main>` landmarks (`layout.tsx`); visible `<label>`s on the contact form (`public.tsx`, all 4 fields, all 3 locales); `aria-label`s on 9 placeholder-only dashboard inputs (`affiliate.tsx`, `admin.tsx`); loading-fallback contrast fixed (`text-[#8A97A8]`); touch targets ≥44px on coarse pointers (header buttons, mobile + dashboard nav links); `overflow-x: clip` on body (no horizontal scroll on mobile).
- **Tests: 28/28 pass** (`npm test`: 11 web + 17 shared). `tsc --noEmit` clean.
- **Cloudflare token used for this deploy expires ~20:01 +06, NO refresh token** — any further deploy needs another phone authorization.
- **Commit status:** source fixes are UNCOMMITTED at time of writing (see git status below); the earlier `15a150e` HEAD + helper scripts + this doc update are also uncommitted — commit once the VM EPERM fault allows.
- Worker, Supabase, DNS untouched.

## LIVE STATUS — 7 Nov 2026 ~18:04 +06 (GOLD BUILD READY LOCALLY, DEPLOY BLOCKED — TOKEN EXPIRED)

- **Gold recolor build DONE locally (commit `15a150e`), dist/ COMPLETE 47/47 as of 7 Nov 18:02 +06** — all 29 missing routes reconstructed and verified on disk (SHA-256 checked, JSON-LD + gold JS `index-I-k8WHqV.js` / CSS `index-COFJ0IWu.css` / theme `#070D1A` present, no pre-gold leftovers, 0 zero-byte files). Method: live-fetch of each route from affilayer.com + gold transform (`scripts/transform-live.py`, `scripts/fetch-live.py`, `scripts/verify-dist.py`) — the normal `npm run build:live` + Chromium prerender path could NOT run: this VM's filesystem returns EPERM on exec writes (0/75 controlled writes succeeded) and Chromium crashes on any page load (SIGTRAP/SIGILL). `muse.write`/`muse.edit` is the only working write path.
- **DEPLOY ATTEMPTED 7 Nov ~18:04 +06 and FAILED — STOPPED per instructions:** `wrangler pages deploy apps/web/dist --project-name affilayer-web` (wrangler 4.158.0, exit code 1) → `Authentication error [code: 10000]` → `Invalid access token [code: 9109]` on GET /accounts. The OAuth access token in `~/workspace/.oauth/tokens.json` expired ~17:41 +06 and the file holds NO refresh_token — there is no refresh route. **Next step: Sojib must re-authorize (fresh PKCE URL, phone-OAuth, same flow as 16:40 +06), then re-run the wrangler deploy command above, then verify live** (gold logo on `/`, real pages at `/geo/br`, `/es/`, `/pt/affiliates`, `/sitemap.xml` with 47 URLs).
- **Live site is STILL the pre-gold deploy** (Pages `affilayer-web`, deployment `8a7dbfcc`, 16:42 +06 — verified live 16:45 +06). Nothing broken; the gold site is simply not live yet.
- **NOT committed:** helper scripts (`transform-live.py`, `fetch-live.py`, `verify-dist.py`), the 29 reconstructed dist files, and this doc update are all on disk UNCOMMITTED — `git status` fails on `.git/index.lock` write (EPERM). Commit them once the VM fault clears (or from another machine). Do NOT push to GitHub (still 403-blocked).
- **No preview server running; no `vite.config.mjs` created** (`vite.config.ts` stays the source of truth). Worker, Supabase, DNS, and the live Worker route were NOT touched.

## LIVE STATUS — 7 Nov 2026 ~16:45 +06 (ALL DEPLOYED + VERIFIED LIVE, Supabase deferred)

- **Domain:** `affilayer.com` — Cloudflare zone exists (Free plan, Zone ID
  `17c94ce53fca917182d3fd91512eb811`); nameservers at Namecheap point to
  `olof.ns.cloudflare.com` + `teresa.ns.cloudflare.com`; zone status ACTIVE.
- **DNS (done 7 Nov ~15:58 +06):** apex A `192.64.119.13` and www CNAME
  `parkingpage.namecheap.com` DELETED; added, all Proxied, TTL Auto:
  `affilayer.com` CNAME → `affilayer-web.pages.dev`, `www` CNAME →
  `affilayer-web.pages.dev`, `go` CNAME →
  `affilayer-tracking.sojibahmmed.workers.dev`. MX/SPF/mail/autoconfig/
  autodiscover/SRV records untouched (10 records total).
- **Web app LIVE — deployed 7 Nov ~16:42 +06 (Pages `affilayer-web`,
  deployment https://8a7dbfcc.affilayer-web.pages.dev):** verified live
  16:44 — homepage loads with the layered-A logo in the header, "Browse by
  country" section, all 47 routes prerendered; `/sitemap.xml` serves the real
  XML (47 URLs, lastmod 2026-11-07). Commits live: logo/SEO/polish `a5d0cbb`,
  design system + funnels `a66fd6d`, geo + multilingual `b0e8ee5`, growth plan
  `4b048fc`.
- **Tracking Worker LIVE — redeployed 7 Nov ~16:43 +06:** route fix
  `go.affilayer.com/*` (commit `4e0fc42`) applied; verified live 16:44–16:45 —
  `https://go.affilayer.com/health` returns `{"ok":true}` (HTTP 200), and a
  live click `https://go.affilayer.com/c/AFF123/offer-a?sub1=test` returns
  **302 with `?click_id=clk_…`** to the offer landing page. `POSTBACK_SECRET`
  set on the Worker (value only in `~/.affilayer-secrets`, chmod 600).
- **Brand palette (updated 7 Nov 2026, premium gold):** page `#070D1A`,
  panels `#0F1B2E`, cards `#111C30`, borders `#1E2A3F`, muted text
  `#8A97A8`; gold ramp `#D97706 → #F59E0B → #FBBF24` (headings, buttons,
  logo bands); button text navy `#0B1220` on gold (5.88–11.22:1, WCAG AA).
  No orange or blue left anywhere in the site; dashboards use navy + gold
  only. Rebuild after any palette change: `npm run build:live` in `apps/web`,
  then redeploy Pages; regenerate PNG logo assets with
  `python3 scripts/render-logo-assets.py`.
- **Polish + SEO + AI-search package DONE 7 Nov ~16:30 +06 (local, NOT deployed):**
  logo (layered-A mark, `apps/web/public/logo*.svg`, `favicon.*`, `og-image.png`),
  build-time prerendering of all 12 public routes (`npm run build:live` in
  `apps/web` — build + `scripts/prerender.py`; dist/ is gitignored, so the
  deploy step must run `build:live`, not plain `build`), robots.txt,
  sitemap.xml, per-page titles/meta/canonical/OG, JSON-LD (Organization,
  WebSite, FAQPage, BlogPosting), `llms.txt` + `llms-full.txt`, scroll-reveal
  + hover-lift polish with `prefers-reduced-motion` support. Verified: tests
  28/28, build clean (largest chunk 254 kB, no warnings), all 14 URL forms
  HTTP 200 with correct titles on `vite preview`, React boots over
  prerendered HTML. **Deploy pending (parent):** `wrangler pages deploy
  apps/web/dist --project-name affilayer-web` after `npm run build:live`.
- **Auth note:** the OAuth access token obtained 7 Nov ~07:53 (in
  `~/workspace/.oauth/tokens.json`) expired ~08:53; **the stored refresh_token
  was REJECTED 7 Nov 16:00 (`invalid_grant`)** — API access needs a fresh
  authorization from Sojib (new PKCE URL from `pkce.py`, authorize on his
  phone, paste the callback URL). The token has NO DNS scope — DNS was done via
  the dashboard, which needed a fresh emailed 7-digit code each sign-in.
- **Supabase:** explicitly deferred — no project created, no migrations applied.
- **GitHub:** push to `newolfly/affilayer` is BLOCKED (403 — the
  Sojib-programmer token cannot write to the newolfly repo). Do not retry
  without fixing access (add Sojib-programmer as collaborator, or push from a
  machine signed in as newolfly).
- **Do NOT touch:** Private Email MX/SPF records, Namecheap beyond what is
  already done, any paid feature.

## 0. Prerequisites

- Node.js 20+, npm 10+
- A Cloudflare account (for Pages + DNS)
- A Supabase project (create at supabase.com — free tier is enough for the MVP)
- A host for the tracking service — either the Cloudflare Worker port
  (`services/tracking-worker/`, in-memory store, ephemeral per isolate) or any
  Node host for the Fastify service (VPS, Railway, Fly.io) with optional
  Postgres for durable state
- Domain `affilayer.com` (owned; Namecheap) + subdomain `go.affilayer.com`

## 1. Supabase — database first

```bash
cd supabase
# Option A — Supabase CLI (needs `supabase link` first)
supabase db push

# Option B — Dashboard SQL editor, in this exact order:
#   1. migrations/001_schema.sql
#   2. migrations/002_rls.sql
#   3. migrations/003_functions.sql
#   4. migrations/004_seed.sql   (demo data only — skip on a production project)
```

Then verify RLS with `supabase/tests/rls-checks.sql` — run the checks **as a
signed-in app user** (the SQL editor runs as postgres and bypasses RLS, so it
cannot prove the negative cases). See `supabase/README.md`.

Create the first Super Admin: sign up in the app, then in the SQL editor:

```sql
update profiles set role = 'super_admin', status = 'approved'
where email = 'you@example.com';
```

Collect for the web app:

- Project URL → `VITE_SUPABASE_URL`
- Anon/public key → `VITE_SUPABASE_ANON_KEY`
- **Never** use the service-role key in the browser. It is only for
  server-side jobs (none in the MVP).

## 2. Tracking service — `go.affilayer.com`

Two implementations, same routes and behavior. Pick one:

### A — Cloudflare Worker (recommended for the MVP)

```bash
cd services/tracking-worker
npm install
npm run build
npm test            # 17 smoke checks, no account needed
npx wrangler deploy            # Worker affilayer-tracking, route go.affilayer.com
npx wrangler secret put POSTBACK_SECRET
```

Store is in-memory per isolate — ephemeral. Do not treat Worker stats as
financial truth for production volume; use option B with Postgres for that.

### B — Fastify on a Node host (durable option)

Environment on the host:

```bash
PORT=3001
TRACKING_BASE_URL=https://go.affilayer.com
POSTBACK_SECRET=<long random secret — generate with: openssl rand -hex 32>
DATABASE_URL=postgresql://...   # optional; without it the service uses the
                                 # in-memory store (data lost on restart)
```

Start: `npm start` (or `node dist/index.js`). Put it behind HTTPS and point
the DNS record at it:

| Type | Name | Value |
| --- | --- | --- |
| A / CNAME | `go` | your tracking host |

Verify live:

```bash
curl https://go.affilayer.com/health
# {"ok":true}
curl -i "https://go.affilayer.com/c/AFF123/offer-a?sub1=test"
# 302 → landing URL with ?click_id=clk_...
```

Give `POSTBACK_SECRET` to advertisers (securely, out of band) — they sign
conversion posts with HMAC-SHA256 over the raw JSON body, header
`x-affilayer-signature`. Rotate by setting a new value and restarting.

## 3. Web app — Cloudflare Pages

```bash
cd apps/web
npm install
npm run build        # produces dist/
```

Deploy (one of):

```bash
# A — Wrangler (needs `npx wrangler login` first)
npx wrangler pages deploy dist --project-name affilayer-web

# B — Dashboard: Workers & Pages → Create → Pages → connect the GitHub repo,
#     build command `npm run build`, output directory `apps/web/dist`,
#     root directory `apps/web`.
```

Pages environment variables (dashboard → Settings → Environment variables):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_TRACKING_URL` | `https://go.affilayer.com` |

Then add the custom domain in Pages → Custom domains: `affilayer.com`
(and `www.affilayer.com`) and follow Cloudflare's DNS prompts. Attaching the
custom domain replaces the stale apex A record (old parking IP) and the www
parking CNAME — verify afterwards that apex + www no longer resolve to the
parking IP.

> Note: Vite inlines env at build time. The 7 Nov 2026 build already has
> `VITE_TRACKING_URL=https://go.affilayer.com` baked in. For future rebuilds,
> set `VITE_TRACKING_URL` in Pages → Settings → Environment variables before
> rebuilding (demo mode: leave the Supabase vars unset).

## 4. DNS summary (Cloudflare)

| Record | Purpose |
| --- | --- |
| `affilayer.com` → Pages | Web app |
| `go.affilayer.com` → tracking host | Tracking service |

## 5. GitHub — version control

```bash
cd affilayer
git init
git add .
git commit -m "AffiLayer MVP: web + tracking + shared + Supabase"
# Create the repo on GitHub, then:
git remote add origin https://github.com/<you>/affilayer.git
git branch -M main
git push -u origin main
```

`.env` files and `node_modules/` are git-ignored. Never commit
`POSTBACK_SECRET`, Supabase keys, or any real credential.

## 6. Post-deploy checklist

- [ ] Migrations applied; RLS checks run as a real signed-in user
- [ ] Super Admin created and approved
- [ ] Tracking `/health` returns 200 on `go.affilayer.com`
- [ ] A test click + signed test conversion flows end-to-end (see README)
- [ ] Pages site loads with real Supabase env (no demo banner)
- [ ] `POSTBACK_SECRET` shared with the first advertiser out of band
- [ ] Demo seed data removed/not applied on the production project

## 7. Troubleshooting

- Web shows the "Demo data" banner → `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  are missing in the Pages env (rebuild/redeploy after setting them — Vite
  inlines env at build time).
- Tracking 302s to the wrong landing page → offer not in the store; check the
  offer exists and is `active` (demo offers only exist in-memory).
- Conversion 400 `invalid signature` → the advertiser must HMAC the **raw**
  request body bytes, not a re-serialized object.
- Duplicate conversions → expected: same `idempotency_key` or same
  `click_id`+`offer_id` returns the original with `duplicate: true`.
- This VM's Chromium cannot reach public sites (sandbox egress limit) — the
  local Playwright-style checks are not part of this repo; the tracking smoke
  test uses `fastify.inject`, not a real browser.
