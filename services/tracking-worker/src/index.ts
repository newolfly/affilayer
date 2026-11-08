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
 *
 * Store: hybrid (see supabase-store.ts). Demo offers (demo-offer-1/2/3)
 * and their clicks/conversions live in per-isolate memory, as before.
 * Real offers (UUIDs) resolve from Supabase and their clicks,
 * conversions and ledger rows go to Postgres via SECURITY DEFINER RPCs
 * (migration 007) — durable across isolates. The dashboard reads the
 * same Postgres rows via RLS, so Worker stats and dashboard stats are
 * the same data. Click recording is best-effort: if the durable write
 * fails, the visitor still gets their 302 (a lost click record beats
 * a lost visitor); conversions are strict and report failures.
 *
 * Env: POSTBACK_SECRET (wrangler secret) — HMAC key for POST /conversion,
 * and the operator token (Authorization: Bearer <secret>) for /api/stats
 * and /api/clicks, which expose revenue and raw click data.
 * SUPABASE_URL + SUPABASE_ANON_KEY (wrangler [vars], both public values)
 * enable the durable store; without them the Worker runs fully in-memory
 * (demo mode).
 */
import {
  computeCommission,
  generateClickId,
  smartlinkPick,
  type Click,
  type Conversion,
} from '@affilayer/shared';
import { InMemoryStore } from './store.js';
import { SupabaseStore } from './supabase-store.js';
import type { Store } from './store.js';
import { deliverPostbacks, verifySignature } from './postbacks.js';

export interface Env {
  POSTBACK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

// One store per isolate. Memoized: env does not change across requests
// in a deployment. Supabase-backed when the vars are set, in-memory
// (demo mode) otherwise.
let cachedStore: Store | null = null;
function getStore(env: Env): Store {
  if (cachedStore) return cachedStore;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    cachedStore = new SupabaseStore({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY });
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
 *  expose revenue and raw click data (IP, user agent). The POSTBACK_SECRET
 *  doubles as the operator token — Bearer auth, never a query param. */
function isOperator(request: Request, env: Env): boolean {
  return !!env.POSTBACK_SECRET && request.headers.get('authorization') === `Bearer ${env.POSTBACK_SECRET}`;
}

function geoFrom(request: Request): string | undefined {
  // Country comes from Cloudflare's header only. A ?geo= query param must
  // never override it — the visitor could spoof their country.
  return request.headers.get('cf-ipcountry') ?? undefined;
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
    device: url.searchParams.get('device') ?? undefined,
    createdAt: new Date().toISOString(),
    ...extra,
  };
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
    return json({ ok: true, duplicate: true, conversion: existing }, 200);
  }

  // A conversion must belong to a real click on a real offer — never
  // record conversions for clicks that never happened.
  const click = await store.getClick(clickId);
  if (!click) return json({ error: 'unknown click_id' }, 422);
  if (click.offerId !== offerId) return json({ error: 'click_id does not belong to offer_id' }, 422);
  const offer = await store.getOffer(offerId);
  if (!offer) return json({ error: 'unknown offer_id' }, 422);
  const conversion: Conversion = {
    id: crypto.randomUUID(),
    clickId,
    offerId,
    affiliateCode: click?.affiliateCode,
    payout,
    currency,
    status: 'pending',
    idempotencyKey,
    sub1,
    createdAt: new Date().toISOString(),
  };
  await store.recordConversion(conversion);

  const commission = computeCommission(payout, offer?.payoutModel ?? 'CPA', offer?.rateBps);
  const ledgerEntry = await store.recordLedgerEntry({
    id: crypto.randomUUID(),
    conversionId: conversion.id,
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
      const click = recordClickFields(request, url, decodeURIComponent(affiliateCode), decodeURIComponent(offerId));
      // Best-effort: a failed durable write must never break the redirect.
      try {
        await store.recordClick(click);
      } catch (err) {
        console.error('recordClick failed (redirecting anyway):', err);
      }
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
      const store = getStore(env);
      const offers = await store.listOffers();
      // Enforce per-offer click caps at the edge: offers that hit their
      // `cap` are not eligible for a SmartLink pick. (capDaily / capTotal
      // are not enforced here — the store has no daily window.)
      const clicks = await store.listClicks();
      const clicksByOffer = new Map<string, number>();
      for (const c of clicks) clicksByOffer.set(c.offerId, (clicksByOffer.get(c.offerId) ?? 0) + 1);
      const uncapped = offers.filter((o) => o.cap === undefined || (clicksByOffer.get(o.id) ?? 0) < o.cap);
      const picked = smartlinkPick(uncapped, {
        country: url.searchParams.get('country') ?? undefined,
        device: url.searchParams.get('device') ?? undefined,
        trafficSource: url.searchParams.get('source') ?? undefined,
      });
      if (!picked) return json({ error: 'no eligible offer' }, 404);
      const click = recordClickFields(request, url, url.searchParams.get('affiliate_code') ?? 'smartlink', picked.id, {
        smartlink: true,
        smartlinkCode: decodeURIComponent(smartlinkCode),
      });
      // Best-effort: a failed durable write must never break the redirect.
      try {
        await store.recordClick(click);
      } catch (err) {
        console.error('recordClick failed (redirecting anyway):', err);
      }
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

    return json({ error: 'not found' }, 404);
  },
};
