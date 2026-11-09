/**
 * @affilayer/tracking-worker — Cloudflare Worker port of services/tracking.
 *
 * Same routes and behavior as the Fastify service:
 *   GET  /health
 *   GET  /c/:affiliateCode/:offerId   -> 302 to landing URL (records a click)
 *   GET  /s/:smartlinkCode           -> 302 to the deterministic SmartLink pick
 *   POST /conversion                  -> HMAC-signed, idempotent, deduped (201 / 200 duplicate)
 *   GET  /api/stats                   -> operator-only aggregation (Bearer POSTBACK_SECRET)
 *   GET  /api/clicks/:clickId         -> operator-only click + its conversion
 *   POST /api/payments/deposits       -> advertiser deposit (NOWPayments invoice, JWT)
 *   POST /api/ipn/nowpayments         -> NOWPayments IPN (public; verified by API re-fetch)
 *   POST /api/payouts/execute         -> admin: create NOWPayments payout for an approved request
 *   POST /api/payouts/:batchId/verify -> admin: verify a payout with a 2FA code
 *   GET  /api/payouts/:batchId/status -> admin: re-fetch payout status, sync + settle
 *   GET  /api/payments/balance        -> admin: NOWPayments custody balances
 *   POST /api/payments/validate-address -> signed-in user: validate a payout wallet address
 *
 * Money (migration 010, NOWPayments all-rounder): deposits are priced in
 * USD and credited only when NOWPayments reports the payment `finished`
 * (re-fetched via API — the IPN body is never trusted, because the
 * account IPN secret is shared with InboxNumber). Payouts run only for
 * admin-approved payout requests (H-5 gate) and settle the ledger only
 * when the batch reports FINISHED. See
 * ~/workspace/work/affilayer-nowpayments-brief.md.
 *
 * Env: POSTBACK_SECRET (wrangler secret) — HMAC key for POST /conversion
 * only. OPERATOR_TOKEN (wrangler secret) — Bearer token for /api/stats
 * and /api/clicks, which expose revenue and raw click data. The two were
 * one secret (R22): a leak of the advertiser HMAC key used to open the
 * operator endpoints too. Until OPERATOR_TOKEN is set, isOperator()
 * falls back to POSTBACK_SECRET so the live Worker keeps working; once
 * it is set, POSTBACK_SECRET no longer opens those endpoints.
 * Rotation: set the new value with `wrangler secret put <NAME>`, then
 * redeploy; the old value stops working at the redeploy. Rotate
 * POSTBACK_SECRET and OPERATOR_TOKEN independently — they must never
 * share a value. NP_WORKER_PROOF rotates the same way (regenerate the
 * row in worker_secrets, set the new secret, redeploy); the DB and the
 * Worker must agree, so rotate it in one window. Per-advertiser HMAC
 * secrets (one key per advertiser, verified per-offer in /conversion)
 * are the follow-up — they need a DB column plus a Worker lookup and
 * are not built yet; until then the single POSTBACK_SECRET signs every
 * advertiser's conversions.
 * SUPABASE_URL + SUPABASE_ANON_KEY (wrangler [vars], both public values)
 * enable the durable store; without them the Worker runs fully in-memory
 * (demo mode).
 * NOWPayments (wrangler secrets; unset NOWPAYMENTS_ENV disables payments):
 *   NOWPAYMENTS_API_KEY, NOWPAYMENTS_EMAIL, NOWPAYMENTS_PASSWORD
 *   (dashboard login, mints the 5-minute payout JWT),
 *   NOWPAYMENTS_TOTP_SECRET (optional app-based 2FA seed for auto-verify),
 *   NP_WORKER_PROOF (shared with the DB worker_secrets.np_ipn_proof),
 *   NOWPAYMENTS_ENV ('production' | 'sandbox').
 */
import {
  computeCommission,
  demoAffiliateStatus,
  deviceFromUserAgent,
  generateClickId,
  isAffiliateNotApprovedError,
  isCapReachedError,
  isDemoSmartlinkCode,
  isOfferEligible,
  isUnknownAffiliateCodeError,
  smartlinkPick,
  type Click,
  type Conversion,
  type Offer,
} from '@affilayer/shared';
// Re-exported for the smoke test (test/smoke.mjs imports the matchers
// from the Worker's dist entry point).
export {
  isAffiliateNotApprovedError,
  isCapReachedError,
  isUnknownAffiliateCodeError,
} from '@affilayer/shared';
import { InMemoryStore } from './store.js';
import { SupabaseStore, isRealOfferId } from './supabase-store.js';
import type { Store } from './store.js';
import { deliverPostbacks, verifySignature } from './postbacks.js';
import {
  ALLOWED_PAYOUT_CURRENCIES,
  DEFAULT_PAYOUT_CURRENCY,
  MAX_DEPOSIT_USD,
  MIN_DEPOSIT_USD,
  NP_IPN_CALLBACK_URL,
  NP_TERMINAL_PAYMENT_STATUSES,
  NowPaymentsClient,
  NpError,
  parseIpn,
} from './nowpayments.js';
import {
  isAdminUser,
  supabaseRpc,
  supabaseSelect,
  verifyUserJwt,
  type SupabaseClient,
  type SupabaseUser,
} from './supabase-auth.js';

export interface Env {
  POSTBACK_SECRET?: string;
  /** Bearer token for /api/stats and /api/clicks. Falls back to
   *  POSTBACK_SECRET until set (R22) — see isOperator(). */
  OPERATOR_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_EMAIL?: string;
  NOWPAYMENTS_PASSWORD?: string;
  NOWPAYMENTS_TOTP_SECRET?: string;
  NOWPAYMENTS_ENV?: string;
  NP_WORKER_PROOF?: string;
}

