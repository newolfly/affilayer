# Deployment guide — AffiLayer MVP

Nothing in this repo deploys itself. Every step below is manual and explicit.

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
