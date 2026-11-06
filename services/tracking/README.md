# @affilayer/tracking

Fastify + TypeScript tracking service: click tracking, SmartLink
redirects, HMAC-signed conversions, postback delivery, and stats.

> **No payment integration exists in this service.** Stats come only
> from recorded click/conversion events — nothing is faked or seeded
> as real traffic. The two seeded offers (`offer-a`, `offer-b`) are
> clearly-marked **demo** offers with `example.com` landing URLs, used
> only when `DATABASE_URL` is unset.

## Routes

| Route | Description |
| --- | --- |
| `GET /health` | `{ ok: true }` |
| `GET /c/:affiliateCode/:offerId` | Records a click, 302 to the offer landing URL with `?click_id=…`. Query: `sub1..sub5`, `source`, `geo`, `device`. Geo also read from `x-vercel-ip-country` / `cf-ipcountry` headers. |
| `GET /s/:smartlinkCode` | Deterministic SmartLink pick (highest payout, ties by id asc), 302, records click with `smartlink: true`. Query: `country`, `device`, `source`. |
| `POST /conversion` | JSON `{ click_id, offer_id, payout, currency, idempotency_key, sub1? }` + header `x-affilayer-signature` = HMAC-SHA256 hex over the raw body with `POSTBACK_SECRET`. 400 on bad signature / missing fields. Dedup by `idempotency_key` OR `click_id`+`offer_id` (returns original, `duplicate: true`). Creates a pending conversion + pending ledger entry and dispatches configured postbacks. |
| `GET /api/stats` | Server-side aggregation over recorded events only: `{ clicks, unique_clicks, conversions, approved, rejected, pending, revenue, commission, epc, cr }`. Filters: `offer_id`, `affiliate_code`, `from`, `to`, `country`, `device`, `source`. `unique_clicks` = distinct IPs. `revenue`/`commission` count pending + approved conversions only (rejected/reversed pay nothing). `epc` = revenue / clicks, `cr` = conversions / clicks. |
| `GET /api/clicks/:clickId` | Click + attributed conversion, or 404. |

Postbacks: each configured postback URL is macro-expanded
(`{click_id} {conversion_id} {payout} {currency} {status} {sub1}`),
fetched with GET, retried up to 3 times with exponential backoff
(100/200/400 ms), and recorded as a `postback_event` (delivered/failed).
A failed postback never fails the conversion.

Fraud: this service records clicks; fraud *signals* (duplicate
`click_id`, >10 clicks/IP/60s, empty user agent) come from
`detectFraudSignals` in `@affilayer/shared` — signals only, never
auto-reject.

## Store

- Default (no `DATABASE_URL`): `InMemoryStore` (`src/store.ts`) with the
  2 demo offers above.
- With `DATABASE_URL`: `PgStore` (`src/pg-store.ts`), a thin adapter over
  `pg` implementing the same `Store` interface. `pg` is an optional
  dependency, dynamically imported only in that path — it is never
  loaded when the in-memory store is used.

## Env

See `.env.example`: `PORT` (default 3001), `TRACKING_BASE_URL`
(default `http://localhost:3001`), `POSTBACK_SECRET` (required for
`/conversion`), `DATABASE_URL` (optional).

## Run / build / test

```bash
npm install
npm run dev    # tsx watch, PORT 3001
npm test       # vitest (fastify.inject, no server needed)
npm run build  # tsc -> dist/
npm start      # node dist/index.js
```
