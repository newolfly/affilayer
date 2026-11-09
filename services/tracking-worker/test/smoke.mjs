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

const smartRes = await call(new Request('https://go.affilayer.test/s/demo', { method: 'GET' }));
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

// --- H-07/P0-5: security headers on every response -----------------------
import {
  ensureLedgerEntry,
  isAffiliateNotApprovedError,
  isCapReachedError,
  isUnknownAffiliateCodeError,
} from '../dist/index.js';
import { DEMO_OFFERS, InMemoryStore } from '../dist/store.js';

const SEC_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
const checkHeaders = (name, res) => {
  for (const [k, v] of Object.entries(SEC_HEADERS)) {
    check(`${name} header ${k}`, res.headers.get(k) === v, `got ${res.headers.get(k)}`);
  }
};

const health2 = await call(new Request('https://go.affilayer.test/health', { method: 'GET' }));
checkHeaders('health', health2);
const click302 = await call(new Request('https://go.affilayer.test/c/AFF1/demo-offer-1', { method: 'GET' }));
check('headers: 302 keeps Location', click302.status === 302 && (click302.headers.get('Location') ?? '').includes('click_id=clk_'), `got ${click302.status}`);
checkHeaders('302 redirect', click302);
const err404 = await call(new Request('https://go.affilayer.test/c/AFF1/demo-offer-3', { method: 'GET' }));
checkHeaders('404 error', err404);

// --- H-08/P1-6: geo/device enforcement on direct links --------------------
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const getClick = (path, headers = {}) => call(new Request(`https://go.affilayer.test${path}`, { method: 'GET', headers }));

// demo-offer-1 allows countries US/GB, devices desktop/mobile.
const geoDe = await getClick('/c/AFF1/demo-offer-1', { 'cf-ipcountry': 'DE' });
check('geo-blocked direct click (DE vs US/GB) -> 404', geoDe.status === 404, `got ${geoDe.status}`);
const geoUs = await getClick('/c/AFF1/demo-offer-1', { 'cf-ipcountry': 'US' });
check('geo-allowed direct click (US) -> 302', geoUs.status === 302, `got ${geoUs.status}`);
const geoSpoofRescue = await getClick('/c/AFF1/demo-offer-1?country=US', { 'cf-ipcountry': 'DE' });
check('?country=US cannot rescue a DE visitor -> 404', geoSpoofRescue.status === 404, `got ${geoSpoofRescue.status}`);
const geoSpoofBlock = await getClick('/c/AFF1/demo-offer-1?country=FR', { 'cf-ipcountry': 'US' });
check('?country=FR cannot block a US visitor -> 302', geoSpoofBlock.status === 302, `got ${geoSpoofBlock.status}`);
const devTablet = await getClick('/c/AFF1/demo-offer-1', { 'cf-ipcountry': 'US', 'user-agent': IPAD_UA });
check('tablet UA blocked on desktop/mobile-only offer -> 404', devTablet.status === 404, `got ${devTablet.status}`);
const devTabletSpoof = await getClick('/c/AFF1/demo-offer-1?device=desktop', { 'cf-ipcountry': 'US', 'user-agent': IPAD_UA });
check('?device=desktop cannot rescue a tablet UA -> 404', devTabletSpoof.status === 404, `got ${devTabletSpoof.status}`);
const devMobile = await getClick('/c/AFF1/demo-offer-1', { 'cf-ipcountry': 'US', 'user-agent': IPHONE_UA });
check('iPhone UA -> 302', devMobile.status === 302, `got ${devMobile.status}`);
// The recorded click carries the header-derived country/device, not the query.
const mobileClickId = new URL(devMobile.headers.get('Location') ?? '').searchParams.get('click_id');
const mobileLookup = await call(new Request(`https://go.affilayer.test/api/clicks/${mobileClickId}`, { method: 'GET', headers: auth }));
const mobileClick = await mobileLookup.json();
check('recorded click country=device from headers', mobileClick.click?.country === 'US' && mobileClick.click?.device === 'mobile', JSON.stringify(mobileClick.click));

// --- H-08/P1-6: SmartLink pick uses headers, never ?country= --------------
const smartSpoof = await getClick('/s/demo?country=FR');
const smartSpoofLoc = smartSpoof.headers.get('Location') ?? '';
check('smartlink ?country=FR ignored -> still picks demo-offer-1', smartSpoof.status === 302 && smartSpoofLoc.startsWith('https://example.com/finance-card?click_id=clk_'), `got ${smartSpoof.status} ${smartSpoofLoc}`);
const smartFr = await getClick('/s/demo', { 'cf-ipcountry': 'FR' });
check('smartlink cf-ipcountry FR -> 404 (no offer covers FR)', smartFr.status === 404, `got ${smartFr.status}`);
const smartFrSpoof = await getClick('/s/demo?country=US', { 'cf-ipcountry': 'FR' });
check('smartlink ?country=US cannot rescue FR visitor -> 404', smartFrSpoof.status === 404, `got ${smartFrSpoof.status}`);
const smartCa = await getClick('/s/demo', { 'cf-ipcountry': 'CA' });
const smartCaLoc = smartCa.headers.get('Location') ?? '';
check('smartlink cf-ipcountry CA -> demo-offer-2 (shop)', smartCa.status === 302 && smartCaLoc.startsWith('https://example.com/shop?click_id=clk_'), `got ${smartCa.status} ${smartCaLoc}`);
const smartTablet = await getClick('/s/demo', { 'cf-ipcountry': 'US', 'user-agent': IPAD_UA });
const smartTabletLoc = smartTablet.headers.get('Location') ?? '';
check('smartlink tablet UA (US) -> demo-offer-2 (tablet allowed)', smartTablet.status === 302 && smartTabletLoc.startsWith('https://example.com/shop?click_id=clk_'), `got ${smartTablet.status} ${smartTabletLoc}`);

