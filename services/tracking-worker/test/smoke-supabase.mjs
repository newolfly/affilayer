// Smoke test for the tracking Worker in Supabase (durable) mode —
// runs the compiled handler in Node against a mock PostgREST server
// (node:http on 127.0.0.1, ephemeral port). No network, no wrangler,
// no real Supabase project needed.
//
// Why a second file: getStore() memoizes one store per isolate, so the
// demo-mode smoke.mjs (no SUPABASE_URL) and this file (Supabase env)
// cannot share a process.
//
// M-13 cases (unknown affiliate code -> 404, 0 rows): the mock mimics
// migration 022's tracking_record_click — it raises 'unknown
// affiliate_code' (400) before inserting for codes the mock DB does
// not know, 'affiliate not approved (status pending)' for the pending
// code, and records a row for the approved code and the 'smartlink'
// sentinel. The mock's recordedClicks array IS the rows: a 404 case
// must leave its length unchanged.
//
// Usage: npm run build && node test/smoke-supabase.mjs
// (also wired into the worker's `npm test` script).
import http from 'node:http';
import worker from '../dist/index.js';

const OFFER_ID = '11111111-1111-1111-1111-111111111111';
const UNKNOWN_OFFER_ID = '33333333-3333-3333-3333-333333333333';
const OFFER = {
  id: OFFER_ID,
  name: 'Real Test Offer',
  status: 'active',
  landing_url: 'https://example.com/real-offer',
  payout: 12,
  payout_model: 'CPA',
  currency: 'USD',
};

const recordedClicks = [];
let failures = 0;

// H-03 (026): approved payout request + mutable wallet row for the
// /api/payouts/execute allowlist cases. The mock DB has no CHECK to
// enforce, so the test sets payout_currency per case.
const PAYOUT_REQ_ID = '44444444-4444-4444-4444-444444444444';
const AFF_ID = '55555555-5555-5555-5555-555555555555';
const PAYOUT_REQUEST = {
  id: PAYOUT_REQ_ID,
  affiliate_id: AFF_ID,
  amount: 0.01,
  currency: 'USD',
  status: 'approved',
};
let mockWallet = {
  profile_id: AFF_ID,
  affiliate_code: 'AFF-APPROVED-001',
  payout_address: 'TSS9Dba7rjiYz7c8rtJPy74zMuF8aNFayJ',
  payout_currency: 'btc',
};

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.log(`FAIL ${name} ${extra}`);
  }
}

// Minimal PostgREST stand-in: only the RPCs the /c/ and /s/ handlers
// call in Supabase mode. The proof values are accepted unchecked —
// this mock tests the handler's mapping, not proof verification.
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const fn = url.pathname.split('/').pop() ?? '';
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    const params = raw ? JSON.parse(raw) : {};
    const send = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    // H-03 (026): auth + payout-execute mocks. requireAdmin verifies
    // the JWT via Auth and is_admin via RPC; handleExecutePayout reads
    // the payout request + wallet rows via PostgREST GETs.
    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      return send(200, { id: 'admin-00000000-0000-4000-8000-000000000001', email: 'admin@test.local' });
    }
    if (req.method === 'GET' && url.pathname === '/rest/v1/payout_requests') {
      return send(200, [PAYOUT_REQUEST]);
    }
    if (req.method === 'GET' && url.pathname === '/rest/v1/affiliate_profiles') {
      return send(200, [mockWallet]);
    }
    if (fn === 'is_admin') {
      return send(200, true);
    }
    if (fn === 'tracking_get_offer') {
      return send(200, params.p_offer_id === OFFER_ID ? OFFER : null);
    }
    if (fn === 'tracking_list_offers') {
      return send(200, [OFFER]);
    }
    if (fn === 'tracking_list_clicks') {
      return send(200, []);
    }
    if (fn === 'tracking_record_click') {
      const code = params.p_affiliate_code;
      if (code === 'AFF-APPROVED-001' || code === 'smartlink') {
        recordedClicks.push({
          click_id: params.p_click_id,
          affiliate_code: code,
          offer_id: params.p_offer_id,
          is_smartlink: params.p_is_smartlink === true,
        });
        return send(200, {
          id: '22222222-2222-2222-2222-222222222222',
          click_id: params.p_click_id,
          duplicate: false,
        });
      }
      if (code === 'AFF-PENDING-001') {
        // Migration 022: known code, status not approved.
        return send(400, {
          code: '42501',
          message: 'tracking_record_click: affiliate not approved (status pending)',
        });
      }
      // Migration 022: unknown code (demo codes are not DB affiliates
      // either) — raised BEFORE inserting, so no row exists.
      return send(400, {
        code: '23503',
        message: `tracking_record_click: unknown affiliate_code ${code}`,
      });
    }
    return send(404, { message: `mock: unknown rpc ${fn}` });
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const env = {
  POSTBACK_SECRET: 'test-secret-do-not-use-in-production',
  SUPABASE_URL: `http://127.0.0.1:${port}`,
  SUPABASE_ANON_KEY: 'test-anon-key',
  NP_WORKER_PROOF: 'test-proof',
  // H-03 cases need the payments module configured (else 503 before
  // the currency check). Fake key: the allowlist fires before any
  // NOWPayments call, so no network happens.
  NOWPAYMENTS_ENV: 'production',
  NOWPAYMENTS_API_KEY: 'test-api-key-do-not-use',
};
const call = (req) => worker.fetch(req, env);
const getClick = (path) => call(new Request(`https://go.affilayer.test${path}`, { method: 'GET' }));
const execPayout = (walletCurrency, walletAddress) => {
  mockWallet = { ...mockWallet, payout_currency: walletCurrency, payout_address: walletAddress };
  return call(new Request('https://go.affilayer.test/api/payouts/execute', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify({ payout_request_id: PAYOUT_REQ_ID }),
  }));
};

