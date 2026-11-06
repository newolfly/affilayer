import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { detectFraudSignals } from '@affilayer/shared';
import { buildApp } from '../src/index.js';
import { InMemoryStore } from '../src/store.js';
import { computeSignature, deliverPostbacks, verifySignature } from '../src/postbacks.js';

const SECRET = 'test-secret-123';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

async function clickOffer(app: Awaited<ReturnType<typeof buildApp>>, offerId = 'offer-a') {
  const res = await app.inject({
    method: 'GET',
    url: `/c/aff-1/${offerId}?sub1=hello&source=search&geo=US&device=mobile`,
    headers: { 'user-agent': 'Mozilla/5.0', 'x-forwarded-for': '203.0.113.10' },
  });
  expect(res.statusCode).toBe(302);
  const location = res.headers.location as string;
  const clickId = new URL(location).searchParams.get('click_id');
  expect(clickId).toMatch(/^clk_[0-9a-f]{24}$/);
  return { res, location, clickId: clickId as string };
}

describe('tracking service', () => {
  it('GET /health -> { ok: true }', async () => {
    const app = await buildApp({ store: new InMemoryStore(), postbackSecret: SECRET });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('click -> conversion attribution, pending ledger entry, stats', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, postbackSecret: SECRET });
    const { clickId } = await clickOffer(app, 'offer-a');

    const body = JSON.stringify({
      click_id: clickId,
      offer_id: 'offer-a',
      payout: 10,
      currency: 'USD',
      idempotency_key: 'key-1',
      sub1: 'hello',
    });
    const conv = await app.inject({
      method: 'POST',
      url: '/conversion',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-affilayer-signature': sign(body) },
    });
    expect(conv.statusCode).toBe(201);
    const payload = conv.json();
    expect(payload.duplicate).toBe(false);
    expect(payload.conversion.status).toBe('pending');
    expect(payload.conversion.clickId).toBe(clickId);
    expect(payload.ledgerEntry.status).toBe('pending');
    expect(payload.ledgerEntry.amount).toBe(10); // CPA: flat payout
    expect(payload.commission).toBe(10);

    // Click lookup returns the attributed conversion.
    const lookup = await app.inject({ method: 'GET', url: `/api/clicks/${clickId}` });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().click.clickId).toBe(clickId);
    expect(lookup.json().conversion.id).toBe(payload.conversion.id);

    // Unknown click -> 404.
    expect((await app.inject({ method: 'GET', url: '/api/clicks/clk_doesnotexist' })).statusCode).toBe(404);

    // Stats come only from recorded events.
    const stats = await app.inject({ method: 'GET', url: '/api/stats?offer_id=offer-a' });
    expect(stats.json()).toMatchObject({
      clicks: 1,
      unique_clicks: 1,
      conversions: 1,
      pending: 1,
      approved: 0,
      rejected: 0,
      revenue: 10,
      commission: 10,
      epc: 10,
      cr: 1,
    });
  });

  it('rejects a bad HMAC signature and missing fields with 400', async () => {
    const app = await buildApp({ store: new InMemoryStore(), postbackSecret: SECRET });
    const body = JSON.stringify({
      click_id: 'clk_x',
      offer_id: 'offer-a',
      payout: 10,
      currency: 'USD',
      idempotency_key: 'key-bad',
    });
    const badSig = await app.inject({
      method: 'POST',
      url: '/conversion',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-affilayer-signature': 'deadbeef' },
    });
    expect(badSig.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'POST',
      url: '/conversion',
      payload: JSON.stringify({ click_id: 'clk_x' }),
      headers: {
        'content-type': 'application/json',
        'x-affilayer-signature': sign(JSON.stringify({ click_id: 'clk_x' })),
      },
    });
    expect(missing.statusCode).toBe(400);

    // No signature header at all -> 400.
    const noSig = await app.inject({
      method: 'POST',
      url: '/conversion',
      payload: body,
      headers: { 'content-type': 'application/json' },
    });
    expect(noSig.statusCode).toBe(400);
  });

  it('dedups by idempotency_key and by click_id+offer_id', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, postbackSecret: SECRET });
    const { clickId } = await clickOffer(app, 'offer-a');

    const post = (key: string, click = clickId) => {
      const body = JSON.stringify({
        click_id: click,
        offer_id: 'offer-a',
        payout: 10,
        currency: 'USD',
        idempotency_key: key,
      });
      return app.inject({
        method: 'POST',
        url: '/conversion',
        payload: body,
        headers: { 'content-type': 'application/json', 'x-affilayer-signature': sign(body) },
      });
    };

    const first = await post('dup-key');
    expect(first.statusCode).toBe(201);
    const second = await post('dup-key');
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().conversion.id).toBe(first.json().conversion.id);

    // Different key, same click+offer -> still a duplicate.
    const third = await post('other-key');
    expect(third.statusCode).toBe(200);
    expect(third.json().duplicate).toBe(true);

    expect((await store.listConversions()).length).toBe(1);
    expect((await store.listLedgerEntries()).length).toBe(1);
  });

  it('SmartLink pick is deterministic: highest payout wins (offer-b, $25)', async () => {
    const app = await buildApp({ store: new InMemoryStore(), postbackSecret: SECRET });
    const first = await app.inject({ method: 'GET', url: '/s/main?country=US&device=mobile&source=search' });
    const second = await app.inject({ method: 'GET', url: '/s/main?country=US&device=mobile&source=search' });
    expect(first.statusCode).toBe(302);
    expect(first.headers.location).toContain('https://example.com/landing-b');
    // Same landing URL both times (only the click_id differs).
    expect((first.headers.location as string).split('?')[0]).toBe(
      (second.headers.location as string).split('?')[0],
    );
    // SmartLink click is recorded with the smartlink flag.
    const clickId = new URL(first.headers.location as string).searchParams.get('click_id') as string;
    const lookup = await app.inject({ method: 'GET', url: `/api/clicks/${clickId}` });
    expect(lookup.json().click.smartlink).toBe(true);
    expect(lookup.json().click.offerId).toBe('offer-b');
  });

  it('unknown offer click -> 404', async () => {
    const app = await buildApp({ store: new InMemoryStore(), postbackSecret: SECRET });
    const res = await app.inject({ method: 'GET', url: '/c/aff-1/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('postback macro expansion + delivery recording (mock fetch)', async () => {
    const store = new InMemoryStore();
    await store.addPostbackConfig({
      id: 'cfg-1',
      offerId: 'offer-a',
      url: 'https://postback.example/hit?click={click_id}&amt={payout}&cur={currency}&st={status}&s1={sub1}',
    });
    const seen: string[] = [];
    const mockFetch = async (url: string) => {
      seen.push(url);
      return { ok: true, status: 200 } as Response;
    };
    const events = await deliverPostbacks(
      store,
      await store.getPostbackConfigs('offer-a'),
      { click_id: 'clk_abc', conversion_id: 'conv_1', payout: '10', currency: 'USD', status: 'pending', sub1: 'hello' },
      { fetchFn: mockFetch as typeof fetch, baseDelayMs: 1 },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe('https://postback.example/hit?click=clk_abc&amt=10&cur=USD&st=pending&s1=hello');
    expect(events[0].status).toBe('delivered');
    expect(events[0].attempts).toBe(1);

    // Retries: fail twice, then succeed.
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls < 3) throw new Error('boom');
      return { ok: true, status: 200 } as Response;
    };
    const retried = await deliverPostbacks(
      store,
      [{ id: 'cfg-2', url: 'https://postback.example/flaky?click={click_id}' }],
      { click_id: 'clk_abc', conversion_id: 'conv_1', payout: '10', currency: 'USD', status: 'pending', sub1: '' },
      { fetchFn: flaky as typeof fetch, baseDelayMs: 1 },
    );
    expect(retried[0].status).toBe('delivered');
    expect(retried[0].attempts).toBe(3);
  });

  it('conversion dispatches a configured postback and records the event', async () => {
    const store = new InMemoryStore();
    await store.addPostbackConfig({
      id: 'cfg-9',
      offerId: 'offer-a',
      // Unroutable address: fetch fails, event must be recorded as failed, conversion still succeeds.
      url: 'http://127.0.0.1:9/pb?click={click_id}&amt={payout}',
    });
    const app = await buildApp({ store, postbackSecret: SECRET });
    const { clickId } = await clickOffer(app, 'offer-a');
    const body = JSON.stringify({
      click_id: clickId,
      offer_id: 'offer-a',
      payout: 10,
      currency: 'USD',
      idempotency_key: 'key-pb',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/conversion',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-affilayer-signature': sign(body) },
    });
    expect(res.statusCode).toBe(201);
    const events = await store.listPostbackEvents();
    expect(events).toHaveLength(1);
    expect(events[0].url).toContain(`click=${clickId}&amt=10`);
    expect(events[0].status).toBe('failed');
    expect(events[0].attempts).toBeGreaterThanOrEqual(3);
  });

  it('HMAC helper: computeSignature matches verifySignature', () => {
    const raw = '{"a":1}';
    expect(computeSignature(SECRET, raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature(SECRET, raw, computeSignature(SECRET, raw))).toBe(true);
    expect(verifySignature(SECRET, raw, computeSignature(SECRET, '{"a":2}'))).toBe(false);
  });

  it('fraud signals: rapid clicks are recorded (never auto-rejected) and flagged by the shared rules', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, postbackSecret: SECRET });
    const now = new Date();
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: 'GET',
        url: `/c/aff-1/offer-a?geo=US`,
        headers: { 'user-agent': '', 'x-forwarded-for': '198.51.100.7' },
      });
      expect(res.statusCode).toBe(302); // signals only — never auto-reject
    }
    const clicks = await store.listClicks();
    expect(clicks).toHaveLength(11);
    const signals = detectFraudSignals(
      clicks.map((c) => ({
        clickId: c.clickId,
        ip: c.ip,
        userAgent: c.userAgent,
        createdAt: new Date(now.getTime() + 1000).toISOString(),
      })),
    );
    expect(signals.some((s) => s.type === 'high_click_rate_ip')).toBe(true);
    expect(signals.some((s) => s.type === 'empty_user_agent')).toBe(true);
  });

  it('stats filters work (country / source)', async () => {
    const app = await buildApp({ store: new InMemoryStore(), postbackSecret: SECRET });
    await clickOffer(app, 'offer-a'); // geo=US, source=search
    await app.inject({ method: 'GET', url: '/c/aff-1/offer-b?geo=BD&source=social' });
    const us = await app.inject({ method: 'GET', url: '/api/stats?country=US' });
    expect(us.json().clicks).toBe(1);
    const bd = await app.inject({ method: 'GET', url: '/api/stats?country=BD' });
    expect(bd.json().clicks).toBe(1);
    const all = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(all.json().clicks).toBe(2);
    expect(all.json().unique_clicks).toBe(2);
  });
});
