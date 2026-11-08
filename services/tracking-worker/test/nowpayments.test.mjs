// NOWPayments tests — mocked NOWPayments API + mocked Supabase, no network,
// no real money. Run: npm run build && node --test test/nowpayments.test.mjs
//
// Covers: TOTP RFC 6238 vectors, worker-proof HMAC, IPN parsing, the
// NOWPayments client (invoice / payout / verify with JWT), and the Worker
// routes end to end (deposit create, IPN confirm-by-re-fetch, payout
// execute preflight + record, admin gating).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../dist/index.js';
import {
  NowPaymentsClient,
  parseIpn,
  totp,
  workerProof,
  NP_TERMINAL_PAYMENT_STATUSES,
} from '../dist/nowpayments.js';

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

test('totp matches RFC 6238 vectors (SHA-1, 6-digit truncation)', async () => {
  // Secret is ASCII "12345678901234567890" in Base32 (RFC 6238 Appendix B).
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(await totp(secret, 59 * 1000), '287082'); // 94287082
  assert.equal(await totp(secret, 1111111109 * 1000), '081804'); // 07081804
  assert.equal(await totp(secret, 1111111111 * 1000), '050471'); // 14050471
  assert.equal(await totp(secret, 1234567890 * 1000), '005924'); // 89005924
  // Same 30s window -> same code; next window -> different code.
  assert.equal(await totp(secret, 60 * 1000), await totp(secret, 89 * 1000));
  assert.notEqual(await totp(secret, 60 * 1000), await totp(secret, 90 * 1000));
});

test('workerProof matches Node HMAC-SHA256 hex', async () => {
  const proof = await workerProof('dep_abc', 'proof-secret');
  const expected = createHmac('sha256', 'proof-secret').update('dep_abc').digest('hex');
  assert.equal(proof, expected);
});

test('parseIpn identifies payment, payout and unknown bodies', () => {
  const pay = parseIpn({
    payment_id: 5077125051,
    payment_status: 'finished',
    order_id: 'dep_abc',
  });
  assert.equal(pay.kind, 'payment');
  assert.equal(pay.paymentId, '5077125051');
  assert.equal(pay.orderId, 'dep_abc');
  assert.equal(pay.claimedStatus, 'finished');

  const out = parseIpn({ batch_withdrawal_id: '5000000191', status: 'FINISHED' });
  assert.equal(out.kind, 'payout');
  assert.equal(out.batchId, '5000000191');

  assert.equal(parseIpn({ hello: 'world' }).kind, 'unknown');
  assert.equal(parseIpn(null).kind, 'unknown');
});

test('terminal payment statuses are the settled set', () => {
  for (const s of ['finished', 'failed', 'expired', 'refunded', 'partially_paid']) {
    assert.ok(NP_TERMINAL_PAYMENT_STATUSES.has(s), s);
  }
  for (const s of ['waiting', 'confirming', 'confirmed', 'sending']) {
    assert.ok(!NP_TERMINAL_PAYMENT_STATUSES.has(s), s);
  }
});

// ---------------------------------------------------------------------------
// Client with a mocked fetch
// ---------------------------------------------------------------------------

