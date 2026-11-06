/**
 * @affilayer/shared — pure TypeScript types + helpers.
 * No Node-only dependencies: safe to import from the browser (web app)
 * and from Node services (tracking). No AI / "optimization" language.
 */

export type Role = 'super_admin' | 'network_manager' | 'advertiser' | 'affiliate';

export type OfferStatus = 'active' | 'paused' | 'expired';

export type ConversionStatus = 'pending' | 'approved' | 'rejected' | 'reversed';

export type PayoutModel = 'CPA' | 'CPL' | 'CPS' | 'CPC';

export interface Offer {
  id: string;
  name: string;
  /** Advertiser / campaign owner id (optional in demo data). */
  advertiserId?: string;
  campaignId?: string;
  /** Amount paid per conversion in `currency` (for CPS: the sale value). */
  payout: number;
  currency: string;
  payoutModel: PayoutModel;
  /** CPS only: commission rate in basis points (e.g. 1000 = 10%). */
  rateBps?: number;
  status: OfferStatus;
  landingUrl: string;
  /** Allowed countries (ISO codes). Undefined/empty = all countries. */
  countries?: string[];
  /** Allowed devices, e.g. ['desktop', 'mobile']. Undefined/empty = all. */
  devices?: string[];
  /** Allowed traffic sources, e.g. ['search', 'social']. Undefined/empty = all. */
  trafficSources?: string[];
  /** Max clicks (cap). Undefined = uncapped. */
  cap?: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  advertiserId: string;
  status: 'draft' | 'active' | 'paused' | 'ended';
  budget?: number;
  currency: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Click {
  id: string;
  /** Public click id, `clk_…` (see generateClickId). */
  clickId: string;
  affiliateCode: string;
  offerId: string;
  sub1?: string;
  sub2?: string;
  sub3?: string;
  sub4?: string;
  sub5?: string;
  source?: string;
  referrer?: string;
  ip?: string;
  userAgent?: string;
  country?: string;
  device?: string;
  smartlink?: boolean;
  smartlinkCode?: string;
  createdAt: string;
}

export interface Conversion {
  id: string;
  clickId: string;
  offerId: string;
  affiliateCode?: string;
  payout: number;
  currency: string;
  status: ConversionStatus;
  idempotencyKey: string;
  sub1?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommissionLedgerEntry {
  id: string;
  conversionId: string;
  affiliateCode: string;
  offerId: string;
  /** Commission amount owed to the affiliate (see computeCommission). */
  amount: number;
  currency: string;
  status: ConversionStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface PayoutRequest {
  id: string;
  affiliateCode: string;
  amount: number;
  currency: string;
  status: 'requested' | 'approved' | 'paid' | 'rejected';
  method?: string;
  createdAt: string;
  updatedAt?: string;
}

export type TrackingStep = 'click' | 'conversion' | 'postback' | 'payout';

export interface SmartLinkRule {
  id: string;
  code: string;
  name?: string;
  offerIds: string[];
  countries?: string[];
  devices?: string[];
  createdAt?: string;
}

export interface FraudSignal {
  /** Rule that fired. Signals only — never auto-reject on these. */
  type: 'duplicate_click_id' | 'high_click_rate_ip' | 'empty_user_agent';
  clickId?: string;
  ip?: string;
  /** How many clicks matched (for duplicate / high-rate rules). */
  count?: number;
  message: string;
  createdAt?: string;
}

/** Round money to 2 decimal places (avoids float artefacts like 0.30000000000000004). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Commission owed for one conversion.
 * CPA / CPL / CPC: the flat payout. CPS: payout * rateBps / 10000
 * (rateBps 1000 = 10%). CPS without a rate pays 0 — a rate is required.
 */
export function computeCommission(payout: number, model: PayoutModel, rateBps?: number): number {
  switch (model) {
    case 'CPS':
      return round2(payout * (rateBps ?? 0) / 10000);
    case 'CPA':
    case 'CPL':
    case 'CPC':
    default:
      return round2(payout);
  }
}

/**
 * Expand postback macros in a template URL / payload.
 * Macros: {click_id} {conversion_id} {payout} {currency} {status} {sub1}.
 * Unknown macros are left untouched; missing values expand to ''.
 */
export function expandPostbackMacros(template: string, vars: Record<string, string>): string {
  const known = new Set(['click_id', 'conversion_id', 'payout', 'currency', 'status', 'sub1']);
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => {
    if (key in vars) return vars[key];
    if (known.has(key.toLowerCase())) return '';
    return match; // unknown macro left untouched
  });
}

/** `clk_` + 24 hex chars, via globalThis.crypto (isomorphic, no Node-only dep). */
export function generateClickId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `clk_${hex}`;
}

export interface EligibilityContext {
  country?: string;
  device?: string;
  trafficSource?: string;
  /** Clicks recorded so far against the offer's cap (when known). */
  clicksSoFar?: number;
}

/**
 * Is an offer eligible for this visitor? Checks status, allowed
 * countries / devices / traffic sources, and the click cap when a
 * count is provided. Empty allow-lists mean "no restriction".
 */
export function isOfferEligible(offer: Offer, ctx: EligibilityContext): boolean {
  if (offer.status !== 'active') return false;
  if (ctx.country && offer.countries?.length && !offer.countries.includes(ctx.country)) return false;
  if (ctx.device && offer.devices?.length && !offer.devices.includes(ctx.device)) return false;
  if (ctx.trafficSource && offer.trafficSources?.length && !offer.trafficSources.includes(ctx.trafficSource)) return false;
  if (offer.cap !== undefined && ctx.clicksSoFar !== undefined && ctx.clicksSoFar >= offer.cap) return false;
  return true;
}

/**
 * Deterministic SmartLink pick: eligible offers sorted by payout desc,
 * then id asc; pick the first. Returns null when nothing is eligible.
 */
export function smartlinkPick(offers: Offer[], ctx: EligibilityContext): Offer | null {
  const eligible = offers.filter((o) => isOfferEligible(o, ctx));
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => (b.payout - a.payout) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return eligible[0];
}

export interface FraudClickInput {
  clickId?: string;
  id?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string | Date;
}

/**
 * Pure fraud-signal rules (signals only — never auto-reject):
 * - duplicate click_id (same id seen more than once)
 * - >10 clicks from the same IP within any 60s window
 * - empty user agent
 */
export function detectFraudSignals(clicks: FraudClickInput[]): FraudSignal[] {
  const signals: FraudSignal[] = [];

  // Duplicate click_id.
  const seen = new Map<string, number>();
  for (const c of clicks) {
    const id = c.clickId ?? c.id;
    if (!id) continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      signals.push({
        type: 'duplicate_click_id',
        clickId: id,
        count,
        message: `click_id ${id} seen ${count} times`,
      });
    }
  }