// One store per isolate. Memoized: env does not change across requests
// in a deployment. Supabase-backed when the vars are set, in-memory
// (demo mode) otherwise.
let cachedStore: Store | null = null;
function getStore(env: Env): Store {
  if (cachedStore) return cachedStore;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    cachedStore = new SupabaseStore({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, workerProofSecret: env.NP_WORKER_PROOF });
  } else {
    cachedStore = new InMemoryStore();
  }
  return cachedStore;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Security headers (H-07/P0-5, Worker half). The Worker serves only
 * JSON + 302 redirects — never HTML documents — so the policy is
 * strict: no document source at all, no framing. Applied in one place
 * (the fetch wrapper) so every route gets them, including /health and
 * error responses. A new Response is built so the original status,
 * Location header (302s) and body survive untouched.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function clientIp(request: Request): string | undefined {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return undefined;
}

/** Currencies the network settles in (ISO-4217). Anything else is rejected. */
const ALLOWED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SGD', 'HKD',
  'INR', 'BRL', 'MXN', 'ZAR', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF',
  'ILS', 'KRW', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'TRY', 'AED', 'SAR',
]);

/** Per-conversion payout ceiling — blocks absurd values (e.g. 1e12). */
const MAX_PAYOUT = 10000;

/** Bare SmartLink clicks carry no affiliate (affiliate_code 'smartlink',
 *  affiliate_id NULL), so their conversions cannot resolve an affiliate.
 *  They attribute to the network's own house affiliate instead — its
 *  commissions are never paid out (migration 016 rejects house payout
 *  requests at the DB, and handleExecutePayout refuses them too). */
const SMARTLINK_AFFILIATE_CODE = 'smartlink';
const HOUSE_AFFILIATE_CODE = 'AFF-HOUSE';

/** Best-effort per-IP click rate limit (per isolate): 60 clicks / 60s.
 *  Not a security boundary — it only slows automated click floods. */
const clickRate = new Map<string, number[]>();
function clickRateLimited(ip: string | undefined): boolean {
  if (!ip) return false;
  const now = Date.now();
  const hits = (clickRate.get(ip) ?? []).filter((t) => t > now - 60_000);
  if (hits.length >= 60) return true;
  hits.push(now);
  clickRate.set(ip, hits);
  if (clickRate.size > 5000) {
    for (const [k, v] of clickRate) {
      if (v.length === 0 || v[v.length - 1] < now - 60_000) clickRate.delete(k);
    }
  }
  return false;
}

/** Operator endpoints (/api/stats, /api/clicks) are not public: they
 *  expose revenue and raw click data (IP, user agent). Auth is Bearer
 *  OPERATOR_TOKEN when set, falling back to POSTBACK_SECRET until the
 *  separate operator token is provisioned (R22). The fallback exists so
 *  the live Worker keeps working; once OPERATOR_TOKEN is set, the
 *  POSTBACK_SECRET no longer opens these endpoints — a leak of the
 *  advertiser HMAC secret must not expose all stats. Bearer auth, never
 *  a query param. */
function isOperator(request: Request, env: Env): boolean {
  const token = env.OPERATOR_TOKEN ?? env.POSTBACK_SECRET;
  return !!token && request.headers.get('authorization') === `Bearer ${token}`;
}

function geoFrom(request: Request): string | undefined {
  // Country comes from Cloudflare's header only. A ?geo= query param must
  // never override it — the visitor could spoof their country.
  return request.headers.get('cf-ipcountry') ?? undefined;
}

function deviceFrom(request: Request): string | undefined {
  // Device comes from the User-Agent only — never the spoofable
  // ?device= query param (H-08).
  return deviceFromUserAgent(request.headers.get('user-agent') ?? undefined);
}