// --- M-08: SmartLink codes validated; demo offers never serve real
// --- traffic; pending-affiliate demo clicks gated (403) ------------------
const smartUnknown = await getClick('/s/NOPE', { 'cf-ipcountry': 'US' });
check('unknown SmartLink code -> 404 (was 302 to example.com)', smartUnknown.status === 404, `got ${smartUnknown.status}`);
const smartDemo = await getClick('/s/demo', { 'cf-ipcountry': 'US' });
const smartDemoLoc = smartDemo.headers.get('Location') ?? '';
check('known demo SmartLink code -> 302', smartDemo.status === 302 && smartDemoLoc.startsWith('https://example.com/finance-card?click_id=clk_'), `got ${smartDemo.status} ${smartDemoLoc}`);
const pendClick = await getClick('/c/AFF-DEMO-002/demo-offer-1', { 'cf-ipcountry': 'US' });
check('pending-affiliate demo click -> 403', pendClick.status === 403, `got ${pendClick.status}`);
const pendSmart = await getClick('/s/demo?affiliate_code=AFF-DEMO-002', { 'cf-ipcountry': 'US' });
check('pending-affiliate SmartLink demo click -> 403', pendSmart.status === 403, `got ${pendSmart.status}`);
const apprClick = await getClick('/c/AFF-DEMO-001/demo-offer-1', { 'cf-ipcountry': 'US' });
check('approved demo-affiliate click -> 302', apprClick.status === 302, `got ${apprClick.status} ${apprClick.headers.get('Location') ?? ''}`);
const apprSmart = await getClick('/s/demo?affiliate_code=AFF-DEMO-001', { 'cf-ipcountry': 'US' });
check('approved demo-affiliate SmartLink click -> 302', apprSmart.status === 302, `got ${apprSmart.status}`);

// --- M-13: unknown affiliate code -> 404 (Supabase mode) -----------------
// The 404 fires where the 022 gate exists: the DB lookup in
// tracking_record_click raises before inserting, and recordClickOrReject
// maps it to 404. Demo mode has no affiliate DB — the in-memory store
// accepts any code (AFF1 clicks above) — so demo mode keeps its sandbox
// behaviour, and the unknown-code 404 is covered handler-level by
// test/smoke-supabase.mjs (mock PostgREST, real UUID offer, 0 rows).
// Matcher unit tests for the exact 022 strings:
const unknownErr = (code) => new Error(`supabase rpc tracking_record_click failed: 400 {"code":"23503","message":"tracking_record_click: unknown affiliate_code ${code}"}`);
check('matcher: unknown affiliate code', isUnknownAffiliateCodeError(unknownErr('AFF-NOPE-XYZ99')) === true);
check('matcher: unknown code is not not-approved', isAffiliateNotApprovedError(unknownErr('AFF-NOPE-XYZ99')) === false);
check('matcher: not-approved is not unknown code', isUnknownAffiliateCodeError(new Error('supabase rpc tracking_record_click failed: 400 {"message":"tracking_record_click: affiliate not approved (status pending)"}')) === false);
check('matcher: cap is not unknown code', isUnknownAffiliateCodeError(new Error('supabase rpc tracking_record_click failed: 400 {"message":"tracking_record_click: offer 00000000-0000-0000-0000-000000000000 daily cap reached (10 clicks today, cap 10)"}')) === false);
check('matcher: unrelated error is not unknown code', isUnknownAffiliateCodeError(new Error('supabase rpc tracking_record_click failed: 500 boom')) === false);
// The 'smartlink' sentinel keeps its existing behaviour in demo mode:
// bare SmartLink clicks (and an explicit ?affiliate_code=smartlink)
// record with affiliate_id NULL and 302.
const smartSentinel = await getClick('/s/demo?affiliate_code=smartlink', { 'cf-ipcountry': 'US' });
const smartSentinelLoc = smartSentinel.headers.get('Location') ?? '';
check('smartlink sentinel SmartLink click -> 302', smartSentinel.status === 302 && smartSentinelLoc.startsWith('https://example.com/finance-card?click_id=clk_'), `got ${smartSentinel.status} ${smartSentinelLoc}`);
// Demo-mode sandbox, pinned: an arbitrary code still 302s here because
// there is no affiliate DB to reject it — the 404 is a Supabase-mode
// behaviour (see smoke-supabase.mjs).
const demoUnknown = await getClick('/c/AFF-NOPE-XYZ99/demo-offer-1', { 'cf-ipcountry': 'US' });
check('unknown code in demo mode -> 302 (sandbox, no affiliate DB)', demoUnknown.status === 302, `got ${demoUnknown.status}`);

