# AffiLayer — Global CPA Affiliate Network (MVP)

A working affiliate network MVP: advertisers create offers, affiliates promote
them through tracked links, clicks convert through server-to-server postbacks,
and commissions flow through an immutable ledger with manual admin-approved
payouts.

**Live demo:** none yet — nothing here is deployed. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the manual deploy steps.

## Architecture

```
affilayer/
├── apps/web/               # Vite + React + TS + Tailwind — Cloudflare Pages-ready
├── services/tracking/      # Node.js + Fastify tracking service (go.affilayer.com)
├── packages/shared/        # Shared types + pure helpers (commission, macros, SmartLink)
├── supabase/migrations/    # Postgres schema, RLS, functions, demo seed
└── docs/DEPLOYMENT.md      # Manual deploy guide (Pages + tracking + Supabase)
```

| Piece | What it does |
| --- | --- |
| **Web** | Public site + role dashboards (Super Admin, Network Manager, Advertiser, Affiliate). Supabase Auth email/password; demo mode with clearly labeled fake data when Supabase isn't configured. |
| **Tracking** | `GET /c/{affiliate_code}/{offer_id}` click redirect, `GET /s/{code}` SmartLink, `POST /conversion` (HMAC-signed, idempotent), `GET /api/stats`. In-memory store for local dev; Postgres adapter when `DATABASE_URL` is set. |
| **Database** | 19 normalized tables, RLS on every user-facing table, immutable `commission_ledger`, `approve/reject_conversion` security-definer functions, `affiliate_balances` view. |

## Quick start (local)

```bash
npm install

# 1. Tracking service
npm run dev:tracking        # http://localhost:3001
#    or: cd services/tracking && npm run build && npm start

# 2. Web app (new terminal)
npm run dev:web             # http://localhost:5173
```

Open the web app: with no Supabase env configured it runs in **demo mode**
(banner on every page, demo role-picker on `/login`). Copy
`apps/web/.env.example` to `apps/web/.env` and fill in
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to connect a real project.
Never put a service-role key in the browser.

```bash
# Tests + builds (all must pass)
npm test                    # shared 17 + tracking 11 vitest tests
npm run build               # web (tsc + vite) + tracking (tsc) + shared (tsc)
```

## Tracking flow (end to end)

1. Affiliate generates a link: `https://go.affilayer.com/c/AFF123/offer-a?sub1=google`
2. Visitor clicks → tracking service records the click (click ID, GEO, device,
   referrer, subIDs) and 302-redirects to the offer landing page with `?click_id=`.
3. Advertiser's system fires a server-to-server conversion:
   `POST /conversion` with `{click_id, offer_id, payout, currency, idempotency_key}`
   and header `x-affilayer-signature` (HMAC-SHA256 of the raw body, key
   `POSTBACK_SECRET`). Same idempotency key or same click+offer returns the
   original conversion with `duplicate: true` — no duplicate conversions.
4. Conversion is created `pending`; a `pending` ledger entry is created.
   Admin approves/rejects (DB function `approve_conversion` /
   `reject_conversion`) → ledger moves to `approved`/`rejected`.
5. Approved commissions become payable; affiliate requests a payout; admin
   approves and records the manual payout. Balances are never directly editable.

## SmartLink

Deterministic only: eligible offers (status, country, device, traffic source,
caps) sorted by payout desc then ID asc, first one wins. No AI optimization,
no guaranteed monetization — the code and the copy both say so.

## Fraud & compliance

Click/conversion signals only (duplicate click IDs, burst clicks from one IP,
empty user agent, invalid traffic flags). Nothing auto-rejects a user on a
single IP/VPN signal; suspensions and significant financial decisions require
human review. Every admin action is written to `audit_logs`.

## What needs external credentials

| Need | Where | Status |
| --- | --- | --- |
| Supabase project | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Not created — apply `supabase/migrations/*.sql` to a new project |
| Tracking host + domain | `go.affilayer.com` → tracking service | Not deployed — see DEPLOYMENT.md |
| Cloudflare account | Pages (web) + DNS | Not connected — manual deploy only |
| `POSTBACK_SECRET` | Tracking service env | Set locally for dev; set as a real secret on deploy |
| Payment provider | — | **None for MVP.** Payouts are manual/admin-approved by design |

## Quality rules enforced

- No fake statistics presented as real; demo data is labeled demo everywhere.
- No fabricated accounts; no simulated payment success.
- No exposed service-role keys; RLS denies direct writes to clicks,
  conversions, ledger, postbacks and payout transactions from the browser.
- No duplicate conversions (idempotency + partial unique index).
- No editable balances (ledger is append-only; a trigger blocks edits).
- No unverified integrations claimed as live.

## Repo map

- `CONTRACT.md` — the integration contract the three packages were built against.
- `apps/web/README.md`, `services/tracking/README.md`,
  `packages/shared/README.md`, `supabase/README.md` — per-package docs.
