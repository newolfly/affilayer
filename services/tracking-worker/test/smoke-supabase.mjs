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

// CPAlead receiver cases: a CPAlead-shaped offer (signed _src_sig
// link on a mirror domain, affiliate payout 2.93 vs feed 3.90) plus
// mock conversion/ledger state for the postback path.
const CPALEAD_OFFER_ID = '77777777-7777-7777-7777-777777777777';
const CPALEAD_OFFER = {
  id: CPALEAD_OFFER_ID,
  name: 'CPAlead Test Offer (CPAlead 5547320)',
  status: 'active',
  landing_url: 'https://www.qckclk.com/view.php?id=5547320&pub=3370722&_src=api&_src_sig=deadbeefcafe',
  payout: 2.93,
  payout_model: 'CPA',
  currency: 'USD',
};
const mockConversions = [];
const mockLedger = [];

// H-06: mutable mock catalogue + click history so the SmartLink cap
// cases can stage a capped top-pick offer. CAPPED beats OFFER on
// payout (20 > 12), so it wins the pick whenever it is eligible.
const CAPPED_OFFER_ID = '66666666-6666-6666-6666-666666666666';
const CAPPED_OFFER = {
  id: CAPPED_OFFER_ID,
  name: 'Capped Test Offer',
  status: 'active',
  landing_url: 'https://example.com/capped-offer',
  payout: 20,
  payout_model: 'CPA',
  currency: 'USD',
  daily_cap: 1,
  monthly_cap: null,
};
let mockOffers = [OFFER];
let mockClickRows = [];
// Offer ids the mock record RPC rejects with 'cap reached', mimicking
// migration 022's daily/monthly cap raise (checked before insert).
const capRejectOfferIds = new Set();
const clickRow = (offerId, createdAt) => ({
  click_id: `clk_mock_${offerId.slice(0, 8)}_${Date.parse(createdAt)}`,
  affiliate_code: 'smartlink',
  offer_id: offerId,
  is_smartlink: true,
  created_at: createdAt,
});

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
    // P1-12 (027): smartlinks registry. Only the seeded 'demo' code
    // is valid; anything else returns no rows -> 404.
    if (req.method === 'GET' && url.pathname === '/rest/v1/smartlinks') {
      const code = url.searchParams.get('code') ?? '';
      if (code === 'eq.demo') return send(200, [{ code: 'demo', offer_id: null }]);
      return send(200, []);
    }
    if (fn === 'is_admin') {
      return send(200, true);
    }
    if (fn === 'tracking_get_offer') {
      if (params.p_offer_id === OFFER_ID) return send(200, OFFER);
      if (params.p_offer_id === CPALEAD_OFFER_ID) return send(200, CPALEAD_OFFER);
      return send(200, null);
    }
    if (fn === 'tracking_get_click') {
      const row = recordedClicks.find((c) => c.click_id === params.p_click_id);
      if (!row) return send(200, null);
      return send(200, {
        id: '22222222-2222-2222-2222-222222222222',
        click_id: row.click_id,
        affiliate_code: row.affiliate_code,
        offer_id: row.offer_id,
        is_smartlink: row.is_smartlink === true,
        created_at: new Date().toISOString(),
      });
    }
    if (fn === 'tracking_find_conversion') {
      let row = null;
      if (params.p_idempotency_key) {
        row = mockConversions.find((c) => c.idempotency_key === params.p_idempotency_key) ?? null;
      } else if (params.p_click_id && params.p_offer_id) {
        row = mockConversions.find((c) => c.click_id === params.p_click_id && c.offer_id === params.p_offer_id) ?? null;
      } else if (params.p_id) {
        row = mockConversions.find((c) => c.id === params.p_id) ?? null;
      }
      return send(200, row);
    }
    if (fn === 'tracking_record_conversion') {
      if (params.p_affiliate_code === 'AFF-PENDING-001') {
        return send(400, {
          code: '42501',
          message: 'tracking_record_conversion: affiliate not approved (status pending)',
        });
      }
      const conv = {
        id: params.p_conversion_id,
        click_id: params.p_click_id,
        offer_id: params.p_offer_id,
        affiliate_code: params.p_affiliate_code,
        payout: params.p_payout,
        currency: params.p_currency,
        status: 'pending',
        idempotency_key: params.p_idempotency_key,
        sub1: params.p_sub1 ?? null,
        created_at: new Date().toISOString(),
      };
      mockConversions.push(conv);
      return send(200, { id: conv.id, conversion_id: conv.id, duplicate: false });
    }
    if (fn === 'tracking_resolve_affiliate') {
      const known = ['AFF-APPROVED-001', 'AFF-HOUSE', 'smartlink'];
      return send(200, known.includes(params.p_affiliate_code) ? { profile_id: AFF_ID } : null);
    }
    if (fn === 'tracking_record_ledger_entry') {
      const entry = {
        id: `ledger-${mockLedger.length + 1}`,
        conversion_id: params.p_conversion_id,
        affiliate_id: params.p_affiliate_id,
        offer_id: params.p_offer_id,
        amount: params.p_amount,
        currency: params.p_currency,
      };
      mockLedger.push(entry);
      return send(200, { id: entry.id, conversion_id: entry.conversion_id, duplicate: false });
    }
    if (fn === 'tracking_list_conversions') {
      return send(200, mockConversions.map((c) => {
        const led = mockLedger.find((e) => e.conversion_id === c.id);
        return {
          ...c,
          ledger_id: led?.id ?? null,
          ledger_amount: led?.amount ?? null,
          ledger_status: led ? 'pending' : null,
        };
      }));
    }
    if (fn === 'tracking_list_offers') {
      return send(200, mockOffers);
    }
    if (fn === 'tracking_list_clicks') {
      return send(200, mockClickRows);
    }
    if (fn === 'tracking_record_click') {
      // H-06: cap rejection fires before the affiliate branches,
      // like migration 022's raise-before-insert. The message must
      // contain 'cap reached' for isCapReachedError to match.
      if (capRejectOfferIds.has(params.p_offer_id)) {
        return send(400, {
          code: '23514',
          message: `tracking_record_click: offer ${params.p_offer_id} daily cap reached (1 clicks today, cap 1)`,
        });
      }
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

// P1-12 (027): unknown SmartLink code -> 404, not 302.
const unknownSmartRes = await getClick('/s/nope123xyz');
const unknownSmartBody = await unknownSmartRes.json();
check('unknown SmartLink code -> 404', unknownSmartRes.status === 404 && unknownSmartBody.error === 'smartlink not found', `got ${unknownSmartRes.status} ${JSON.stringify(unknownSmartBody)}`);

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

// H-06: a capped top-pick must never brick SmartLink traffic.
// CAPPED_OFFER out-pays OFFER (20 > 12), so it wins the pick
// whenever the edge filter lets it through.
const smartlink = () => getClick('/s/demo');
const rowsBefore = () => recordedClicks.length;

// A. Edge filter: capped offer with 1 click today (daily_cap 1) is
// filtered out before the pick -> 302 to the second offer.
mockOffers = [CAPPED_OFFER, OFFER];
mockClickRows = [clickRow(CAPPED_OFFER_ID, new Date().toISOString())];
capRejectOfferIds.clear();
let h06aBefore = rowsBefore();
const h06aRes = await smartlink();
const h06aLoc = h06aRes.headers.get('Location') ?? '';
check('H-06 edge: capped top-pick filtered -> 302', h06aRes.status === 302, `got ${h06aRes.status}`);
check('H-06 edge: redirects to the second offer', h06aLoc.startsWith('https://example.com/real-offer?click_id=clk_'), h06aLoc);
check('H-06 edge: capped attempt recorded 0 rows, second offer 1', rowsBefore() === h06aBefore + 1 && recordedClicks[recordedClicks.length - 1]?.offer_id === OFFER_ID, JSON.stringify(recordedClicks.slice(-1)));

// B. Fallback: edge counts stale (0 clicks seen) so the capped pick
// is attempted, but the record RPC 409s -> falls through to the
// second offer instead of 409ing the visitor.
mockClickRows = [];
capRejectOfferIds.add(CAPPED_OFFER_ID);
let h06bBefore = rowsBefore();
const h06bRes = await smartlink();
const h06bLoc = h06bRes.headers.get('Location') ?? '';
check('H-06 fallback: stale edge count + RPC cap reject -> 302', h06bRes.status === 302, `got ${h06bRes.status}`);
check('H-06 fallback: redirects to the second offer', h06bLoc.startsWith('https://example.com/real-offer?click_id=clk_'), h06bLoc);
check('H-06 fallback: exactly 1 row, for the second offer', rowsBefore() === h06bBefore + 1 && recordedClicks[recordedClicks.length - 1]?.offer_id === OFFER_ID, JSON.stringify(recordedClicks.slice(-1)));

// C. Every eligible offer cap-rejected -> 409 (the caps really are
// hit), 0 rows recorded.
capRejectOfferIds.add(OFFER_ID);
let h06cBefore = rowsBefore();
const h06cRes = await smartlink();
const h06cBody = await h06cRes.json();
check('H-06 all capped -> 409', h06cRes.status === 409, `got ${h06cRes.status}`);
check('H-06 all capped body names the cap', h06cBody.error === 'offer cap reached', JSON.stringify(h06cBody));
check('H-06 all capped recorded 0 rows', rowsBefore() === h06cBefore, `got ${rowsBefore() - h06cBefore}`);
capRejectOfferIds.clear();

// D. Window semantics (daily): a click from yesterday does NOT count
// against today's daily_cap -> capped offer still picked -> 302.
const yesterday = new Date(Date.now() - 86400000).toISOString();
mockClickRows = [clickRow(CAPPED_OFFER_ID, yesterday)];
const h06dRes = await smartlink();
const h06dLoc = h06dRes.headers.get('Location') ?? '';
check('H-06 daily window: yesterday click ignored -> 302 to capped', h06dRes.status === 302, `got ${h06dRes.status}`);
check('H-06 daily window: redirects to the capped offer', h06dLoc.startsWith('https://example.com/capped-offer?click_id=clk_'), h06dLoc);

// E. Window semantics (monthly): a click 40 days ago does NOT count
// against this month's monthly_cap -> capped offer still picked.
const CAPPED_MONTHLY_OFFER = { ...CAPPED_OFFER, daily_cap: null, monthly_cap: 1 };
const fortyDaysAgo = new Date(Date.now() - 40 * 86400000).toISOString();
mockOffers = [CAPPED_MONTHLY_OFFER, OFFER];
mockClickRows = [clickRow(CAPPED_OFFER_ID, fortyDaysAgo)];
const h06eRes = await smartlink();
const h06eLoc = h06eRes.headers.get('Location') ?? '';
check('H-06 monthly window: old click ignored -> 302 to capped', h06eRes.status === 302, `got ${h06eRes.status}`);
check('H-06 monthly window: redirects to the capped offer', h06eLoc.startsWith('https://example.com/capped-offer?click_id=clk_'), h06eLoc);

// E2. Monthly positive: a click this month against monthly_cap 1
// filters the capped offer out -> 302 to the second offer.
mockClickRows = [clickRow(CAPPED_OFFER_ID, new Date().toISOString())];
const h06e2Res = await smartlink();
const h06e2Loc = h06e2Res.headers.get('Location') ?? '';
check('H-06 monthly filter: click this month -> 302 to second', h06e2Res.status === 302, `got ${h06e2Res.status}`);
check('H-06 monthly filter: redirects to the second offer', h06e2Loc.startsWith('https://example.com/real-offer?click_id=clk_'), h06e2Loc);

// ---------------------------------------------------------------------------
// CPAlead postback receiver: sub-ID appending + S2S postback mapping.
// ---------------------------------------------------------------------------
const SECRET = 'test-secret-do-not-use-in-production';
const postback = (qs, headers = {}) =>
  call(new Request(`https://go.affilayer.test/api/postbacks/cpalead?${qs}`, { method: 'GET', headers }));

// Click chain: a CPAlead offer's redirect carries click_id AND the
// CPAlead sub-IDs (subid = click id, subid2 = affiliate code).
const cpaClickRes = await getClick(`/c/AFF-APPROVED-001/${CPALEAD_OFFER_ID}`);
const cpaLoc = cpaClickRes.headers.get('Location') ?? '';
const cpaClickId = new URL(cpaLoc).searchParams.get('click_id') ?? '';
check('CPAlead offer click -> 302', cpaClickRes.status === 302, `got ${cpaClickRes.status}`);
check('CPAlead redirect keeps the exact signed link', cpaLoc.startsWith('https://www.qckclk.com/view.php?id=5547320&pub=3370722&_src=api&_src_sig=deadbeefcafe&click_id=clk_'), cpaLoc);
check('CPAlead redirect appends subid = click id', new URL(cpaLoc).searchParams.get('subid') === cpaClickId && cpaClickId.startsWith('clk_'), cpaLoc);
check('CPAlead redirect appends subid2 = affiliate code', new URL(cpaLoc).searchParams.get('subid2') === 'AFF-APPROVED-001', cpaLoc);

// A non-CPAlead offer's redirect is unchanged: click_id only, no subid.
const plainClickRes = await getClick(`/c/AFF-APPROVED-001/${OFFER_ID}`);
const plainLoc = plainClickRes.headers.get('Location') ?? '';
check('plain offer redirect has click_id and NO subid', plainLoc.includes('click_id=clk_') && new URL(plainLoc).searchParams.get('subid') === null && new URL(plainLoc).searchParams.get('subid2') === null, plainLoc);

// Caller validation: no secret + not the relay IP -> 403.
const noAuthRes = await postback(`subid=${cpaClickId}&lead_id=lead-x&payout=3.90`);
check('postback without secret/IP -> 403', noAuthRes.status === 403, `got ${noAuthRes.status}`);

// Wrong secret -> 403.
const badSecretRes = await postback(`subid=${cpaClickId}&lead_id=lead-x&payout=3.90&secret=wrong`);
check('postback with wrong secret -> 403', badSecretRes.status === 403, `got ${badSecretRes.status}`);

// Valid secret, unknown click -> 404.
const unknownClickRes = await postback(`subid=clk_nope&lead_id=lead-x&payout=3.90&secret=${SECRET}`);
check('postback with unknown click -> 404', unknownClickRes.status === 404, `got ${unknownClickRes.status}`);

// Valid secret, missing lead_id -> 400.
const noLeadRes = await postback(`subid=${cpaClickId}&payout=3.90&secret=${SECRET}`);
check('postback without lead_id -> 400', noLeadRes.status === 400, `got ${noLeadRes.status}`);

// Happy path via the relay IP (no secret): records at the AFFILIATE
// rate (2.93), not the reported feed payout (3.90).
const pbRes = await postback(
  `subid=${cpaClickId}&lead_id=lead-001&payout=3.90&campaign_id=5547320`,
  { 'cf-connecting-ip': '34.69.179.33' },
);
const pbBody = await pbRes.json();
check('postback from relay IP -> 200', pbRes.status === 200, `got ${pbRes.status} ${JSON.stringify(pbBody)}`);
check('postback records the affiliate payout, not the feed payout', pbBody.ok === true && pbBody.duplicate === false && pbBody.payout === 2.93, JSON.stringify(pbBody));
check('conversion stored at affiliate rate with cpalead dedupe key', mockConversions.length === 1 && mockConversions[0]?.payout === 2.93 && mockConversions[0]?.idempotency_key === 'cpalead:lead-001' && mockConversions[0]?.status === 'pending', JSON.stringify(mockConversions));
check('ledger row created at the affiliate rate', mockLedger.length === 1 && mockLedger[0]?.amount === 2.93 && mockLedger[0]?.conversion_id === mockConversions[0]?.id, JSON.stringify(mockLedger));

// Replay of the same lead_id (CPAlead retry) -> 200 duplicate,
// nothing recorded twice.
const replayRes = await postback(`subid=${cpaClickId}&lead_id=lead-001&payout=3.90&secret=${SECRET}`);
const replayBody = await replayRes.json();
check('replayed lead_id -> 200 duplicate', replayRes.status === 200 && replayBody.ok === true && replayBody.duplicate === true, `got ${replayRes.status} ${JSON.stringify(replayBody)}`);
check('replay recorded no second conversion or ledger row', mockConversions.length === 1 && mockLedger.length === 1, `conv ${mockConversions.length} ledger ${mockLedger.length}`);

server.close();

if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all supabase-mode smoke checks passed');