// M-13: unknown affiliate code + real offer -> 404, 0 rows recorded.
const unknownRes = await getClick(`/c/AFF-NOPE-XYZ99/${OFFER_ID}`);
const unknownBody = await unknownRes.json();
check('unknown affiliate code + real offer -> 404', unknownRes.status === 404, `got ${unknownRes.status}`);
check('unknown code 404 body names the affiliate', unknownBody.error === 'affiliate not found', JSON.stringify(unknownBody));
check('unknown code recorded 0 rows', recordedClicks.length === 0, `got ${recordedClicks.length}`);

// Known approved code -> 302, row recorded.
const apprRes = await getClick(`/c/AFF-APPROVED-001/${OFFER_ID}`);
const apprLoc = apprRes.headers.get('Location') ?? '';
check('known approved code -> 302', apprRes.status === 302, `got ${apprRes.status}`);
check('approved click redirects with click_id', apprLoc.startsWith('https://example.com/real-offer?click_id=clk_'), apprLoc);
check('approved click recorded 1 row', recordedClicks.length === 1, `got ${recordedClicks.length}`);
check('recorded row carries the code', recordedClicks[0]?.affiliate_code === 'AFF-APPROVED-001', JSON.stringify(recordedClicks[0]));

// Known pending code -> 403 (not 404), 0 further rows.
const pendRes = await getClick(`/c/AFF-PENDING-001/${OFFER_ID}`);
const pendBody = await pendRes.json();
check('known pending code -> 403 (not 404)', pendRes.status === 403, `got ${pendRes.status}`);
check('pending 403 body names approval', pendBody.error === 'affiliate not approved', JSON.stringify(pendBody));
check('pending code recorded 0 further rows', recordedClicks.length === 1, `got ${recordedClicks.length}`);

// 'smartlink' sentinel -> existing behaviour: 302, row recorded with
// affiliate_id NULL by design (mock stores the sentinel code).
const smartRes = await getClick(`/c/smartlink/${OFFER_ID}`);
const smartLoc = smartRes.headers.get('Location') ?? '';
check("smartlink sentinel direct click -> 302", smartRes.status === 302, `got ${smartRes.status}`);
check('smartlink click redirects with click_id', smartLoc.startsWith('https://example.com/real-offer?click_id=clk_'), smartLoc);
check('smartlink click recorded', recordedClicks.length === 2 && recordedClicks[1]?.affiliate_code === 'smartlink', JSON.stringify(recordedClicks));

// Bare SmartLink click (no affiliate_code -> 'smartlink') -> 302.
const bareRes = await getClick('/s/demo');
const bareLoc = bareRes.headers.get('Location') ?? '';
check('bare SmartLink click -> 302', bareRes.status === 302, `got ${bareRes.status}`);
check('bare SmartLink picks the real offer', bareLoc.startsWith('https://example.com/real-offer?click_id=clk_'), bareLoc);
check('bare SmartLink recorded as smartlink', recordedClicks.length === 3 && recordedClicks[2]?.affiliate_code === 'smartlink' && recordedClicks[2]?.is_smartlink === true, JSON.stringify(recordedClicks[2]));

// Demo codes are not DB affiliates: against a real offer they are
// unknown -> 404, not 302.
const demoRes = await getClick(`/c/AFF-DEMO-001/${OFFER_ID}`);
check('demo code against real offer -> 404', demoRes.status === 404, `got ${demoRes.status}`);
check('demo code recorded 0 further rows', recordedClicks.length === 3, `got ${recordedClicks.length}`);

// Sanity: the offer check still runs first — unknown offer -> 404
// 'offer not found' even with a known-good code.
const noOfferRes = await getClick(`/c/AFF-APPROVED-001/${UNKNOWN_OFFER_ID}`);
const noOfferBody = await noOfferRes.json();
check('unknown offer -> 404 offer not found', noOfferRes.status === 404 && noOfferBody.error === 'offer not found', `got ${noOfferRes.status} ${JSON.stringify(noOfferBody)}`);

// H-03 (026): payout currency allowlist in handleExecutePayout.
// Wallet currency 'btc' (with an address) -> 422, rejected before any
// money moves.
const btcRes = await execPayout('btc', 'TSS9Dba7rjiYz7c8rtJPy74zMuF8aNFayJ');
const btcBody = await btcRes.json();
check('btc wallet currency -> 422', btcRes.status === 422, `got ${btcRes.status} ${JSON.stringify(btcBody)}`);
check('btc 422 names the currency', typeof btcBody.error === 'string' && btcBody.error.includes('btc') && btcBody.error.includes('usdttrc20'), JSON.stringify(btcBody));

// Wallet currency 'usdttrc20' with no address -> passes the currency
// check and fails at the address check (422, different message).
// Proves the allowlist lets the good currency through.
const usdtRes = await execPayout('usdttrc20', null);
const usdtBody = await usdtRes.json();
check('usdttrc20 wallet passes currency check (fails at address)', usdtRes.status === 422 && usdtBody.error === 'affiliate has no payout wallet address on file', `got ${usdtRes.status} ${JSON.stringify(usdtBody)}`);

server.close();

if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all supabase-mode smoke checks passed');
