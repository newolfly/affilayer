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
  /** Daily click/conversion cap (offer-level, separate from `cap`). */
  capDaily?: number | null;
  /** Total cap over the offer lifetime. */
  capTotal?: number | null;
  /** Business vertical, e.g. 'Finance'. */
  vertical?: string;
  /** Conversion definition, e.g. 'Signup', 'Purchase', 'Lead'. */
  conversionType?: string;
  /** Affiliates must apply and be approved before promoting. */
  approvalRequired?: boolean;
  /** Creative asset URLs. */
  creatives?: string[];
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
  description?: string;
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
  /** Supabase-mode owner id (conversions.affiliate_id). Used to filter a
   *  real affiliate's rows — real affiliates have no affiliate_code yet. */
  affiliateId?: string;
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
  /** Supabase-mode owner id (payout_requests.affiliate_id). */
  affiliateId?: string;
  amount: number;
  currency: string;
  status: 'requested' | 'approved' | 'paid' | 'rejected';
  method?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Advertiser deposit (migration 010, NOWPayments). Amounts in USD. */
export interface AdvertiserDeposit {
  id: string;
  advertiserId: string;
  amountUsd: number;
  currency: string;
  npPaymentId?: string;
  npInvoiceId?: string;
  npPayAddress?: string;
  npPayAmount?: number;
  npPayCurrency?: string;
  orderId: string;
  status: 'waiting' | 'finished' | 'partially_paid' | 'failed' | 'expired' | 'refunded';
  actuallyPaid?: number;
  outcomeAmount?: number;
  outcomeCurrency?: string;
  adminNote?: string;
  confirmedAt?: string;
  createdAt: string;
}

export interface AdvertiserBalance {
  advertiserId: string;
  currency: string;
  balance: number;
  updatedAt?: string;
}

/** NOWPayments payout batch for an approved payout request (migration 010). */
export interface NpPayout {
  id: string;
  batchId: string;
  withdrawalId?: string;
  payoutRequestId: string;
  affiliateId: string;
  address: string;
  currency: string;
  amount: number;
  fee?: number;
  status: 'created' | 'awaiting_2fa' | 'verified' | 'processing' | 'finished' | 'rejected' | 'failed';
  createdAt: string;
  updatedAt?: string;
}

/** Affiliate payout wallet (affiliate_profiles.payout_currency/address). */
export interface PayoutWallet {
  currency: string;
  address?: string;
}

/** A user profile (auth user + role + onboarding details). */
export interface Profile {
  id: string;
  email: string;
  role: Role;
  fullName?: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  affiliateCode?: string;
  trafficSource?: string;
  vertical?: string;
  geo?: string;
  volume?: string;
  paymentMethod?: string;
  paymentDetails?: string;
  company?: string;
  /** Human-review note from the last approve / reject / suspend decision. */
  reviewNote?: string;
  createdAt?: string;
}

/** A support ticket. */
export interface SupportTicket {
  id: string;
  userId?: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'closed';
  createdAt: string;
}

