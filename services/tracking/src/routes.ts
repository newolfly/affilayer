/**
 * Tracking service routes (Fastify). See CONTRACT.md for the exact routes.
 * Stats come ONLY from recorded events — no fake stats, no payment integration.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import {
  computeCommission,
  generateClickId,
  smartlinkPick,
  type Click,
  type Conversion,
} from '@affilayer/shared';
import { InMemoryStore, type Store } from './store.js';
import { deliverPostbacks, verifySignature } from './postbacks.js';

export interface TrackingAppOptions {
  store?: Store;
  /** HMAC key for POST /conversion. Defaults to env POSTBACK_SECRET. */
  postbackSecret?: string;
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

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function headerString(req: FastifyRequest, name: string): string | undefined {
  const h = req.headers[name];
  return typeof h === 'string' ? h : undefined;
}

function clientIp(req: FastifyRequest): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip;
}

function geoFrom(req: FastifyRequest, query: Record<string, unknown>): string | undefined {
  const q = typeof query.geo === 'string' ? query.geo : undefined;
  const vercel = req.headers['x-vercel-ip-country'];
  const cf = req.headers['cf-ipcountry'];
  const pick = (h: string | string[] | undefined) => (typeof h === 'string' ? h : undefined);
  return q ?? pick(vercel) ?? pick(cf);
}