function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    for (const [match, handler] of routes) {
      if (typeof match === 'string' ? url.includes(match) : match.test(url)) {
        return handler(url, init);
      }
    }
    return new Response(JSON.stringify({ message: 'not mocked: ' + url }), { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const jsonRes = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

test('client creates an invoice with the right body', async () => {
  const fetchFn = mockFetch([
    ['/v1/invoice', () => jsonRes({ id: 'inv-1', invoice_url: 'https://nowpayments.io/payment?iid=1' })],
  ]);
  const client = new NowPaymentsClient({ env: 'production', apiKey: 'k', fetchFn });
  const inv = await client.createInvoice({
    amountUsd: 50,
    orderId: 'dep_abc',
    successUrl: 'https://affilayer.com/ok',
    cancelUrl: 'https://affilayer.com/cancel',
  });
  assert.equal(inv.invoice_url, 'https://nowpayments.io/payment?iid=1');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(sent.price_amount, 50);
  assert.equal(sent.price_currency, 'usd');
  assert.equal(sent.order_id, 'dep_abc');
  assert.equal(sent.ipn_callback_url, 'https://go.affilayer.com/api/ipn/nowpayments');
  assert.equal(fetchFn.calls[0].init.headers['x-api-key'], 'k');
});

test('client mints the payout JWT once and reuses it', async () => {
  let authCalls = 0;
  const fetchFn = mockFetch([
    ['/v1/auth', () => { authCalls++; return jsonRes({ token: 'jwt-1' }); }],
    ['/v1/payout', () => jsonRes({ id: '5000000191', withdrawals: [{ id: 'w1' }] })],
  ]);
  const client = new NowPaymentsClient({
    env: 'production', apiKey: 'k', email: 'a@b.c', password: 'pw', fetchFn,
  });
  await client.createPayout({ address: 'Txxx', currency: 'usdttrc20', amount: 12 });
  await client.createPayout({ address: 'Txxx', currency: 'usdttrc20', amount: 12 });
  assert.equal(authCalls, 1);
  const payoutCall = fetchFn.calls.find((c) => c.url.includes('/v1/payout'));
  assert.equal(payoutCall.init.headers.Authorization, 'Bearer jwt-1');
  const sent = JSON.parse(payoutCall.init.body);
  assert.equal(sent.withdrawals[0].currency, 'usdttrc20');
});

test('client surfaces NOWPayments errors as NpError', async () => {
  const fetchFn = mockFetch([
    ['/v1/invoice', () => jsonRes({ message: 'amount too small' }, 400)],
  ]);
  const client = new NowPaymentsClient({ env: 'production', apiKey: 'k', fetchFn });
  await assert.rejects(
    () => client.createInvoice({ amountUsd: 1, orderId: 'x', successUrl: 's', cancelUrl: 'c' }),
    (err) => err.message.includes('amount too small'),
  );
});

// ---------------------------------------------------------------------------
// Worker routes with mocked global fetch (Supabase + NOWPayments)
// ---------------------------------------------------------------------------

const SB_URL = 'https://test.supabase.co';
const ANON = 'test-anon';

function workerEnv(overrides = {}) {
  return {
    POSTBACK_SECRET: 'test-secret',
    SUPABASE_URL: SB_URL,
    SUPABASE_ANON_KEY: ANON,
    NOWPAYMENTS_ENV: 'production',
    NOWPAYMENTS_API_KEY: 'np-key',
    NOWPAYMENTS_EMAIL: 'mail@sojibahmmed.com',
    NOWPAYMENTS_PASSWORD: 'np-pass',
    NP_WORKER_PROOF: 'proof-secret',
    ...overrides,
  };
}

/** Route a mocked fetch across Supabase + NOWPayments by URL. */
function routeFetch(handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [match, handler] of handlers) {
      if (url.includes(match)) return handler(url, init);
    }
    return new Response(JSON.stringify({ message: 'unmocked ' + url }), { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const rpcBody = (init) => {
  try { return JSON.parse(init.body ?? '{}'); } catch { return {}; }
};

test('deposit create: 401 without JWT, 201 with invoice_url for an advertiser', async () => {
  const env = workerEnv();
  const fetchFn = routeFetch([
    [SB_URL + '/auth/v1/user', () => jsonRes({ id: 'adv-1', email: 'adv@x.com' })],
    ['api.nowpayments.io/v1/invoice', () => jsonRes({ id: 'inv-1', invoice_url: 'https://nowpayments.io/payment?iid=1' })],
    ['/rest/v1/rpc/np_create_deposit', () => jsonRes('dep-row-uuid')],
  ]);
  const prevFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const noAuth = await worker.fetch(
      new Request('https://go.affilayer.test/api/payments/deposits', {
        method: 'POST',
        body: JSON.stringify({ amount_usd: 50 }),
      }),
      env,
    );
    assert.equal(noAuth.status, 401);

    const ok = await worker.fetch(
      new Request('https://go.affilayer.test/api/payments/deposits', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_usd: 50 }),
      }),
      env,
    );
    assert.equal(ok.status, 201);
    const data = await ok.json();
    assert.equal(data.invoice_url, 'https://nowpayments.io/payment?iid=1');
    assert.ok(String(data.order_id).startsWith('dep_'));
    const rpcCall = fetchFn.calls.find((c) => c.url.includes('np_create_deposit'));
    assert.ok(rpcCall, 'np_create_deposit was called');
    assert.equal(rpcBody(rpcCall.init).p_advertiser_id, 'adv-1');
    assert.equal(rpcBody(rpcCall.init).p_amount_usd, 50);

    const tooSmall = await worker.fetch(
      new Request('https://go.affilayer.test/api/payments/deposits', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_usd: 5 }),
      }),
      env,
    );
    assert.equal(tooSmall.status, 400);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('IPN: finished claim is confirmed only by API re-fetch (proof-checked RPC)', async () => {
  const env = workerEnv();
  const expectedProof = createHmac('sha256', 'proof-secret').update('dep_abc').digest('hex');
  const fetchFn = routeFetch([
    ['api.nowpayments.io/v1/payment/123', () =>
      jsonRes({
        payment_id: 123,
        payment_status: 'finished',
        order_id: 'dep_abc',
        actually_paid: 1.5,
        outcome_amount: 49.5,
        outcome_currency: 'usdttrc20',
      })],
    ['/rest/v1/rpc/np_confirm_deposit', () => jsonRes('finished')],
  ]);
  const prevFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const res = await worker.fetch(
      new Request('https://go.affilayer.test/api/ipn/nowpayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: 123, payment_status: 'finished', order_id: 'dep_abc' }),
      }),
      env,
    );
    assert.equal(res.status, 200);
    const rpcCall = fetchFn.calls.find((c) => c.url.includes('np_confirm_deposit'));
    assert.ok(rpcCall, 'confirm RPC was called');
    const params = rpcBody(rpcCall.init);
    assert.equal(params.p_order_id, 'dep_abc');
    assert.equal(params.p_proof, expectedProof);
    assert.equal(params.p_status, 'finished');
    assert.equal(params.p_outcome_currency, 'usdttrc20');
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('IPN: a "finished" claim the API says is still waiting credits nothing', async () => {
  const env = workerEnv();
  const fetchFn = routeFetch([
    ['api.nowpayments.io/v1/payment/124', () =>
      jsonRes({ payment_id: 124, payment_status: 'waiting', order_id: 'dep_xyz' })],
    ['/rest/v1/rpc/np_confirm_deposit', () => jsonRes('finished')],
  ]);
  const prevFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const res = await worker.fetch(
      new Request('https://go.affilayer.test/api/ipn/nowpayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: 124, payment_status: 'finished', order_id: 'dep_xyz' }),
      }),
      env,
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(String(data.ignored ?? ''), /not terminal/);
    assert.equal(fetchFn.calls.filter((c) => c.url.includes('np_confirm_deposit')).length, 0);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('IPN: unknown bodies are ignored, payments disabled returns 503', async () => {
  const env = workerEnv();
  const fetchFn = routeFetch([]);
  const prevFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const unknown = await worker.fetch(
      new Request('https://go.affilayer.test/api/ipn/nowpayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      }),
      env,
    );
    assert.equal(unknown.status, 200);

    const disabled = await worker.fetch(
      new Request('https://go.affilayer.test/api/ipn/nowpayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: 1, payment_status: 'finished' }),
      }),
      workerEnv({ NOWPAYMENTS_ENV: undefined, NOWPAYMENTS_API_KEY: undefined }),
    );
    assert.equal(disabled.status, 503);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('payout execute: non-admin is refused; admin preflights and records the batch', async () => {
  const env = workerEnv();
  const mkFetch = (isAdmin) => routeFetch([
    [SB_URL + '/auth/v1/user', () => jsonRes({ id: 'admin-1', email: 'admin@x.com' })],
    ['/rest/v1/rpc/is_admin', () => jsonRes(isAdmin)],
    ['/rest/v1/payout_requests', () =>
      jsonRes([{ id: 'req-1', affiliate_id: 'aff-1', amount: 12, currency: 'USD', status: 'approved' }])],
    ['/rest/v1/affiliate_profiles', () =>
      jsonRes([{ profile_id: 'aff-1', payout_address: 'TEmGwPeRTPiLFLVfBxXkSP91yc5GMNQhfS', payout_currency: 'usdttrc20' }])],
    ['api.nowpayments.io/v1/payout/validate-address', () => jsonRes({ result: true })],
    ['api.nowpayments.io/v1/balance', () => jsonRes({ usdttrc20: { amount: 100, pendingAmount: 0 } })],
    ['api.nowpayments.io/v1/payout/fee', () => jsonRes({ fee: 1.5 })],
    ['api.nowpayments.io/v1/auth', () => jsonRes({ token: 'jwt-1' })],
    ['api.nowpayments.io/v1/payout', () => jsonRes({ id: '5000000191', withdrawals: [{ id: 'w1' }] })],
    ['/rest/v1/rpc/np_record_payout', () => jsonRes('np-row-uuid')],
    ['/rest/v1/rpc/np_sync_payout_status', () => jsonRes('awaiting_2fa')],
  ]);
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = mkFetch(false);
    const denied = await worker.fetch(
      new Request('https://go.affilayer.test/api/payouts/execute', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_request_id: 'req-1' }),
      }),
      env,
    );
    assert.equal(denied.status, 403);

    globalThis.fetch = mkFetch(true);
    const ok = await worker.fetch(
      new Request('https://go.affilayer.test/api/payouts/execute', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_request_id: 'req-1' }),
      }),
      env,
    );
    assert.equal(ok.status, 200);
    const data = await ok.json();
    assert.equal(data.batch_id, '5000000191');
    assert.equal(data.status, 'awaiting_2fa');
    assert.equal(data.auto_verified, false);
    const recordCall = globalThis.fetch.calls.find((c) => c.url.includes('np_record_payout'));
    assert.ok(recordCall, 'np_record_payout was called');
    assert.equal(rpcBody(recordCall.init).p_batch_id, '5000000191');
    assert.equal(rpcBody(recordCall.init).p_amount, 12);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('payout execute: insufficient custody balance is refused before any payout', async () => {
  const env = workerEnv();
  const fetchFn = routeFetch([
    [SB_URL + '/auth/v1/user', () => jsonRes({ id: 'admin-1', email: 'admin@x.com' })],
    ['/rest/v1/rpc/is_admin', () => jsonRes(true)],
    ['/rest/v1/payout_requests', () =>
      jsonRes([{ id: 'req-1', affiliate_id: 'aff-1', amount: 500, currency: 'USD', status: 'approved' }])],
    ['/rest/v1/affiliate_profiles', () =>
      jsonRes([{ profile_id: 'aff-1', payout_address: 'TEmGwPeRTPiLFLVfBxXkSP91yc5GMNQhfS', payout_currency: 'usdttrc20' }])],
    ['api.nowpayments.io/v1/payout/validate-address', () => jsonRes({ result: true })],
    ['api.nowpayments.io/v1/balance', () => jsonRes({ usdttrc20: { amount: 10, pendingAmount: 0 } })],
    ['api.nowpayments.io/v1/payout', () => jsonRes({ id: '5000000191' })],
  ]);
  const prevFetch = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    const res = await worker.fetch(
      new Request('https://go.affilayer.test/api/payouts/execute', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_request_id: 'req-1' }),
      }),
      env,
    );
    assert.equal(res.status, 422);
    // The payout CREATE call (exact /v1/payout path) must never have fired;
    // the validate-address preflight is the only POST to a /v1/payout* path.
    assert.equal(fetchFn.calls.filter((c) => c.url.endsWith('/v1/payout')).length, 0);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