/** Aggregated reporting numbers (server-side aggregation in production). */
export interface Stats {
  clicks: number;
  uniqueClicks: number;
  conversions: number;
  approved: number;
  rejected: number;
  pending: number;
  revenue: number;
  commission: number;
  epc: number;
  cr: number;
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

/**
 * Demo-mode affiliate registry + SmartLink codes (M-08 / P1-12, Phase 1
 * item 1.4). Mirrors the demo profiles in apps/web/src/lib/demo-data.ts
 * (demo-aff-1 approved AFF-DEMO-001, demo-pend-1 pending AFF-DEMO-002) —
 * that file is the single source of truth for the demo catalogue, so keep
 * the codes and statuses in sync with it.
 *
 * Why here: the Worker (demo mode) and the legacy Fastify service both
 * serve demo offers from an in-memory store with no affiliate DB, so the
 * 022 approval gate (DB-side, real offers only) cannot see demo clicks.
 * This registry is the demo path's equivalent: a known demo affiliate
 * whose status is not 'approved' is blocked (403), exactly like the DB
 * gate. Unknown codes are NOT blocked — demo mode is a sandbox and dev /
 * smoke traffic uses arbitrary codes (AFF1); the DB gate still rejects
 * unknown codes for real offers (022).
 */
export interface DemoAffiliate {
  affiliateCode: string;
  status: 'approved' | 'pending' | 'suspended' | 'rejected';
}

export const DEMO_AFFILIATES: ReadonlyArray<DemoAffiliate> = [
  { affiliateCode: 'AFF-DEMO-001', status: 'approved' },
  { affiliateCode: 'AFF-DEMO-002', status: 'pending' },
];

/** Approval status of a known demo affiliate, or undefined when the code
 *  is not a demo affiliate (real codes, the 'smartlink' sentinel). */
export function demoAffiliateStatus(affiliateCode: string): DemoAffiliate['status'] | undefined {
  return DEMO_AFFILIATES.find((a) => a.affiliateCode === affiliateCode)?.status;
}

/**
 * The demo SmartLink codes. No SmartLink registry exists anywhere else in
 * the codebase — SmartLinkRule is a dead type, no UI creates codes, and no
 * smartlinks table exists — so demo mode defines its one canonical code
 * here. In demo mode /s/<code> 404s for anything else; in Supabase mode
 * there is no per-code registry (a smartlinks table is the P1-12
 * follow-up), so any code routes — but only to real offers, because demo
 * offers are stripped from SupabaseStore.
 */
export const DEMO_SMARTLINK_CODES: ReadonlyArray<string> = ['demo'];

export function isDemoSmartlinkCode(code: string): boolean {
  return DEMO_SMARTLINK_CODES.includes(code);
}

/**
 * Migration 022 error mapping (H-03 / M-13). The DB raises these as
 * PostgREST errors whose message survives inside the store's thrown
 * Error ("supabase rpc tracking_record_* failed: 400 {...\"message\":
 * \"tracking_record_click: affiliate not approved (status pending)\"...}"),
 * so match on the stable substrings from migration 022, not on the
 * HTTP status. Caps raise "... daily cap reached (N clicks today, cap
 * N)" / "... monthly cap reached (N clicks this month, cap N)".
 * Unknown affiliate codes raise "tracking_record_click: unknown
 * affiliate_code <code>" — the RPC raises BEFORE inserting, so no
 * click row exists, and the handler must answer 404 instead of
 * redirecting (M-13: the old code swallowed this error and 302'd
 * with 0 rows in Postgres). The three rejections are mutually
 * exclusive, and the RPC itself checks in this order — unknown code,
 * then approval status, then caps — so a pending code can never 404
 * and an unknown code can never 403.
 */
export function isUnknownAffiliateCodeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('unknown affiliate_code');
}

export function isAffiliateNotApprovedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('affiliate not approved');
}

export function isCapReachedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('cap reached');
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
 * (rateBps 1000 = 10%).
 *
 * M-05: CPS without a valid rate THROWS — it never silently pays $0.
 * A CPS offer with no rate is a data error (migration 025 also blocks
 * such offers at the DB layer, and the Worker rejects the conversion
 * before recording it), so every caller that reaches this point with
 * a rateless CPS offer has a bug to fix, not a $0 commission to pay.
 */
export function computeCommission(payout: number, model: PayoutModel, rateBps?: number): number {
  switch (model) {
    case 'CPS': {
      if (rateBps == null || !Number.isFinite(rateBps) || rateBps <= 0 || rateBps > 10000) {
        throw new Error('CPS commission requires a rateBps between 1 and 10000 (basis points)');
      }
      return round2(payout * rateBps / 10000);
    }
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
 * Values are URL-encoded, so a sub-parameter can never inject extra
 * query parameters into the postback URL.
 */
export function expandPostbackMacros(template: string, vars: Record<string, string>): string {
  const known = new Set(['click_id', 'conversion_id', 'payout', 'currency', 'status', 'sub1']);
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => {
    if (key in vars) return encodeURIComponent(vars[key]);
    if (known.has(key.toLowerCase())) return '';
    return match; // unknown macro left untouched
  });
}

/**
 * Device class parsed from a User-Agent string — the only trustworthy
 * device signal on the tracking edge (H-08: the `?device=` query param
 * is spoofable and must never feed eligibility). Returns undefined when
 * there is no UA to parse, so eligibility treats it as "no restriction"
 * rather than blocking the click. Tablet is checked first: iPadOS
 * UAs contain "Mobile", and Android tablets omit it.
 */
export function deviceFromUserAgent(ua?: string): 'desktop' | 'mobile' | 'tablet' | undefined {
  if (!ua || ua.trim() === '') return undefined;
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
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
 * Deterministic SmartLink ranking: eligible offers sorted by payout
 * desc, then id asc. The Worker walks this list so a cap-rejected
 * pick falls through to the next offer (H-06) instead of 409ing
 * the visitor.
 */
export function smartlinkRank(offers: Offer[], ctx: EligibilityContext): Offer[] {
  const eligible = offers.filter((o) => isOfferEligible(o, ctx));
  eligible.sort((a, b) => (b.payout - a.payout) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return eligible;
}

/**
 * Deterministic SmartLink pick: eligible offers sorted by payout desc,
 * then id asc; pick the first. Returns null when nothing is eligible.
 */
export function smartlinkPick(offers: Offer[], ctx: EligibilityContext): Offer | null {
  const ranked = smartlinkRank(offers, ctx);
  return ranked[0] ?? null;
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

export * from './demo-login.js';