export async function buildApp(opts: TrackingAppOptions = {}): Promise<FastifyInstance> {
  const store = opts.store ?? new InMemoryStore();
  const postbackSecret = opts.postbackSecret ?? process.env.POSTBACK_SECRET ?? '';
  const app = Fastify({ logger: false });

  // Keep the raw body so POST /conversion can verify the HMAC over it.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new Error('Invalid JSON'), undefined);
    }
  });

  app.get('/health', async () => ({ ok: true }));

  // --- Click tracking: GET /c/:affiliateCode/:offerId -> 302 to landing URL ---
  app.get<{ Params: { affiliateCode: string; offerId: string }; Querystring: Record<string, string> }>(
    '/c/:affiliateCode/:offerId',
    async (req, reply) => {
      const { affiliateCode, offerId } = req.params;
      const offer = await store.getOffer(offerId);
      if (!offer) return reply.code(404).send({ error: 'offer not found' });

      const clickId = generateClickId();
      const click: Click = {
        id: randomUUID(),
        clickId,
        affiliateCode,
        offerId,
        sub1: req.query.sub1,
        sub2: req.query.sub2,
        sub3: req.query.sub3,
        sub4: req.query.sub4,
        sub5: req.query.sub5,
        source: req.query.source,
        referrer: headerString(req, "referer") ?? headerString(req, "referrer"),
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
        country: geoFrom(req, req.query),
        device: req.query.device,
        createdAt: new Date().toISOString(),
      };
      await store.recordClick(click);
      return reply.code(302).redirect(appendQuery(offer.landingUrl, 'click_id', clickId));
    },
  );

  // --- SmartLink: GET /s/:smartlinkCode -> deterministic pick, 302 ---
  app.get<{ Params: { smartlinkCode: string }; Querystring: Record<string, string> }>(
    '/s/:smartlinkCode',
    async (req, reply) => {
      const { smartlinkCode } = req.params;
      const offers = await store.listOffers();
      const picked = smartlinkPick(offers, {
        country: req.query.country,
        device: req.query.device,
        trafficSource: req.query.source,
      });
      if (!picked) return reply.code(404).send({ error: 'no eligible offer' });

      const clickId = generateClickId();
      const click: Click = {
        id: randomUUID(),
        clickId,
        affiliateCode: req.query.affiliate_code ?? 'smartlink',
        offerId: picked.id,
        sub1: req.query.sub1,
        sub2: req.query.sub2,
        sub3: req.query.sub3,
        sub4: req.query.sub4,
        sub5: req.query.sub5,
        source: req.query.source,
        referrer: headerString(req, "referer") ?? headerString(req, "referrer"),
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
        country: geoFrom(req, req.query),
        device: req.query.device,
        smartlink: true,
        smartlinkCode,
        createdAt: new Date().toISOString(),
      };
      await store.recordClick(click);
      return reply.code(302).redirect(appendQuery(picked.landingUrl, 'click_id', clickId));
    },
  );

  // --- Conversion: POST /conversion (HMAC-signed JSON) ---
  app.post<{ Body: ConversionBody }>('/conversion', async (req, reply) => {
    if (!postbackSecret) {
      return reply.code(500).send({ error: 'POSTBACK_SECRET not configured' });
    }
    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';
    const signature = req.headers['x-affilayer-signature'];
    if (!verifySignature(postbackSecret, rawBody, typeof signature === 'string' ? signature : undefined)) {
      return reply.code(400).send({ error: 'bad signature' });
    }

    const body = req.body ?? {};
    const clickId = typeof body.click_id === 'string' ? body.click_id : '';
    const offerId = typeof body.offer_id === 'string' ? body.offer_id : '';
    const payout = typeof body.payout === 'number' ? body.payout : Number.NaN;
    const currency = typeof body.currency === 'string' ? body.currency : '';
    const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : '';
    const sub1 = typeof body.sub1 === 'string' ? body.sub1 : undefined;

    if (!clickId || !offerId || !Number.isFinite(payout) || payout < 0 || !currency || !idempotencyKey) {
      return reply.code(400).send({
        error: 'missing or invalid fields: click_id, offer_id, payout, currency, idempotency_key are required',
      });
    }

    // Dedup: same idempotency_key OR same click_id+offer_id returns the original.
    const existing =
      (await store.findConversionByIdempotencyKey(idempotencyKey)) ??
      (await store.findConversionByClickAndOffer(clickId, offerId));
    if (existing) {
      return reply.code(200).send({ ok: true, duplicate: true, conversion: existing });
    }

    const click = await store.getClick(clickId);
    const offer = await store.getOffer(offerId);
    const conversion: Conversion = {
      id: randomUUID(),
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
      id: randomUUID(),
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

    return reply.code(201).send({
      ok: true,
      duplicate: false,
      conversion,
      ledgerEntry,
      commission,
      postbacks: postbacks.map((p) => ({ url: p.url, status: p.status, attempts: p.attempts })),
    });
  });

  // --- Stats: GET /api/stats — server-side aggregation over recorded events only ---
  app.get<{ Querystring: Record<string, string> }>('/api/stats', async (req) => {
    const q = req.query;
    const from = q.from ? new Date(q.from).getTime() : Number.NEGATIVE_INFINITY;
    const to = q.to ? new Date(q.to).getTime() : Number.POSITIVE_INFINITY;
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= from && t <= to;
    };

    const clicks = (await store.listClicks()).filter(
      (c) =>
        inRange(c.createdAt) &&
        (!q.offer_id || c.offerId === q.offer_id) &&
        (!q.affiliate_code || c.affiliateCode === q.affiliate_code) &&
        (!q.country || c.country === q.country) &&
        (!q.device || c.device === q.device) &&
        (!q.source || c.source === q.source),
    );

    const clickById = new Map(clicks.map((c) => [c.clickId, c]));
    const allConversions = await store.listConversions();
    const conversions = allConversions.filter((conv) => {
      if (!inRange(conv.createdAt)) return false;
      if (q.offer_id && conv.offerId !== q.offer_id) return false;
      const click = clickById.get(conv.clickId);
      if (q.affiliate_code && conv.affiliateCode !== q.affiliate_code) return false;
      if (q.country && click?.country !== q.country) return false;
      if (q.device && click?.device !== q.device) return false;
      if (q.source && click?.source !== q.source) return false;
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
    const commission = billable.reduce(
      (sum, c) => sum + (ledgerByConversion.get(c.id)?.amount ?? 0),
      0,
    );
    const uniqueClicks = new Set(clicks.map((c) => c.ip ?? c.clickId)).size;

    return {
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
    };
  });

  // --- Click lookup: GET /api/clicks/:clickId ---
  app.get<{ Params: { clickId: string } }>('/api/clicks/:clickId', async (req, reply) => {
    const click = await store.getClick(req.params.clickId);
    if (!click) return reply.code(404).send({ error: 'click not found' });
    const conversions = await store.listConversions();
    const conversion = conversions.find((c) => c.clickId === click.clickId);
    return { click, conversion: conversion ?? null };
  });

  return app;
}

export { InMemoryStore } from './store.js';
export { createPgStore } from './pg-store.js';