function recordClickFields(
  request: Request,
  url: URL,
  affiliateCode: string,
  offerId: string,
  extra: Partial<Click> = {},
): Click {
  return {
    id: crypto.randomUUID(),
    clickId: generateClickId(),
    affiliateCode,
    offerId,
    sub1: url.searchParams.get('sub1') ?? undefined,
    sub2: url.searchParams.get('sub2') ?? undefined,
    sub3: url.searchParams.get('sub3') ?? undefined,
    sub4: url.searchParams.get('sub4') ?? undefined,
    sub5: url.searchParams.get('sub5') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    referrer: request.headers.get('referer') ?? request.headers.get('referrer') ?? undefined,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    country: geoFrom(request),
    device: deviceFrom(request),
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Best-effort click write for the redirect handlers — with two
 * exceptions: a click the DB *rejects* (022) is not a transient failure
 * and must not redirect. A pending/unapproved affiliate gets a clear
 * 403 (H-03), an unknown affiliate code a 404 (M-13), a capped offer
 * a 409; anything else (DB blip, proof misconfig) keeps the old
 * behaviour — log it and redirect anyway so a durable-write outage
 * never breaks the redirect.
 *
 * M-13: the 022 RPC raises "unknown affiliate_code" BEFORE inserting,
 * so no click row exists — the validation IS the recorder's own
 * lookup (same source of truth, no extra round-trip, no check-then-
 * act race). The 'smartlink' sentinel is exempt by the RPC itself,
 * and the RPC checks unknown-code before approval status, so a
 * pending code reaches the 403 below, never the 404.
 */
async function recordClickOrReject(
  store: Store,
  click: Click,
): Promise<Response | null> {
  // M-08: the in-memory demo path bypassed the 022 approval gate — a
  // pending affiliate's demo-offer click 302'd. Demo offers are non-UUID
  // ids; a known demo affiliate whose status is not approved is rejected
  // here, exactly like the DB gate rejects for real offers. Unknown codes
  // (including the 'smartlink' sentinel) are not demo affiliates and pass
  // — the DB gate still covers real offers. Placed here so it covers both
  // the /c/ handler and the SmartLink handler.
  if (!isRealOfferId(click.offerId)) {
    const status = demoAffiliateStatus(click.affiliateCode);
    if (status !== undefined && status !== 'approved') {
      return json({ error: 'affiliate not approved' }, 403);
    }
  }
  try {
    await store.recordClick(click);
    return null;
  } catch (err) {
    // M-13: unknown affiliate code — the click was never recorded, so
    // redirecting would send converting traffic that can never pay.
    // Same 404 shape as the offer-not-found check in the /c/ handler.
    if (isUnknownAffiliateCodeError(err)) {
      return json({ error: 'affiliate not found' }, 404);
    }
    if (isAffiliateNotApprovedError(err)) {
      return json({ error: 'affiliate not approved' }, 403);
    }
    if (isCapReachedError(err)) {
      return json({ error: 'offer cap reached' }, 409);
    }
    console.error('recordClick failed (redirecting anyway):', err);
    return null;
  }
}

interface ConversionBody {
  click_id?: unknown;
  offer_id?: unknown;
  payout?: unknown;
  currency?: unknown;
  status?: unknown;
  idempotency_key?: unknown;
  sub1?: unknown;
}

/**
 * M-14: ensure a conversion has its ledger row. Idempotent — the
 * ledger has a unique index on conversion_id and recordLedgerEntry
 * returns the existing row on a conflict, so a concurrent backfill is
 * a no-op; an already-exists style error is likewise treated as
 * success, never a 500. Returns true when a row exists afterwards.
 *
 * M-08 fold-in: the backfill is status-guarded — only pending or
 * approved conversions earn a ledger row (migration 001 status machine:
 * pending / approved / rejected / reversed; 003 approves/rejects only
 * from pending). Replaying a reversed/rejected conversion's idempotency
 * key must never mint a `pending` row for a dead conversion, so those
 * return false with no write.
 */
export async function ensureLedgerEntry(
  store: Store,
  conversion: Conversion,
  offer: Offer,
): Promise<boolean> {
  if (conversion.status !== 'pending' && conversion.status !== 'approved') return false;
  const existing = await store.listLedgerEntries();
  if (existing.some((e) => e.conversionId === conversion.id)) return true;
  const commission = computeCommission(conversion.payout, offer.payoutModel ?? 'CPA', offer.rateBps);
  try {
    await store.recordLedgerEntry({
      id: crypto.randomUUID(),
      conversionId: conversion.id,
      affiliateCode: conversion.affiliateCode ?? '',
      offerId: conversion.offerId,
      amount: commission,
      currency: conversion.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/duplicate|already exists|unique/i.test(msg)) return true;
    throw err;
  }
}

async function handleConversion(request: Request, env: Env): Promise<Response> {
  const store = getStore(env);
  const postbackSecret = env.POSTBACK_SECRET ?? '';
  if (!postbackSecret) {
    return json({ error: 'POSTBACK_SECRET not configured' }, 500);
  }
  const rawBody = await request.text();
  const signature = request.headers.get('x-affilayer-signature') ?? undefined;
  if (!(await verifySignature(postbackSecret, rawBody, signature))) {
    return json({ error: 'bad signature' }, 400);
  }

  let body: ConversionBody = {};
  try {
    body = JSON.parse(rawBody) as ConversionBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const clickId = typeof body.click_id === 'string' ? body.click_id : '';
  const offerId = typeof body.offer_id === 'string' ? body.offer_id : '';
  const payout = typeof body.payout === 'number' ? body.payout : Number.NaN;
  const currency = typeof body.currency === 'string' ? body.currency : '';
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : '';
  const sub1 = typeof body.sub1 === 'string' ? body.sub1 : undefined;

  if (!clickId || !offerId || !Number.isFinite(payout) || payout < 0 || !currency || !idempotencyKey) {
    return json(
      { error: 'missing or invalid fields: click_id, offer_id, payout, currency, idempotency_key are required' },
      400,
    );
  }
  if (!ALLOWED_CURRENCIES.has(currency)) {
    return json({ error: 'unsupported currency' }, 400);
  }
  if (payout > MAX_PAYOUT) {
    return json({ error: 'payout exceeds the per-conversion maximum' }, 400);
  }

  // Dedup: same idempotency_key OR same click_id+offer_id returns the original.
  const existing =
    (await store.findConversionByIdempotencyKey(idempotencyKey)) ??
    (await store.findConversionByClickAndOffer(clickId, offerId));
  if (existing) {
    // M-14 backfill: a replay must not silently confirm a conversion
    // whose ledger row was never written (e.g. the Worker crashed
    // between recordConversion and recordLedgerEntry). Best-effort —
    // a backfill failure never turns the duplicate 200 into a 500,
    // and the response shape is unchanged.
    try {
      const offer = await store.getOffer(existing.offerId);
      if (offer) await ensureLedgerEntry(store, existing, offer);
    } catch (err) {
      console.error('duplicate-path ledger backfill failed:', err, { conversionId: existing.id });
    }
    return json({ ok: true, duplicate: true, conversion: existing }, 200);
  }

  // A conversion must belong to a real click on a real offer — never
  // record conversions for clicks that never happened.
  const click = await store.getClick(clickId);
  if (!click) return json({ error: 'unknown click_id' }, 422);
  if (click.offerId !== offerId) return json({ error: 'click_id does not belong to offer_id' }, 422);
  const offer = await store.getOffer(offerId);
  if (!offer) return json({ error: 'unknown offer_id' }, 422);
  // M-05: a CPS offer without a commission rate must fail visibly here,
  // before the conversion (and its ledger row) is recorded — never a
  // silent $0 commission. Migration 025 blocks such offers at the DB
  // layer too; this is the Worker-side guard for any row that predates
  // it, and computeCommission throws as the last line of defence.
  if (offer.payoutModel === 'CPS' && (offer.rateBps == null || offer.rateBps <= 0 || offer.rateBps > 10000)) {
    return json({ error: 'CPS offer has no commission rate' }, 422);
  }
  // Bare SmartLink clicks carry no affiliate — attribute their
  // conversions to the house affiliate (never paid out).
  const affiliateCode =
    click.affiliateCode === SMARTLINK_AFFILIATE_CODE || !click.affiliateCode
      ? HOUSE_AFFILIATE_CODE
      : click.affiliateCode;
  const conversion: Conversion = {
    id: crypto.randomUUID(),
    clickId,
    offerId,
    affiliateCode,
    payout,
    currency,
    status: 'pending',
    idempotencyKey,
    sub1,
    createdAt: new Date().toISOString(),
  };
  let recordedConversion: Conversion;
  try {
    recordedConversion = await store.recordConversion(conversion);
  } catch (err) {
    // H-03 (022): the DB raises before inserting, so no conversion row
    // exists — and the ledger write below is never reached, so no
    // ledger entry is created for a rejected conversion either.
    if (isAffiliateNotApprovedError(err)) {
      return json({ error: 'affiliate not approved' }, 403);
    }
    throw err;
  }

  const commission = computeCommission(payout, offer?.payoutModel ?? 'CPA', offer?.rateBps);
  const ledgerEntry = await store.recordLedgerEntry({
    id: crypto.randomUUID(),
    conversionId: recordedConversion.id,
    affiliateCode: conversion.affiliateCode ?? '',
    offerId,
    amount: commission,
    currency,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  // Dispatch configured postbacks (recorded as postback_events; failures
  // never fail the conversion itself).
  const configs = await store.getPostbackConfigs(offerId, conversion.affiliateCode);
  const vars: Record<string, string> = {
    click_id: clickId,
    conversion_id: conversion.id,
    payout: String(payout),
    currency,
    status: conversion.status,
    sub1: sub1 ?? click?.sub1 ?? '',
  };
  const postbacks = await deliverPostbacks(store, configs, vars);

  return json(
    {
      ok: true,
      duplicate: false,
      conversion,
      ledgerEntry,
      commission,
      postbacks: postbacks.map((p) => ({ url: p.url, status: p.status, attempts: p.attempts })),
    },
    201,
  );
}

async function handleStats(url: URL, env: Env): Promise<Response> {
  const store = getStore(env);
  const q = url.searchParams;
  const from = q.get('from') ? new Date(q.get('from') as string).getTime() : Number.NEGATIVE_INFINITY;
  const to = q.get('to') ? new Date(q.get('to') as string).getTime() : Number.POSITIVE_INFINITY;
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  };

  const clicks = (await store.listClicks()).filter(
    (c) =>
      inRange(c.createdAt) &&
      (!q.get('offer_id') || c.offerId === q.get('offer_id')) &&
      (!q.get('affiliate_code') || c.affiliateCode === q.get('affiliate_code')) &&
      (!q.get('country') || c.country === q.get('country')) &&
      (!q.get('device') || c.device === q.get('device')) &&
      (!q.get('source') || c.source === q.get('source')),
  );

  const clickById = new Map(clicks.map((c) => [c.clickId, c]));
  const allConversions = await store.listConversions();
  const conversions = allConversions.filter((conv) => {
    if (!inRange(conv.createdAt)) return false;
    if (q.get('offer_id') && conv.offerId !== q.get('offer_id')) return false;
    const click = clickById.get(conv.clickId);
    if (q.get('affiliate_code') && conv.affiliateCode !== q.get('affiliate_code')) return false;
    if (q.get('country') && click?.country !== q.get('country')) return false;
    if (q.get('device') && click?.device !== q.get('device')) return false;
    if (q.get('source') && click?.source !== q.get('source')) return false;
    return true;
  });

  const approved = conversions.filter((c) => c.status === 'approved');
  const rejected = conversions.filter((c) => c.status === 'rejected');
  const pending = conversions.filter((c) => c.status === 'pending');
  // Revenue / commission count pending + approved only (rejected/reversed pay nothing).
  const billable = conversions.filter((c) => c.status === 'pending' || c.status === 'approved');
  const revenue = billable.reduce((sum, c) => sum + c.payout, 0);
  const ledger = await store.listLedgerEntries();
  const ledgerByConversion = new Map(ledger.map((e) => [e.conversionId, e]));
  const commission = billable.reduce((sum, c) => sum + (ledgerByConversion.get(c.id)?.amount ?? 0), 0);
  const uniqueClicks = new Set(clicks.map((c) => c.ip ?? c.clickId)).size;

  return json({
    clicks: clicks.length,
    unique_clicks: uniqueClicks,
    conversions: conversions.length,
    approved: approved.length,
    rejected: rejected.length,
    pending: pending.length,
    revenue: Math.round(revenue * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    epc: clicks.length > 0 ? Math.round((revenue / clicks.length) * 10000) / 10000 : 0,
    cr: clicks.length > 0 ? Math.round((conversions.length / clicks.length) * 10000) / 10000 : 0,
  });
}

// ---------------------------------------------------------------------------
// NOWPayments all-rounder (migration 010)
// ---------------------------------------------------------------------------

function npClient(env: Env): NowPaymentsClient | null {
  if (!env.NOWPAYMENTS_ENV || !env.NOWPAYMENTS_API_KEY) return null;
  return new NowPaymentsClient({
    env: env.NOWPAYMENTS_ENV,
    apiKey: env.NOWPAYMENTS_API_KEY,
    email: env.NOWPAYMENTS_EMAIL,
    password: env.NOWPAYMENTS_PASSWORD,
    totpSecret: env.NOWPAYMENTS_TOTP_SECRET,
    workerProof: env.NP_WORKER_PROOF,
  });
}

function supabaseClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  return { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY };
}

function bearerJwt(request: Request): string | null {
  const h = request.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Verify the caller's Supabase JWT. 401 when missing/invalid. */
async function requireUser(
  request: Request,
  env: Env,
): Promise<{ user: SupabaseUser; jwt: string } | Response> {
  const jwt = bearerJwt(request);
  const sb = supabaseClient(env);
  if (!jwt || !sb) return json({ error: 'unauthorized' }, 401);
  const user = await verifyUserJwt(sb, jwt);
  if (!user) return json({ error: 'unauthorized' }, 401);
  return { user, jwt };
}

/** Verify the caller is an admin (JWT + is_admin RPC). 403 otherwise. */
async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ user: SupabaseUser; jwt: string } | Response> {
  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;
  const sb = supabaseClient(env);
  if (!sb || !(await isAdminUser(sb, auth.jwt))) {
    return json({ error: 'admin only' }, 403);
  }
  return auth;
}

/** Light per-IP rate limit for the money-creating endpoints (per isolate). */
const moneyRate = new Map<string, number[]>();
function moneyRateLimited(ip: string | undefined, limit = 30): boolean {
  if (!ip) return false;
  const now = Date.now();
  const hits = (moneyRate.get(ip) ?? []).filter((t) => t > now - 60_000);
  if (hits.length >= limit) return true;
  hits.push(now);
  moneyRate.set(ip, hits);
  return false;
}

const NP_DEPOSIT_SUCCESS_URL = 'https://affilayer.com/app/advertiser/billing?deposit=success';
const NP_DEPOSIT_CANCEL_URL = 'https://affilayer.com/app/advertiser/billing?deposit=cancelled';

/** POST /api/payments/deposits — advertiser creates a USD deposit invoice. */
async function handleCreateDeposit(request: Request, env: Env): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  if (moneyRateLimited(clientIp(request))) return json({ error: 'rate limited' }, 429);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;
  const sb = supabaseClient(env);
  if (!sb) return json({ error: 'supabase not configured' }, 500);

  let body: { amount_usd?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const amount = typeof body.amount_usd === 'number' ? body.amount_usd : Number.NaN;
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_USD || amount > MAX_DEPOSIT_USD) {
    return json(
      { error: `amount_usd must be between ${MIN_DEPOSIT_USD} and ${MAX_DEPOSIT_USD}` },
      400,
    );
  }

  const orderId = `dep_${crypto.randomUUID()}`;
  let invoice;
  try {
    invoice = await np.createInvoice({
      amountUsd: amount,
      orderId,
      successUrl: NP_DEPOSIT_SUCCESS_URL,
      cancelUrl: NP_DEPOSIT_CANCEL_URL,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'NOWPayments error' }, 502);
  }
  if (!invoice.invoice_url) return json({ error: 'NOWPayments returned no invoice_url' }, 502);

  try {
    const depositId = await supabaseRpc<string>(sb, 'np_create_deposit', {
      p_advertiser_id: auth.user.id,
      p_amount_usd: amount,
      p_np_payment_id: null,
      p_np_invoice_id: invoice.id ?? null,
      p_pay_address: null,
      p_pay_amount: null,
      p_pay_currency: null,
      p_order_id: orderId,
    }, auth.jwt);
    return json(
      { ok: true, deposit_id: depositId, order_id: orderId, invoice_url: invoice.invoice_url },
      201,
    );
  } catch (err) {
    // The invoice exists at NOWPayments but has no deposit row — the IPN
    // will arrive with an unknown order_id and be logged for manual
    // reconciliation. Never fail the advertiser's checkout for this.
    console.error('np_create_deposit failed after invoice creation:', err, { orderId });
    return json(
      { ok: true, order_id: orderId, invoice_url: invoice.invoice_url, deposit_recorded: false },
      201,
    );
  }
}

/** POST /api/ipn/nowpayments — NOWPayments IPN (public).
 *  The body is UNTRUSTED: it only wakes us up. Every status is re-fetched
 *  from the NOWPayments API with the API key before any DB write. */
async function handleIpn(request: Request, env: Env): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  const sb = supabaseClient(env);
  if (!sb) return json({ error: 'supabase not configured' }, 500);

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = parseIpn(body);

  try {
    if (parsed.kind === 'payment' && parsed.paymentId) {
      const payment = await np.getPayment(parsed.paymentId);
      const status = payment.payment_status;
      if (!NP_TERMINAL_PAYMENT_STATUSES.has(status)) {
        return json({ ok: true, ignored: `payment status ${status} is not terminal` });
      }
      const orderId = payment.order_id ?? parsed.orderId;
      if (!orderId) {
        console.error('NOWPayments IPN: payment has no order_id', { payment: payment.payment_id });
        return json({ ok: true, ignored: 'payment has no order_id' });
      }
      const result = await supabaseRpc<string>(sb, 'np_confirm_deposit', {
        p_order_id: orderId,
        p_proof: await np.proof(orderId),
        p_status: status,
        p_actually_paid: payment.actually_paid ?? null,
        p_outcome_amount: payment.outcome_amount ?? null,
        p_outcome_currency: payment.outcome_currency ?? null,
        p_np_payment_id: String(payment.payment_id),
      });
      return json({ ok: true, deposit: result, status });
    }

    if (parsed.kind === 'payout' && parsed.batchId) {
      const batch = await np.getPayout(parsed.batchId);
      const status = String(batch.status ?? '');
      if (!status) return json({ ok: true, ignored: 'payout has no status' });
      const result = await supabaseRpc<string>(sb, 'np_sync_payout_status', {
        p_batch_id: String(batch.id ?? parsed.batchId),
        p_proof: await np.proof(String(batch.id ?? parsed.batchId)),
        p_status: status,
      });
      return json({ ok: true, payout: result, status });
    }

    console.error('NOWPayments IPN: unrecognized body', JSON.stringify(body).slice(0, 500));
    return json({ ok: true, ignored: 'unrecognized IPN body' });
  } catch (err) {
    console.error('NOWPayments IPN handling failed:', err);
    return json({ error: err instanceof Error ? err.message : 'IPN handling failed' }, 502);
  }
}

interface PayoutRequestRow {
  id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  status: string;
}

interface AffiliateWalletRow {
  profile_id: string;
  affiliate_code: string | null;
  payout_address: string | null;
  payout_currency: string | null;
}

/** POST /api/payouts/execute — admin: pay an approved payout request via
 *  NOWPayments. Preflights balance/address/fee, creates the batch, records
 *  it, and auto-verifies with TOTP when configured. */
async function handleExecutePayout(request: Request, env: Env): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  if (moneyRateLimited(clientIp(request))) return json({ error: 'rate limited' }, 429);
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  const sb = supabaseClient(env);
  if (!sb) return json({ error: 'supabase not configured' }, 500);

  let body: { payout_request_id?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const requestId = typeof body.payout_request_id === 'string' ? body.payout_request_id : '';
  if (!requestId) return json({ error: 'payout_request_id is required' }, 400);

  try {
    const rows = await supabaseSelect<PayoutRequestRow>(
      sb,
      'payout_requests',
      `select=id,affiliate_id,amount,currency,status&id=eq.${encodeURIComponent(requestId)}`,
      auth.jwt,
    );
    const payout = rows[0];
    if (!payout) return json({ error: 'payout request not found' }, 404);
    if (payout.status !== 'approved') {
      return json({ error: `payout request is ${payout.status}, only approved can be paid` }, 409);
    }

    const wallets = await supabaseSelect<AffiliateWalletRow>(
      sb,
      'affiliate_profiles',
      `select=profile_id,affiliate_code,payout_address,payout_currency&profile_id=eq.${encodeURIComponent(payout.affiliate_id)}`,
      auth.jwt,
    );
    const wallet = wallets[0];
    // The house affiliate's commissions are never paid out: a house payout
    // request cannot be created (migration 016 rejects it at the DB), and
    // the executor refuses one even if it somehow exists — so a wallet
    // added to the house profile later cannot make it payable.
    if (wallet?.affiliate_code === HOUSE_AFFILIATE_CODE) {
      return json({ error: 'house affiliate payouts are disabled' }, 403);
    }
    const address = wallet?.payout_address ?? null;
    const currency = wallet?.payout_currency || DEFAULT_PAYOUT_CURRENCY;
    // H-03 (026): the ledger is USD-only and payouts go out as USDT
    // TRC20. The wallet currency is affiliate-controlled (RLS
    // update-own), so never pay it verbatim — reject anything outside
    // the allowlist before any money moves. (The DB CHECK on
    // affiliate_profiles.payout_currency backstops the save path.)
    if (!(ALLOWED_PAYOUT_CURRENCIES as readonly string[]).includes(currency)) {
      return json({ error: `payout currency ${currency} is not supported (only usdttrc20)` }, 422);
    }
    if (!address) {
      return json({ error: 'affiliate has no payout wallet address on file' }, 422);
    }

    // Preflight: address valid, custody funded, fee known.
    await np.validateAddress(address, currency);
    const balances = await np.getBalance();
    const available = balances[currency]?.amount ?? 0;
    if (available < payout.amount) {
      return json(
        { error: `NOWPayments custody holds ${available} ${currency}, need ${payout.amount}` },
        422,
      );
    }
    let fee: number | null = null;
    try {
      const feeRes = (await np.estimatePayoutFee(currency, payout.amount)) as {
        fee?: number;
        network_fee?: number;
      };
      fee = feeRes.fee ?? feeRes.network_fee ?? null;
    } catch {
      fee = null; // Fee estimate is best-effort; creation still reports the fee.
    }

    const batch = await np.createPayout({ address, currency, amount: payout.amount });
    const batchId = String(batch.id);
    const withdrawalId =
      batch.withdrawals && batch.withdrawals[0]?.id ? String(batch.withdrawals[0].id) : null;
    if (!batchId) return json({ error: 'NOWPayments returned no payout batch id' }, 502);

    await supabaseRpc(sb, 'np_record_payout', {
      p_request_id: payout.id,
      p_batch_id: batchId,
      p_withdrawal_id: withdrawalId,
      p_address: address,
      p_currency: currency,
      p_amount: payout.amount,
      p_fee: fee,
      p_actor: auth.user.id,
    }, auth.jwt);

    // Verify: TOTP auto-verify when configured, else leave awaiting_2fa.
    if (np.hasTotp) {
      try {
        await np.verifyPayout(batchId, await np.totpNow());
        await supabaseRpc(sb, 'np_verify_payout', {
          p_batch_id: batchId,
          p_actor: auth.user.id,
        }, auth.jwt);
        return json({
          ok: true, batch_id: batchId, status: 'verified',
          amount: payout.amount, currency, fee, auto_verified: true,
        });
      } catch (err) {
        console.error('NOWPayments payout auto-verify failed:', err, { batchId });
        await supabaseRpc(sb, 'np_sync_payout_status', {
          p_batch_id: batchId,
          p_proof: await np.proof(batchId),
          p_status: 'WAITING',
        });
        return json({
          ok: true, batch_id: batchId, status: 'awaiting_2fa',
          amount: payout.amount, currency, fee, auto_verified: false,
          verify_error: err instanceof Error ? err.message : 'verify failed',
        });
      }
    }

    await supabaseRpc(sb, 'np_sync_payout_status', {
      p_batch_id: batchId,
      p_proof: await np.proof(batchId),
      p_status: 'WAITING',
    });
    return json({
      ok: true, batch_id: batchId, status: 'awaiting_2fa',
      amount: payout.amount, currency, fee, auto_verified: false,
    });
  } catch (err) {
    if (err instanceof NpError) return json({ error: err.message }, err.status ?? 502);
    return json({ error: err instanceof Error ? err.message : 'payout failed' }, 502);
  }
}

/** POST /api/payouts/:batchId/verify — admin: verify with a pasted 2FA code. */
async function handleVerifyPayout(
  request: Request,
  env: Env,
  batchId: string,
): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  const sb = supabaseClient(env);
  if (!sb) return json({ error: 'supabase not configured' }, 500);

  let body: { code?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) return json({ error: 'code must be 6 digits' }, 400);

  try {
    await np.verifyPayout(batchId, code);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'verify failed' },
      err instanceof NpError ? (err.status ?? 502) : 502,
    );
  }
  try {
    await supabaseRpc(sb, 'np_verify_payout', { p_batch_id: batchId, p_actor: auth.user.id }, auth.jwt);
  } catch {
    // Batch may already be verified (e.g. TOTP ran first) — not fatal.
  }
  return json({ ok: true, batch_id: batchId, status: 'verified' });
}

