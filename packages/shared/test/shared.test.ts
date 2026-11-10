import { describe, expect, it } from 'vitest';
import {
  computeCommission,
  detectFraudSignals,
  deviceFromUserAgent,
  expandPostbackMacros,
  generateClickId,
  isOfferEligible,
  ledgerTransition,
  smartlinkPick,
  smartlinkRank,
  type Offer,
} from '../src/index.js';

const baseOffer = (over: Partial<Offer> = {}): Offer => ({
  id: 'offer-a',
  name: 'Offer A',
  payout: 10,
  currency: 'USD',
  payoutModel: 'CPA',
  status: 'active',
  landingUrl: 'https://example.com/landing-a',
  ...over,
});

describe('computeCommission', () => {
  it('CPA/CPL/CPC pay the flat payout', () => {
    expect(computeCommission(10, 'CPA')).toBe(10);
    expect(computeCommission(2.5, 'CPL')).toBe(2.5);
    expect(computeCommission(0.5, 'CPC')).toBe(0.5);
  });
  it('CPS pays payout * rateBps / 10000', () => {
    expect(computeCommission(100, 'CPS', 1000)).toBe(10); // 10%
    expect(computeCommission(49.99, 'CPS', 2500)).toBe(12.5); // 25%, rounded
    expect(computeCommission(12, 'CPS', 1000)).toBe(1.2); // demo-offer-2: $12 sale at 10%
  });
  it('M-05: CPS without a valid rate throws instead of silently paying $0', () => {
    expect(() => computeCommission(100, 'CPS')).toThrow(/rateBps/);
    expect(() => computeCommission(100, 'CPS', 0)).toThrow(/rateBps/);
    expect(() => computeCommission(100, 'CPS', 10001)).toThrow(/rateBps/);
  });
});

describe('expandPostbackMacros', () => {
  it('expands all known macros and leaves unknown ones untouched', () => {
    const out = expandPostbackMacros(
      'https://x.example/pb?click={click_id}&conv={conversion_id}&amt={payout}&cur={currency}&st={status}&s1={sub1}&keep={nope}',
      { click_id: 'clk_1', conversion_id: 'conv_1', payout: '10', currency: 'USD', status: 'approved', sub1: 'abc' },
    );
    expect(out).toBe(
      'https://x.example/pb?click=clk_1&conv=conv_1&amt=10&cur=USD&st=approved&s1=abc&keep={nope}',
    );
  });
  it('missing values expand to empty string', () => {
    expect(expandPostbackMacros('a={sub1}&b={payout}', { payout: '5' })).toBe('a=&b=5');
  });
  it('URL-encodes values so a sub cannot inject query params', () => {
    expect(expandPostbackMacros('a={sub1}', { sub1: 'x&y=z' })).toBe('a=x%26y%3Dz');
  });
});

describe('generateClickId', () => {
  it('is clk_ + 24 hex chars and unique', () => {
    const a = generateClickId();
    const b = generateClickId();
    expect(a).toMatch(/^clk_[0-9a-f]{24}$/);
    expect(a).not.toBe(b);
  });
});