// --- M-14: duplicate-path ledger backfill (unit level) ---------------------
// A conversion written straight to the store has no ledger row —
// exactly the crash-between-writes state. ensureLedgerEntry must
// create it once, and a second call must not duplicate it.
const unitStore = new InMemoryStore();
const unitConv = {
  id: 'conv-unit-1', clickId: 'clk_unit1', offerId: 'demo-offer-1', affiliateCode: 'AFF1',
  payout: 45, currency: 'USD', status: 'pending', idempotencyKey: 'idem-unit-1',
  createdAt: new Date().toISOString(),
};
await unitStore.recordConversion(unitConv);
check('backfill fixture: no ledger row yet', (await unitStore.listLedgerEntries()).length === 0);
check('backfill creates the ledger row', (await ensureLedgerEntry(unitStore, unitConv, DEMO_OFFERS[0])) === true);
const unitLedger = await unitStore.listLedgerEntries();
check('backfill ledger amount is 45', unitLedger.length === 1 && unitLedger[0].amount === 45 && unitLedger[0].conversionId === 'conv-unit-1', JSON.stringify(unitLedger));
check('backfill is idempotent (no second row)', (await ensureLedgerEntry(unitStore, unitConv, DEMO_OFFERS[0])) === true && (await unitStore.listLedgerEntries()).length === 1);

// --- M-08 fold-in: the backfill is status-guarded ------------------------
// Replaying a reversed/rejected conversion must not mint a ledger row.
const deadStore = new InMemoryStore();
for (const status of ['rejected', 'reversed']) {
  const deadConv = {
    id: `conv-dead-${status}`, clickId: `clk_dead_${status}`, offerId: 'demo-offer-1', affiliateCode: 'AFF1',
    payout: 45, currency: 'USD', status, idempotencyKey: `idem-dead-${status}`,
    createdAt: new Date().toISOString(),
  };
  await deadStore.recordConversion(deadConv);
  check(`backfill skips ${status} conversion`, (await ensureLedgerEntry(deadStore, deadConv, DEMO_OFFERS[0])) === false);
}
check('no ledger rows minted for dead conversions', (await deadStore.listLedgerEntries()).length === 0);
// An approved conversion whose row was lost still backfills.
const apprConv = {
  id: 'conv-dead-approved', clickId: 'clk_dead_approved', offerId: 'demo-offer-1', affiliateCode: 'AFF1',
  payout: 45, currency: 'USD', status: 'approved', idempotencyKey: 'idem-dead-approved',
  createdAt: new Date().toISOString(),
};
await deadStore.recordConversion(apprConv);
check('backfill still covers approved conversions', (await ensureLedgerEntry(deadStore, apprConv, DEMO_OFFERS[0])) === true);
check('approved backfill minted exactly one row', (await deadStore.listLedgerEntries()).length === 1);

// --- H-03: 022 error mapping matches the live migration strings -----------
const rpcErr = (msg) => new Error(`supabase rpc tracking_record_conversion failed: 400 {"code":"42501","message":"${msg}"}`);
check('matcher: conversion not-approved', isAffiliateNotApprovedError(rpcErr('tracking_record_conversion: affiliate not approved (status pending)')) === true);
check('matcher: click not-approved', isAffiliateNotApprovedError(new Error('supabase rpc tracking_record_click failed: 400 {"message":"tracking_record_click: affiliate not approved (status suspended)"}')) === true);
check('matcher: daily cap', isCapReachedError(rpcErr('tracking_record_click: offer 00000000-0000-0000-0000-000000000000 daily cap reached (10 clicks today, cap 10)')) === true);
check('matcher: monthly cap', isCapReachedError(rpcErr('tracking_record_click: offer 00000000-0000-0000-0000-000000000000 monthly cap reached (300 clicks this month, cap 300)')) === true);
check('matcher: unrelated error is neither', isAffiliateNotApprovedError(new Error('supabase rpc tracking_record_click failed: 500 boom')) === false && isCapReachedError(new Error('supabase rpc tracking_record_click failed: 500 boom')) === false);

// --- M-14 end-to-end: replaying the original conversion must not double-count
const replay2 = await postConversion({
  click_id: clickId, offer_id: 'demo-offer-1', payout: 45, currency: 'USD', idempotency_key: 'idem-smoke-1', sub1: 'hello',
});
check('replay after backfill work -> still 200 duplicate', replay2.status === 200 && (await replay2.json()).duplicate === true, `got ${replay2.status}`);
const stats2Res = await call(new Request('https://go.affilayer.test/api/stats', { method: 'GET', headers: auth }));
const stats2 = await stats2Res.json();
check('stats after replays: still 1 conversion, commission 45 (no double ledger)', stats2.conversions === 1 && stats2.commission === 45 && stats2.revenue === 45, JSON.stringify(stats2));

if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all smoke checks passed');
