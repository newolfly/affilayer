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

const clickRes = await call(new Request('https://go.affilayer.test/c/AFF1/offer-a?sub1=hello', { method: 'GET' }));
check('click -> 302', clickRes.status === 302, `got ${clickRes.status}`);
const location = clickRes.headers.get('Location') ?? '';
check('click redirects to landing-a with click_id', location.startsWith('https://example.com/landing-a?click_id=clk_'), location);
const clickId = new URL(location).searchParams.get('click_id');

const body = JSON.stringify({
  click_id: clickId,
  offer_id: 'offer-a',
  payout: 10,
  currency: 'USD',
  idempotency_key: 'idem-smoke-1',
  sub1: 'hello',
});
const sig = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
const convRes = await call(
  new Request('https://go.affilayer.test/conversion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-affilayer-signature': sig },
    body,
  }),
);
const conv = await convRes.json();
check('conversion -> 201', convRes.status === 201, `got ${convRes.status} ${JSON.stringify(conv)}`);
check('conversion not duplicate', conv.duplicate === false);
check('commission is 10', conv.commission === 10, `got ${conv.commission}`);

const replayRes = await call(
  new Request('https://go.affilayer.test/conversion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-affilayer-signature': sig },
    body,
  }),
);
const replay = await replayRes.json();
check('replay -> 200 duplicate', replayRes.status === 200 && replay.duplicate === true, `got ${replayRes.status}`);

const badSigRes = await call(
  new Request('https://go.affilayer.test/conversion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-affilayer-signature': 'deadbeef' },
    body,
  }),
);
check('bad signature -> 400', badSigRes.status === 400, `got ${badSigRes.status}`);

const statsRes = await call(new Request('https://go.affilayer.test/api/stats', { method: 'GET' }));
const stats = await statsRes.json();
check('stats: 1 click', stats.clicks === 1, JSON.stringify(stats));
check('stats: 1 pending conversion', stats.pending === 1, JSON.stringify(stats));
check('stats: revenue 10', stats.revenue === 10, JSON.stringify(stats));
check('stats: commission 10', stats.commission === 10, JSON.stringify(stats));
check('stats: epc 10', stats.epc === 10, JSON.stringify(stats));
check('stats: cr 1', stats.cr === 1, JSON.stringify(stats));

const lookupRes = await call(new Request(`https://go.affilayer.test/api/clicks/${clickId}`, { method: 'GET' }));
const lookup = await lookupRes.json();
check('click lookup finds conversion', lookup.conversion?.clickId === clickId, JSON.stringify(lookup));

const smartRes = await call(new Request('https://go.affilayer.test/s/abc', { method: 'GET' }));
check('smartlink -> 302', smartRes.status === 302, `got ${smartRes.status}`);
const smartLoc = smartRes.headers.get('Location') ?? '';
check('smartlink picks highest payout (offer-b)', smartLoc.startsWith('https://example.com/landing-b?click_id=clk_'), smartLoc);

const healthRes = await call(new Request('https://go.affilayer.test/health', { method: 'GET' }));
check('health ok', healthRes.status === 200 && (await healthRes.json()).ok === true);

if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all smoke checks passed');