describe('deviceFromUserAgent', () => {
  it('parses mobile / tablet / desktop from real UA strings', () => {
    expect(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('mobile');
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe('mobile');
    // iPadOS UA contains "Mobile" — tablet check must win.
    expect(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('tablet');
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('tablet');
    expect(deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('desktop');
    expect(deviceFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')).toBe('desktop');
  });
  it('returns undefined with no UA so eligibility does not block', () => {
    expect(deviceFromUserAgent(undefined)).toBeUndefined();
    expect(deviceFromUserAgent('')).toBeUndefined();
  });
});

describe('isOfferEligible', () => {
  it('active offer with no restrictions is eligible', () => {
    expect(isOfferEligible(baseOffer(), { country: 'US', device: 'mobile' })).toBe(true);
  });
  it('paused / expired offers are not eligible', () => {
    expect(isOfferEligible(baseOffer({ status: 'paused' }), {})).toBe(false);
    expect(isOfferEligible(baseOffer({ status: 'expired' }), {})).toBe(false);
  });
  it('respects country / device / traffic-source allow-lists', () => {
    const o = baseOffer({ countries: ['US', 'GB'], devices: ['desktop'], trafficSources: ['search'] });
    expect(isOfferEligible(o, { country: 'US', device: 'desktop', trafficSource: 'search' })).toBe(true);
    expect(isOfferEligible(o, { country: 'BD', device: 'desktop' })).toBe(false);
    expect(isOfferEligible(o, { country: 'US', device: 'mobile' })).toBe(false);
    expect(isOfferEligible(o, { country: 'US', trafficSource: 'social' })).toBe(false);
  });
  it('respects the click cap when a count is provided', () => {
    const o = baseOffer({ cap: 5 });
    expect(isOfferEligible(o, { clicksSoFar: 4 })).toBe(true);
    expect(isOfferEligible(o, { clicksSoFar: 5 })).toBe(false);
    expect(isOfferEligible(o, {})).toBe(true); // no count -> cap not enforced
  });
});

describe('smartlinkPick', () => {
  it('picks highest payout, ties broken by id asc, deterministically', () => {
    const offers = [
      baseOffer({ id: 'offer-b', payout: 25 }),
      baseOffer({ id: 'offer-a', payout: 10 }),
      baseOffer({ id: 'offer-c', payout: 25 }),
      baseOffer({ id: 'offer-d', payout: 50, status: 'paused' }),
    ];
    const pick = smartlinkPick(offers, {});
    expect(pick?.id).toBe('offer-b'); // 25 beats 10; tie with offer-c broken by id asc
    expect(smartlinkPick(offers, {})?.id).toBe('offer-b'); // deterministic
    expect(smartlinkPick(offers, { country: 'ZZ' })).toBeDefined();
  });
  it('returns null when nothing is eligible', () => {
    expect(smartlinkPick([baseOffer({ status: 'paused' })], {})).toBeNull();
    expect(smartlinkPick([], {})).toBeNull();
  });
  it('filters by geo/device context', () => {
    const offers = [
      baseOffer({ id: 'us-only', payout: 50, countries: ['US'] }),
      baseOffer({ id: 'any', payout: 5 }),
    ];
    expect(smartlinkPick(offers, { country: 'BD' })?.id).toBe('any');
    expect(smartlinkPick(offers, { country: 'US' })?.id).toBe('us-only');
  });
});

describe('smartlinkRank', () => {
  it('returns the ranked eligible list, same order as smartlinkPick', () => {
    const offers = [
      baseOffer({ id: 'offer-b', payout: 25 }),
      baseOffer({ id: 'offer-a', payout: 10 }),
      baseOffer({ id: 'offer-c', payout: 25 }),
      baseOffer({ id: 'offer-d', payout: 50, status: 'paused' }),
    ];
    expect(smartlinkRank(offers, {}).map((o) => o.id)).toEqual(['offer-b', 'offer-c', 'offer-a']);
    expect(smartlinkPick(offers, {})?.id).toBe(smartlinkRank(offers, {})[0]?.id);
  });
  it('returns [] when nothing is eligible', () => {
    expect(smartlinkRank([baseOffer({ status: 'paused' })], {})).toEqual([]);
    expect(smartlinkRank([], {})).toEqual([]);
  });
});

describe('detectFraudSignals', () => {
  const now = new Date('2026-11-07T00:00:00Z');
  const click = (over: Record<string, unknown> = {}) => ({
    clickId: 'clk_1',
    ip: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    createdAt: now.toISOString(),
    ...over,
  });

  it('flags duplicate click_id', () => {
    const signals = detectFraudSignals([click(), click(), click({ clickId: 'clk_2' })]);
    const dup = signals.filter((s) => s.type === 'duplicate_click_id');
    expect(dup).toHaveLength(1);
    expect(dup[0].clickId).toBe('clk_1');
    expect(dup[0].count).toBe(2);
  });
  it('flags >10 clicks from same IP within 60s, not 10 spread out', () => {
    const burst = Array.from({ length: 11 }, (_, i) =>
      click({ clickId: `clk_b${i}`, createdAt: new Date(now.getTime() + i * 1000).toISOString() }),
    );
    expect(detectFraudSignals(burst).some((s) => s.type === 'high_click_rate_ip')).toBe(true);

    const spread = Array.from({ length: 11 }, (_, i) =>
      click({ clickId: `clk_s${i}`, createdAt: new Date(now.getTime() + i * 60_000).toISOString() }),
    );
    expect(detectFraudSignals(spread).some((s) => s.type === 'high_click_rate_ip')).toBe(false);

    const ten = burst.slice(0, 10);
    expect(detectFraudSignals(ten).some((s) => s.type === 'high_click_rate_ip')).toBe(false);
  });
  it('flags empty user agent', () => {
    const signals = detectFraudSignals([click({ userAgent: '' }), click({ userAgent: 'ok' })]);
    const empty = signals.filter((s) => s.type === 'empty_user_agent');
    expect(empty).toHaveLength(1);
    expect(empty[0].clickId).toBe('clk_1');
  });
  it('clean traffic produces no signals', () => {
    expect(detectFraudSignals([click(), click({ clickId: 'clk_2', ip: '5.6.7.8' })])).toHaveLength(0);
  });
});

describe('ledgerTransition', () => {
  it('allows only pending->approved|rejected and approved->reversed', () => {
    expect(ledgerTransition('pending', 'approved')).toBe(true);
    expect(ledgerTransition('pending', 'rejected')).toBe(true);
    expect(ledgerTransition('pending', 'pending')).toBe(false);
    expect(ledgerTransition('pending', 'reversed')).toBe(false);
    expect(ledgerTransition('approved', 'reversed')).toBe(true);
    expect(ledgerTransition('approved', 'pending')).toBe(false);
    expect(ledgerTransition('approved', 'rejected')).toBe(false);
    expect(ledgerTransition('rejected', 'approved')).toBe(false);
    expect(ledgerTransition('reversed', 'approved')).toBe(false);
  });
});