/** GET /api/payouts/:batchId/status — admin: re-fetch + sync (settles on FINISHED). */
async function handlePayoutStatus(
  request: Request,
  env: Env,
  batchId: string,
): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  const sb = supabaseClient(env);
  if (!sb) return json({ error: 'supabase not configured' }, 500);

  try {
    const batch = await np.getPayout(batchId);
    const status = String(batch.status ?? '');
    const synced = await supabaseRpc<string>(sb, 'np_sync_payout_status', {
      p_batch_id: batchId,
      p_proof: await np.proof(batchId),
      p_status: status,
    });
    return json({ ok: true, batch_id: batchId, status: synced, nowpayments_status: status });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'status check failed' },
      err instanceof NpError ? (err.status ?? 502) : 502,
    );
  }
}

/** GET /api/payments/balance — admin: NOWPayments custody balances. */
async function handleCustodyBalance(request: Request, env: Env): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;
  try {
    const balances = await np.getBalance();
    return json({ ok: true, balances });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'balance check failed' },
      err instanceof NpError ? (err.status ?? 502) : 502,
    );
  }
}

/** POST /api/payments/validate-address — signed-in user: validate a payout
 *  wallet address with NOWPayments before saving it. */
async function handleValidateAddress(request: Request, env: Env): Promise<Response> {
  const np = npClient(env);
  if (!np) return json({ error: 'payments not configured' }, 503);
  const auth = await requireUser(request, env);
  if (auth instanceof Response) return auth;

  let body: { address?: unknown; currency?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const currency =
    typeof body.currency === 'string' && body.currency
      ? body.currency
      : DEFAULT_PAYOUT_CURRENCY;
  if (!address) return json({ error: 'address is required' }, 400);
  try {
    await np.validateAddress(address, currency);
    return json({ ok: true, valid: true, address, currency });
  } catch (err) {
    return json(
      { ok: false, valid: false, error: err instanceof Error ? err.message : 'invalid address' },
      422,
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Every response leaves with the security headers (H-07), and an
    // unexpected throw becomes a JSON 500 with headers instead of the
    // runtime's bare 500. The 022 rejections in handleConversion are
    // mapped to 403 there, not here.
    try {
      return withSecurityHeaders(await handleRequest(request, env));
    } catch (err) {
      console.error('worker fetch failed:', err);
      return withSecurityHeaders(json({ error: 'internal error' }, 500));
    }
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true });
    }

    // GET /c/:affiliateCode/:offerId -> 302 to landing URL
    const clickMatch = path.match(/^\/c\/([^/]+)\/([^/]+)$/);
    if (request.method === 'GET' && clickMatch) {
      if (clickRateLimited(clientIp(request))) return json({ error: 'rate limited' }, 429);
      const [, affiliateCode, offerId] = clickMatch;
      const store = getStore(env);
      const offer = await store.getOffer(decodeURIComponent(offerId));
      if (!offer) return json({ error: 'offer not found' }, 404);
      // Paused (or draft/ended) offers never redirect: a paused offer must
      // not keep collecting clicks (R24 — demo-offer-3 was 'paused' yet 302'd).
      // SmartLink already excludes non-active offers via isOfferEligible in
      // smartlinkPick; this is the direct-link equivalent.
      if (offer.status !== 'active') return json({ error: 'offer not found' }, 404);
      // H-08 geo/device enforcement: country is cf-ipcountry only and
      // device is parsed from the User-Agent — never the spoofable
      // ?country= / ?device= query params. An ineligible visitor gets
      // the same 404 a paused/unknown offer gets, and no click is
      // recorded. countries=[] (the live offer) means unrestricted.
      // No traffic-source check here: there is no trustworthy header
      // for it, and a spoofable ?source= must not decide eligibility.
      if (!isOfferEligible(offer, { country: geoFrom(request), device: deviceFrom(request) })) {
        return json({ error: 'offer not found' }, 404);
      }
      const click = recordClickFields(request, url, decodeURIComponent(affiliateCode), decodeURIComponent(offerId));
      // A 022 rejection (unknown code -> 404, not approved -> 403,
      // cap reached -> 409) answers instead of redirecting; a transient
      // write failure still redirects.
      const rejected = await recordClickOrReject(store, click);
      if (rejected) return rejected;
      return new Response(null, {
        status: 302,
        headers: { Location: appendQuery(offer.landingUrl, 'click_id', click.clickId) },
      });
    }

    // GET /s/:smartlinkCode -> deterministic pick, 302
    const smartMatch = path.match(/^\/s\/([^/]+)$/);
    if (request.method === 'GET' && smartMatch) {
      if (clickRateLimited(clientIp(request))) return json({ error: 'rate limited' }, 429);
      const [, smartlinkCode] = smartMatch;
      const code = decodeURIComponent(smartlinkCode);
      // M-08: SmartLink codes were never validated — any /s/<anything>
      // 302'd, deterministically to demo-offer-1 in production. In demo
      // mode (no Supabase) the code must be a known demo code, else 404.
      // In Supabase mode there is no per-code registry (no smartlinks
      // table — the P1-12 follow-up), so the code is not checked; the
      // pick is real-offers-only because demo offers are stripped from
      // SupabaseStore (see supabase-store.ts).
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        if (!isDemoSmartlinkCode(code)) return json({ error: 'smartlink not found' }, 404);
      }
      const store = getStore(env);
      const offers = await store.listOffers();
      // Enforce per-offer click caps at the edge: offers that hit their
      // `cap` are not eligible for a SmartLink pick. (capDaily / capTotal
      // are not enforced here — the store has no daily window.)
      const clicks = await store.listClicks();
      const clicksByOffer = new Map<string, number>();
      for (const c of clicks) clicksByOffer.set(c.offerId, (clicksByOffer.get(c.offerId) ?? 0) + 1);
      const uncapped = offers.filter((o) => o.cap === undefined || (clicksByOffer.get(o.id) ?? 0) < o.cap);
      // H-08: the pick uses cf-ipcountry and the User-Agent only.
      // ?country= / ?device= must never steer it (live proof: ?country=FR
      // excluded demo-offer-1). ?source= is not passed either — there is
      // no trustworthy header for traffic source, so it cannot decide
      // eligibility; it is still recorded on the click as metadata.
      const picked = smartlinkPick(uncapped, {
        country: geoFrom(request),
        device: deviceFrom(request),
      });
      if (!picked) return json({ error: 'no eligible offer' }, 404);
      const click = recordClickFields(request, url, url.searchParams.get('affiliate_code') ?? 'smartlink', picked.id, {
        smartlink: true,
        smartlinkCode: code,
      });
      // A 022 rejection (unknown code -> 404, not approved -> 403,
      // cap reached -> 409) answers instead of redirecting; a transient
      // write failure still redirects.
      const rejected = await recordClickOrReject(store, click);
      if (rejected) return rejected;
      return new Response(null, {
        status: 302,
        headers: { Location: appendQuery(picked.landingUrl, 'click_id', click.clickId) },
      });
    }

    // POST /conversion (HMAC-signed JSON)
    if (request.method === 'POST' && path === '/conversion') {
      return handleConversion(request, env);
    }

    // GET /api/stats — operator only
    if (request.method === 'GET' && path === '/api/stats') {
      if (!isOperator(request, env)) return json({ error: 'unauthorized' }, 401);
      return handleStats(url, env);
    }

    // GET /api/clicks/:clickId — operator only
    const lookupMatch = path.match(/^\/api\/clicks\/([^/]+)$/);
    if (request.method === 'GET' && lookupMatch) {
      if (!isOperator(request, env)) return json({ error: 'unauthorized' }, 401);
      const store = getStore(env);
      const click = await store.getClick(decodeURIComponent(lookupMatch[1]));
      if (!click) return json({ error: 'click not found' }, 404);
      const conversions = await store.listConversions();
      const conversion = conversions.find((c) => c.clickId === click.clickId);
      return json({ click, conversion: conversion ?? null });
    }

    // NOWPayments all-rounder (migration 010)
    if (request.method === 'POST' && path === '/api/payments/deposits') {
      return handleCreateDeposit(request, env);
    }
    if (request.method === 'POST' && path === '/api/ipn/nowpayments') {
      return handleIpn(request, env);
    }
    if (request.method === 'POST' && path === '/api/payouts/execute') {
      return handleExecutePayout(request, env);
    }
    const verifyMatch = path.match(/^\/api\/payouts\/([^/]+)\/verify$/);
    if (request.method === 'POST' && verifyMatch) {
      return handleVerifyPayout(request, env, decodeURIComponent(verifyMatch[1]));
    }
    const payoutStatusMatch = path.match(/^\/api\/payouts\/([^/]+)\/status$/);
    if (request.method === 'GET' && payoutStatusMatch) {
      return handlePayoutStatus(request, env, decodeURIComponent(payoutStatusMatch[1]));
    }
    if (request.method === 'GET' && path === '/api/payments/balance') {
      return handleCustodyBalance(request, env);
    }
    if (request.method === 'POST' && path === '/api/payments/validate-address') {
      return handleValidateAddress(request, env);
    }

    return json({ error: 'not found' }, 404);
}
