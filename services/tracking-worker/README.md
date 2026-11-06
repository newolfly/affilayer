# @affilayer/tracking-worker

Cloudflare Worker port of `services/tracking` (the Fastify tracking service).
Same routes, same behavior, same in-memory store semantics.

## Routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | `{ ok: true }` |
| GET | `/c/:affiliateCode/:offerId` | Records a click, 302 to the offer landing URL with `?click_id=clk_…` |
| GET | `/s/:smartlinkCode` | Deterministic SmartLink pick (highest payout, id asc), records a click, 302 |
| POST | `/conversion` | HMAC-signed JSON, idempotent, deduped. 201 new, 200 `{ duplicate: true }` on replay, 400 bad signature / invalid fields, 500 when `POSTBACK_SECRET` is unset |
| GET | `/api/stats` | Server-side aggregation over recorded events only |
| GET | `/api/clicks/:clickId` | Click + its conversion (if any) |

Postback macros: `{click_id} {conversion_id} {payout} {currency} {status} {sub1}`.
Signature header: `x-affilayer-signature` (HMAC-SHA256 hex over the raw body,
optional `sha256=` prefix).

## Store — read this

**In-memory only, per Worker isolate, ephemeral.** Clicks, conversions, and
ledger entries recorded in one isolate are not visible in another and are lost
when the isolate recycles. This is the same as the Fastify service's dev
default (in-memory when `DATABASE_URL` is unset). Do not treat Worker stats as
financial truth for production volume — use `services/tracking` with Postgres
for durable tracking.

## Secrets

`POSTBACK_SECRET` — set with `wrangler secret put POSTBACK_SECRET`. The value
is kept outside the repo (see `~/.affilayer-secrets` on the build machine).
Never commit it.

## Develop

```bash
npm install
npm run build        # tsc
npm test             # build + node smoke test (no Cloudflare account needed)
npx wrangler dev --remote
```

## Deploy

```bash
npx wrangler deploy            # Worker affilayer-tracking, route go.affilayer.com
npx wrangler secret put POSTBACK_SECRET
```

The `[[routes]]` entry in `wrangler.toml` attaches `go.affilayer.com`
(zone `affilayer.com`) at deploy time; Cloudflare provisions the DNS record.