  // >10 clicks from the same IP within 60s (sliding window).
  const byIp = new Map<string, number[]>();
  for (const c of clicks) {
    if (!c.ip) continue;
    const t = new Date(c.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    const list = byIp.get(c.ip) ?? [];
    list.push(t);
    byIp.set(c.ip, list);
  }
  for (const [ip, times] of byIp) {
    times.sort((a, b) => a - b);
    let maxInWindow = 1;
    for (let i = 0; i < times.length; i++) {
      let j = i;
      while (j < times.length && times[j] - times[i] <= 60_000) j++;
      maxInWindow = Math.max(maxInWindow, j - i);
    }
    if (maxInWindow > 10) {
      signals.push({
        type: 'high_click_rate_ip',
        ip,
        count: maxInWindow,
        message: `${maxInWindow} clicks from ${ip} within 60s`,
      });
    }
  }

  // Empty user agent.
  for (const c of clicks) {
    if (!c.userAgent || c.userAgent.trim() === '') {
      const id = c.clickId ?? c.id;
      signals.push({
        type: 'empty_user_agent',
        clickId: id,
        ip: c.ip,
        message: 'click with empty user agent',
      });
    }
  }

  return signals;
}

/**
 * Allowed ledger / conversion status transitions only:
 * pending -> approved | rejected, approved -> reversed.
 * rejected and reversed are terminal.
 */
export function ledgerTransition(from: ConversionStatus, to: ConversionStatus): boolean {
  if (from === 'pending') return to === 'approved' || to === 'rejected';
  if (from === 'approved') return to === 'reversed';
  return false;
}
