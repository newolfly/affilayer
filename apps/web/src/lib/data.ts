// Data layer — Supabase when configured, DEMO MODE otherwise (CONTRACT.md).
// In Supabase mode we only SELECT user-visible tables with the anon key;
// clicks / conversions / commission_ledger writes are service-role only
// (see 002_rls.sql) and never happen from this browser code.
// In demo mode reads come from the local demo store (lib/demo-store.ts),
// so demo writes (offer create, payout requests, admin actions) show up
// everywhere immediately. Database rows are snake_case; the mappers below
// convert them to the shared camelCase domain types.
import { supabase, isSupabaseConfigured } from './supabase'
import { getDemoState } from './demo-store'
import type { Campaign, Click, Conversion, Offer, PayoutRequest, Profile, Stats, SupportTicket } from './types'

export { isSupabaseConfigured }
export const isDemoMode = !isSupabaseConfigured

export interface ReportFilters {
  from?: string
  to?: string
  offerId?: string
  country?: string
  device?: string
  source?: string
  affiliateCode?: string
}

function inRange(iso: string, f: ReportFilters): boolean {
  if (f.from && iso.slice(0, 10) < f.from) return false
  if (f.to && iso.slice(0, 10) > f.to) return false
  return true
}

type Row = Record<string, unknown>
const str = (r: Row, k: string): string | undefined => (typeof r[k] === 'string' ? (r[k] as string) : undefined)
const num = (r: Row, k: string): number | undefined => (typeof r[k] === 'number' ? (r[k] as number) : undefined)
const arr = (r: Row, k: string): string[] | undefined => (Array.isArray(r[k]) ? (r[k] as string[]) : undefined)

export function mapOffer(r: Row): Offer {
  return {
    id: String(r.id), name: String(r.name ?? ''), advertiserId: str(r, 'advertiser_id'),
    campaignId: str(r, 'campaign_id'), payout: num(r, 'payout') ?? 0, currency: String(r.currency ?? 'USD'),
    payoutModel: (r.payout_model as Offer['payoutModel']) ?? 'CPA', status: (r.status as Offer['status']) ?? 'active',
    landingUrl: String(r.landing_url ?? ''), countries: arr(r, 'countries'), devices: arr(r, 'devices'),
    trafficSources: arr(r, 'traffic_sources'), capDaily: num(r, 'cap_daily') ?? null,
    capTotal: num(r, 'cap_total') ?? null, vertical: str(r, 'vertical'),
    conversionType: str(r, 'conversion_type'), approvalRequired: Boolean(r.approval_required),
    creatives: arr(r, 'creatives'), description: str(r, 'description'), createdAt: str(r, 'created_at'),
  }
}

export function mapCampaign(r: Row): Campaign {
  return {
    id: String(r.id), name: String(r.name ?? ''), advertiserId: String(r.advertiser_id ?? ''),
    status: (r.status as Campaign['status']) ?? 'draft', budget: num(r, 'budget'),
    currency: String(r.currency ?? 'USD'), description: str(r, 'description'),
    startDate: str(r, 'start_date'), endDate: str(r, 'end_date'), createdAt: str(r, 'created_at'),
  }
}

export function mapClick(r: Row): Click {
  return {
    id: String(r.id), clickId: String(r.click_id ?? r.id), affiliateCode: String(r.affiliate_code ?? ''),
    offerId: String(r.offer_id ?? ''), sub1: str(r, 'sub1'), sub2: str(r, 'sub2'), sub3: str(r, 'sub3'),
    sub4: str(r, 'sub4'), sub5: str(r, 'sub5'), source: str(r, 'source'), referrer: str(r, 'referrer'),
    ip: str(r, 'ip'), userAgent: str(r, 'user_agent'), country: str(r, 'country'), device: str(r, 'device'),
    createdAt: String(r.created_at ?? ''),
  }
}

export function mapConversion(r: Row): Conversion {
  return {
    id: String(r.id), clickId: String(r.click_id ?? ''), offerId: String(r.offer_id ?? ''),
    affiliateCode: str(r, 'affiliate_code'), affiliateId: str(r, 'affiliate_id'), payout: num(r, 'payout') ?? 0, currency: String(r.currency ?? 'USD'),
    status: (r.status as Conversion['status']) ?? 'pending', idempotencyKey: String(r.idempotency_key ?? ''),
    sub1: str(r, 'sub1'), createdAt: String(r.created_at ?? ''),
  }
}

