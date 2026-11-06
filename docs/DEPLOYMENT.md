# Deployment guide — AffiLayer MVP

Nothing in this repo deploys itself. Every step below is manual and explicit.

## LIVE STATUS — 7 Nov 2026 (deploy in progress, Supabase deferred)

- **Domain:** `affilayer.com` — Cloudflare zone exists (Free plan, Zone ID
  `17c94ce53fca917182d3fd91512eb811`); nameservers at Namecheap already point
  to `olof.ns.cloudflare.com` + `teresa.ns.cloudflare.com` and have propagated.
  The zone will flip Pending → Active once Cloudflare verifies it.
- **Current state:** https://affilayer.com/ shows Cloudflare **522** — the
  imported apex A record still points at the old Namecheap parking IP
  (`192.64.119.13`) and `www` at `parkingpage.namecheap.com`. Nothing is
  deployed yet. The 522 clears when the Pages deploy + DNS fix below are done.
- **Web app:** built and ready in `apps/web/dist` with
  `VITE_TRACKING_URL=https://go.affilayer.com` baked in (demo mode — no
  Supabase env vars). Deploy: `wrangler pages deploy apps/web/dist
  --project-name affilayer-web`, then attach `affilayer.com` + `www` as custom
  domains. Pages setup replaces the stale apex A record and www parking CNAME.
- **Tracking Worker:** ported and verified in `services/tracking-worker/`
  (`npm test` — 17/17 smoke checks pass; `wrangler deploy --dry-run` clean).
  Deploy: `wrangler deploy` (Worker `affilayer-tracking`, route
  `go.affilayer.com` from `wrangler.toml`), then `wrangler secret put
  POSTBACK_SECRET` (value in `~/.affilayer-secrets`, chmod 600, never in the
  repo). Store is in-memory per isolate — ephemeral, same as the Fastify dev
  default. The Fastify service in `services/tracking/` is untouched as the
  Node reference implementation (and the durable-Postgres option).
- **BLOCKED ON AUTH (single blocker):** `wrangler login` timed out waiting for
  the OAuth code — no browser was available to open the auth URL. To finish:
  run `wrangler login` on the build machine, open the printed OAuth URL in a
  browser, sign in as `sojbahmmed@gmail.com` and authorize; the
  `localhost:8976` callback completes on the build machine. Then run the
  deploy commands above. Alternative: create a scoped API token in the
  Cloudflare dashboard (Pages:Edit, Workers:Edit, Zone:Edit, DNS:Edit on the
  affilayer.com zone) and save it as `CLOUDFLARE_API_TOKEN`.
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
