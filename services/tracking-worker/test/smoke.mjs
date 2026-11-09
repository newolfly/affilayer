// Smoke test for the tracking Worker — runs the compiled handler in Node
// (Request/Response + WebCrypto are available in Node 20+). No network,
// no wrangler, no Cloudflare account needed.
//
// Usage: npm run build && node test/smoke.mjs
import worker from '../dist/index.js';
import { createHmac } from 'node:crypto';

const SECRET = 'test-secret-do-not-use-in-production';
const env = { POSTBACK_SECRET: SECRET };
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name} ${extra}`);
  }
}

const call = (req) => worker.fetch(req, env);
const auth = { Authorization: `Bearer ${SECRET}` };

const clickRes = await call(new Request('https://go.affilayer.test/c/AFF1/demo-offer-1?sub1=hello', { method: 'GET' }));
check('click -> 302', clickRes.status === 302, `got ${clickRes.status}`);
const location = clickRes.headers.get('Location') ?? '';
check('click redirects to finance-card with click_id', location.startsWith('https://example.com/finance-card?click_id=clk_'), location);
const clickId = new URL(location).searchParams.get('click_id');

const signBody = (body) => {
  const raw = JSON.stringify(body);
  return {
    raw,
    sig: createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex'),
  };
};

const postConversion = async (body) => {
  const { raw, sig } = signBody(body);
  return call(
    new Request('https://go.affilayer.test/conversion', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-affilayer-signature': sig },
      body: raw,
    }),
  );
};

const convRes = await postConversion({
  click_id: clickId,
  offer_id: 'demo-offer-1',
  payout: 45,
  currency: 'USD',
  idempotency_key: 'idem-smoke-1',
  sub1: 'hello',
});
const conv = await convRes.json();
check('conversion -> 201', convRes.status === 201, `got ${convRes.status} ${JSON.stringify(conv)}`);
check('conversion not duplicate', conv.duplicate === false);
check('commission is 45', conv.commission === 45, `got ${conv.commission}`);

const replayRes = await postConversion({
  click_id: clickId,
  offer_id: 'demo-offer-1',
  payout: 45,
  currency: 'USD',
  idempotency_key: 'idem-smoke-1',
  sub1: 'hello',
});
const replay = await replayRes.json();
check('replay -> 200 duplicate', replayRes.status === 200 && replay.duplicate === true, `got ${replayRes.status}`);

const badSigRes = await call(
  new Request('https://go.affilayer.test/conversion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-affilayer-signature': 'deadbeef' },
    body: JSON.stringify({
      click_id: clickId,
      offer_id: 'demo-offer-1',
      payout: 45,
      currency: 'USD',
      idempotency_key: 'idem-smoke-2',
    }),
  }),
);
check('bad signature -> 400', badSigRes.status === 400, `got ${badSigRes.status}`);

// Unknown click: conversions for clicks that never happened are rejected.
const ghostRes = await postConversion({
  click_id: 'clk_doesnotexist000000000000',
  offer_id: 'demo-offer-1',
  payout: 45,
  currency: 'USD',
  idempotency_key: 'idem-ghost-1',
});
check('unknown click_id -> 422', ghostRes.status === 422, `got ${ghostRes.status}`);

// Unsupported currency and absurd payout are rejected.
const badCurRes = await postConversion({
  click_id: clickId,
  offer_id: 'demo-offer-1',
  payout: 45,
  currency: 'XXX',
  idempotency_key: 'idem-bad-cur-1',
});
check('bad currency -> 400', badCurRes.status === 400, `got ${badCurRes.status}`);

const bigRes = await postConversion({
  click_id: clickId,
  offer_id: 'demo-offer-1',
  payout: 1e12,
  currency: 'USD',
  idempotency_key: 'idem-big-1',
});
check('payout over cap -> 400', bigRes.status === 400, `got ${bigRes.status}`);

// Operator endpoints: 401 without the bearer token, data with it.
const statsNoAuth = await call(new Request('https://go.affilayer.test/api/stats', { method: 'GET' }));
check('stats without token -> 401', statsNoAuth.status === 401, `got ${statsNoAuth.status}`);

const statsRes = await call(new Request('https://go.affilayer.test/api/stats', { method: 'GET', headers: auth }));
const stats = await statsRes.json();
check('stats: 1 click', stats.clicks === 1, JSON.stringify(stats));
check('stats: 1 pending conversion', stats.pending === 1, JSON.stringify(stats));
check('stats: revenue 45', stats.revenue === 45, JSON.stringify(stats));
check('stats: commission 45', stats.commission === 45, JSON.stringify(stats));
check('stats: epc 45', stats.epc === 45, JSON.stringify(stats));
check('stats: cr 1', stats.cr === 1, JSON.stringify(stats));

const lookupNoAuth = await call(new Request(`https://go.affilayer.test/api/clicks/${clickId}`, { method: 'GET' }));
check('click lookup without token -> 401', lookupNoAuth.status === 401, `got ${lookupNoAuth.status}`);

const lookupRes = await call(new Request(`https://go.affilayer.test/api/clicks/${clickId}`, { method: 'GET', headers: auth }));
const lookup = await lookupRes.json();
check('click lookup finds conversion', lookup.conversion?.clickId === clickId, JSON.stringify(lookup));

const smartRes = await call(new Request('https://go.affilayer.test/s/abc', { method: 'GET' }));
check('smartlink -> 302', smartRes.status === 302, `got ${smartRes.status}`);
const smartLoc = smartRes.headers.get('Location') ?? '';
check('smartlink picks highest payout (demo-offer-1)', smartLoc.startsWith('https://example.com/finance-card?click_id=clk_'), smartLoc);

// R24: a paused offer never redirects, even though it exists.
const pausedRes = await call(new Request('https://go.affilayer.test/c/AFF1/demo-offer-3', { method: 'GET' }));
check('paused demo-offer-3 -> 404 (no 302)', pausedRes.status === 404, `got ${pausedRes.status}`);

// R22: separate OPERATOR_TOKEN. Once it is set, the POSTBACK_SECRET
// (the advertiser HMAC key) must no longer open the operator endpoints.
const OPERATOR = 'test-operator-token-do-not-use-in-production';
const envOp = { POSTBACK_SECRET: SECRET, OPERATOR_TOKEN: OPERATOR };
const callOp = (req) => worker.fetch(req, envOp);
const statsOldSecret = await callOp(new Request('https://go.affilayer.test/api/stats', { method: 'GET', headers: auth }));
check('stats with POSTBACK_SECRET bearer -> 401 once OPERATOR_TOKEN is set', statsOldSecret.status === 401, `got ${statsOldSecret.status}`);
const statsOp = await callOp(new Request('https://go.affilayer.test/api/stats', { method: 'GET', headers: { Authorization: `Bearer ${OPERATOR}` } }));
check('stats with OPERATOR_TOKEN bearer -> 200', statsOp.status === 200, `got ${statsOp.status}`);
const statsOpNoAuth = await callOp(new Request('https://go.affilayer.test/api/stats', { method: 'GET' }));
check('stats with OPERATOR_TOKEN set, no bearer -> 401', statsOpNoAuth.status === 401, `got ${statsOpNoAuth.status}`);

const healthRes = await call(new Request('https://go.affilayer.test/health', { method: 'GET' }));
check('health ok', healthRes.status === 200 && (await healthRes.json()).ok === true);

if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all smoke checks passed');