export function mapProfile(r: Row): Profile {
  return {
    id: String(r.id), email: String(r.email ?? ''), role: (r.role as Profile['role']) ?? 'affiliate',
    fullName: str(r, 'full_name'), status: (r.status as Profile['status']) ?? 'pending',
    affiliateCode: str(r, 'affiliate_code'), trafficSource: str(r, 'traffic_source'),
    vertical: str(r, 'vertical'), geo: str(r, 'geo'), volume: str(r, 'volume'),
    paymentMethod: str(r, 'payment_method'), paymentDetails: str(r, 'payment_details'),
    company: str(r, 'company'), createdAt: str(r, 'created_at'),
  }
}

export function mapPayout(r: Row): PayoutRequest {
  // The database status is 'pending'; the UI calls that state 'requested'.
  // Without this translation the admin action buttons (which check for
  // 'requested') never render for a live payout request.
  const dbStatus = String(r.status ?? 'pending')
  return {
    id: String(r.id), affiliateCode: String(r.affiliate_code ?? ''), affiliateId: str(r, 'affiliate_id'), amount: num(r, 'amount') ?? 0,
    currency: String(r.currency ?? 'USD'), status: (dbStatus === 'pending' ? 'requested' : dbStatus) as PayoutRequest['status'],
    method: str(r, 'payment_method') ?? str(r, 'method'), createdAt: String(r.created_at ?? ''),
  }
}

export function mapTicket(r: Row): SupportTicket {
  return {
    id: String(r.id), userId: str(r, 'user_id'), subject: String(r.subject ?? ''),
    message: String(r.message ?? ''), status: (r.status as SupportTicket['status']) ?? 'open',
    createdAt: String(r.created_at ?? ''),
  }
}

export async function getOffers(): Promise<Offer[]> {
  if (!isSupabaseConfigured || !supabase) return getDemoState().offers
  const { data, error } = await supabase.from('offers').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapOffer)
}

export async function getOffer(id: string): Promise<Offer | undefined> {
  const offers = await getOffers()
  return offers.find((o) => o.id === id)
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (!isSupabaseConfigured || !supabase) return getDemoState().campaigns
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapCampaign)
}

export async function getClicks(filters: ReportFilters = {}): Promise<Click[]> {
  if (!isSupabaseConfigured || !supabase) {
    return getDemoState().clicks.filter(
      (c) =>
        inRange(c.createdAt, filters) &&
        (!filters.offerId || c.offerId === filters.offerId) &&
        (!filters.country || c.country === filters.country) &&
        (!filters.device || c.device === filters.device) &&
        (!filters.source || c.source === filters.source) &&
        (!filters.affiliateCode || c.affiliateCode === filters.affiliateCode),
    )
  }
  let q = supabase.from('clicks').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  if (filters.country) q = q.eq('country', filters.country)
  if (filters.device) q = q.eq('device', filters.device)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Row[]).map(mapClick).filter((c) => inRange(c.createdAt, filters))
}

export async function getConversions(filters: ReportFilters = {}): Promise<Conversion[]> {
  if (!isSupabaseConfigured || !supabase) {
    return getDemoState().conversions.filter(
      (c) =>
        inRange(c.createdAt, filters) &&
        (!filters.offerId || c.offerId === filters.offerId) &&
        (!filters.affiliateCode || c.affiliateCode === filters.affiliateCode),
    )
  }
  let q = supabase.from('conversions').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Row[]).map(mapConversion).filter((c) => inRange(c.createdAt, filters))
}

export async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return getDemoState().profiles
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapProfile)
}

export async function getPayouts(): Promise<PayoutRequest[]> {
  if (!isSupabaseConfigured || !supabase) return getDemoState().payouts
  const { data, error } = await supabase.from('payout_requests').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  // payout_requests carries only affiliate_id — resolve a display name for
  // the admin table from affiliate_profiles (code) or profiles (email).
  const rows = (data as Row[]).map(mapPayout)
  const { data: codes } = await supabase.from('affiliate_profiles').select('profile_id, affiliate_code')
  const { data: profs } = await supabase.from('profiles').select('id, email')
  const codeById = new Map(((codes as Row[] | null) ?? []).map((c) => [String(c.profile_id), String(c.affiliate_code ?? '')]))
  const emailById = new Map(((profs as Row[] | null) ?? []).map((p) => [String(p.id), String(p.email ?? '')]))
  for (const p of rows) {
    if (!p.affiliateCode && p.affiliateId) p.affiliateCode = codeById.get(p.affiliateId) ?? emailById.get(p.affiliateId) ?? ''
  }
  return rows
}

/** Admin financial actions (H-5). In Supabase mode these call the
 *  SECURITY DEFINER RPCs (003 approve/reject_conversion, 008 payout
 *  RPCs), which enforce the admin gate and the ledger state machine.
 *  Demo mode keeps the old local behaviour — the callers branch. */

export async function decideConversion(id: string, to: 'approved' | 'rejected', actorId: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.rpc(to === 'approved' ? 'approve_conversion' : 'reject_conversion', {
    p_conversion_id: id, p_actor: actorId,
  })
  return error ? { error: error.message } : {}
}

export async function decidePayout(
  id: string,
  to: 'approved' | 'rejected' | 'paid',
  actorId: string,
  opts?: { reason?: string; provider?: string; transactionRef?: string },
): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const fn = to === 'approved' ? 'approve_payout_request' : to === 'rejected' ? 'reject_payout_request' : 'complete_payout_request'
  const params: Record<string, unknown> = { p_request_id: id, p_actor: actorId }
  if (to === 'rejected' && opts?.reason) params.p_reason = opts.reason
  if (to === 'paid') {
    if (opts?.provider) params.p_provider = opts.provider
    if (opts?.transactionRef) params.p_transaction_ref = opts.transactionRef
  }
  const { error } = await supabase.rpc(fn, params)
  return error ? { error: error.message } : {}
}

/** Affiliate payout request. RLS allows an affiliate to INSERT their own
 *  row (affiliate_id = auth.uid()); the amount/status review is the
 *  admin's job via decidePayout. */
export async function requestPayout(amount: number, currency: string, method: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { error } = await supabase.from('payout_requests').insert({
    affiliate_id: user.id, amount, currency, payment_method: method,
  })
  return error ? { error: error.message } : {}
}

/** The affiliate's saved payment method (affiliate_profiles), if any. */
export async function getMyAffiliateProfile(): Promise<{ paymentMethod?: string }> {
  if (!isSupabaseConfigured || !supabase) return {}
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data } = await supabase.from('affiliate_profiles').select('payment_method').eq('profile_id', user.id).maybeSingle()
  return { paymentMethod: (data as Row | null)?.payment_method as string | undefined }
}

export async function getTickets(): Promise<SupportTicket[]> {
  if (!isSupabaseConfigured || !supabase) return getDemoState().tickets
  const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapTicket)
}

/** File a support ticket for the signed-in user (Supabase mode only).
 *  The public contact form uses this — a message must reach the team,
 *  never just localStorage. RLS allows the insert when profile_id is
 *  the caller's own id. */
export async function createTicket(subject: string, description: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Tickets are not available in demo mode.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to send a message.' }
  const { error } = await supabase.from('support_tickets').insert({
    profile_id: user.id,
    subject,
    description,
    category: 'contact',
  })
  return error ? { error: error.message } : {}
}

export function computeStats(clicks: Click[], conversions: Conversion[]): Stats {
  const approved = conversions.filter((c) => c.status === 'approved')
  const revenue = approved.reduce((s, c) => s + c.payout, 0)
  return {
    clicks: clicks.length,
    uniqueClicks: new Set(clicks.map((c) => c.clickId)).size,
    conversions: conversions.length,
    approved: approved.length,
    rejected: conversions.filter((c) => c.status === 'rejected').length,
    pending: conversions.filter((c) => c.status === 'pending').length,
    revenue,
    commission: revenue,
    epc: clicks.length ? revenue / clicks.length : 0,
    cr: clicks.length ? conversions.length / clicks.length : 0,
  }
}

/** Stats: prefer the tracking service /api/stats when reachable, else compute locally. */
export async function getStats(filters: ReportFilters = {}): Promise<Stats> {
  const clicks = await getClicks(filters)
  const conversions = await getConversions(filters)
  return computeStats(clicks, conversions)
}
