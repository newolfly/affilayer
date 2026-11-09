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
import { computeCommission } from '@affilayer/shared'
import type { AdvertiserBalance, AdvertiserDeposit, Campaign, Click, CommissionLedgerEntry, Conversion, NpPayout, Offer, PayoutRequest, PayoutWallet, Profile, Stats, SupportTicket } from './types'

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
    // M-05: rate_bps was dropped here, so the UI showed a CPS offer's
    // SALE value ($12) as if it were the payout — the real commission
    // is payout * rateBps / 10000 ($1.20 at 10%). Mapped through now.
    rateBps: num(r, 'rate_bps') ?? undefined,
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

export interface CreateOfferInput {
  name: string
  description: string
  vertical: string
  countries: string[]
  devices: string[]
  trafficSources: string[]
  conversionType: string
  payoutModel: Offer['payoutModel']
  payout: number
  /** CPS only: commission rate in basis points (1000 = 10%). */
  rateBps?: number | null
  currency: string
  capDaily: number | null
  capTotal: number | null
  landingUrl: string
  creatives: string[]
  approvalRequired: boolean
}

/** Create a real offer (H-02). In Supabase mode this inserts into
 *  `offers` with the caller's own identity as owner:
 *  - organization_id comes from the caller's own `profiles` row
 *    (readable via `profiles_select_own_or_admin`); the insert RLS
 *    policy `offers_insert_member` admits exactly org members/admins,
 *    so a caller with no organization cannot insert at all.
 *  - advertiser_id is the caller's user id.
 *  - campaign_id is left NULL: campaigns are optional (the column is
 *    nullable, the campaigns table is empty) — no campaign UI is needed
 *    to list an offer.
 *  App-level gate on top of RLS: only advertisers (or admins) whose
 *  account is approved may list an offer, so a pending account cannot
 *  put a live offer in the marketplace (same lesson as H-03).
 *  Returns the inserted offer mapped to the domain type, or an error
 *  the caller must show instead of claiming success. Demo mode never
 *  reaches this function — the caller keeps the demo-store path. */
export async function createOffer(input: CreateOfferInput): Promise<{ offer?: Offer; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const currency = input.currency.trim().toUpperCase()
  if (currency.length !== 3) return { error: 'Currency must be a 3-letter code (e.g. USD).' }
  if (!Number.isFinite(input.payout) || input.payout < 0) return { error: 'Payout must be a number of 0 or more.' }
  if (input.payoutModel === 'CPS' && (input.rateBps == null || input.rateBps <= 0 || input.rateBps > 10000)) {
    return { error: 'Commission rate must be greater than 0 and at most 100%.' }
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('organization_id, role, status').eq('id', user.id).maybeSingle()
  if (profileError) return { error: profileError.message }
  const row = profile as Row | null
  const organizationId = row?.organization_id as string | undefined
  const role = row?.role as string | undefined
  const status = row?.status as string | undefined
  if (!organizationId) return { error: 'Your account has no organization yet. Ask an admin to assign your account to an organization before creating offers.' }
  const isAdmin = role === 'super_admin' || role === 'network_manager'
  if (role !== 'advertiser' && !isAdmin) return { error: 'Only advertiser accounts can create offers.' }
  if (!isAdmin && status !== 'approved') return { error: 'Your advertiser account is awaiting approval. You can create offers once an admin approves it.' }
  const { data, error } = await supabase.from('offers').insert({
    organization_id: organizationId,
    advertiser_id: user.id,
    campaign_id: null,
    name: input.name,
    description: input.description || null,
    vertical: input.vertical || null,
    countries: input.countries,
    devices: input.devices,
    traffic_sources: input.trafficSources,
    conversion_type: input.conversionType || 'purchase',
    payout_model: input.payoutModel,
    payout: input.payout,
    rate_bps: input.payoutModel === 'CPS' ? (input.rateBps ?? null) : null,
    currency,
    daily_cap: input.capDaily,
    monthly_cap: input.capTotal,
    landing_url: input.landingUrl,
    creatives: input.creatives,
    approval_required: input.approvalRequired,
    status: 'active',
  }).select('*').single()
  if (error || !data) return { error: error?.message ?? 'Offer insert failed.' }
  const offer = mapOffer(data as Row)
  // NOTE: no client-side log_audit here — migration 021 restricts
  // log_audit to admins or worker-proof, and offer creation is done by
  // advertisers, so the call would always 401. Server-side offer audit
  // logging (e.g. an INSERT trigger) is the follow-up if that row is wanted.
  return { offer }
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

export function mapLedgerEntry(r: Row): CommissionLedgerEntry {
  return {
    id: String(r.id), conversionId: String(r.conversion_id ?? ''),
    // The ledger row carries affiliate_id, not a code; callers that need
    // a display code resolve it through the conversion (see AdminLedger).
    affiliateCode: '',
    offerId: String(r.offer_id ?? ''), amount: num(r, 'amount') ?? 0,
    currency: String(r.currency ?? 'USD'),
    status: (r.status as CommissionLedgerEntry['status']) ?? 'pending',
    createdAt: String(r.created_at ?? ''),
  }
}

/** Commission ledger rows (Supabase mode only — demo mode has no ledger;
 *  callers fall back to per-offer rates there). RLS scopes the rows to
 *  the caller's own / org / admin rows; a select error yields [] and the
 *  caller falls back, so stats never break on a ledger read failure. */
export async function getLedgerEntries(filters: ReportFilters = {}): Promise<CommissionLedgerEntry[]> {
  if (!isSupabaseConfigured || !supabase) return []
  let q = supabase.from('commission_ledger').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Row[]).map(mapLedgerEntry)
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

/** Admin: approve / reject / suspend / reinstate an affiliate account.
 *  In Supabase mode this updates `profiles.status` directly. That is safe
 *  because the table's UPDATE policy (`profiles_update_own_or_admin`)
 *  admits admins, and the `profiles_enforce_role_status` trigger lets
 *  admins set status while forcing any non-admin's row back to
 *  affiliate / pending / not_started — so a non-admin calling this can
 *  never escalate or change anyone's status. The decision is also
 *  recorded in `audit_logs` via the `log_audit` RPC (admin JWT); a
 *  logging failure never blocks the decision itself. Demo mode keeps the
 *  old local behaviour — the callers branch. */
export async function decideProfile(
  id: string,
  to: 'approved' | 'rejected' | 'suspended',
  actorId: string,
  detail: string,
): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.from('profiles').update({ status: to }).eq('id', id)
  if (error) return { error: error.message }
  // Best-effort audit trail; the decision already landed.
  const action = to === 'suspended' ? 'account.suspend' : to === 'approved' ? 'kyc.approved' : 'kyc.rejected'
  await supabase.rpc('log_audit', {
    p_actor_id: actorId,
    p_action: action,
    p_entity_type: 'profile',
    p_entity_id: id,
    p_details: { detail },
  })
  return {}
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

/** Admin: release an approved payout's reservation (ledger payable ->
 *  approved, request back to pending) — e.g. after a failed crypto
 *  payout, so it can be retried or rejected. */
export async function releasePayoutReservation(id: string, actorId: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.rpc('np_release_payout_reservation', {
    p_request_id: id, p_actor: actorId,
  })
  return error ? { error: error.message } : {}
}

/** Admin: credit a partially-paid deposit by a USD amount read off the
 *  NOWPayments dashboard (no invented rate). */
export async function creditDepositManually(id: string, amountUsd: number, actorId: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.rpc('np_admin_credit_deposit', {
    p_deposit_id: id, p_amount_usd: amountUsd, p_actor: actorId,
  })
  return error ? { error: error.message } : {}
}
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
export async function getMyAffiliateProfile(): Promise<{ paymentMethod?: string; payoutWallet?: PayoutWallet }> {
  if (!isSupabaseConfigured || !supabase) return {}
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data } = await supabase.from('affiliate_profiles').select('payment_method, payout_currency, payout_address').eq('profile_id', user.id).maybeSingle()
  const row = data as Row | null
  return {
    paymentMethod: row?.payment_method as string | undefined,
    payoutWallet: row ? {
      currency: String(row.payout_currency ?? 'usdttrc20'),
      address: row.payout_address as string | undefined,
    } : undefined,
  }
}

/** Save the affiliate's payout wallet (USDT TRC20 address). The caller
 *  validates the address with NOWPayments first (lib/payments); this only
 *  writes the row the affiliate owns (RLS: update own). */
export async function savePayoutWallet(wallet: PayoutWallet): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { error } = await supabase.from('affiliate_profiles').update({
    payout_currency: wallet.currency,
    payout_address: wallet.address ?? null,
  }).eq('profile_id', user.id)
  return error ? { error: error.message } : {}
}

export function mapDeposit(r: Row): AdvertiserDeposit {
  return {
    id: String(r.id), advertiserId: String(r.advertiser_id ?? ''), amountUsd: num(r, 'amount_usd') ?? 0,
    currency: String(r.currency ?? 'USD'), npPaymentId: str(r, 'np_payment_id'), npInvoiceId: str(r, 'np_invoice_id'),
    npPayAddress: str(r, 'np_pay_address'), npPayAmount: num(r, 'np_pay_amount'), npPayCurrency: str(r, 'np_pay_currency'),
    orderId: String(r.order_id ?? ''), status: (r.status as AdvertiserDeposit['status']) ?? 'waiting',
    actuallyPaid: num(r, 'actually_paid'), outcomeAmount: num(r, 'outcome_amount'), outcomeCurrency: str(r, 'outcome_currency'),
    adminNote: str(r, 'admin_note'), confirmedAt: str(r, 'confirmed_at'), createdAt: String(r.created_at ?? ''),
  }
}

export function mapNpPayout(r: Row): NpPayout {
  return {
    id: String(r.id), batchId: String(r.batch_id ?? ''), withdrawalId: str(r, 'withdrawal_id'),
    payoutRequestId: String(r.payout_request_id ?? ''), affiliateId: String(r.affiliate_id ?? ''),
    address: String(r.address ?? ''), currency: String(r.currency ?? 'usdttrc20'),
    amount: num(r, 'amount') ?? 0, fee: num(r, 'fee'),
    status: (r.status as NpPayout['status']) ?? 'created', createdAt: String(r.created_at ?? ''),
  }
}

/** The signed-in advertiser's deposits (RLS: own rows). */
export async function getMyDeposits(): Promise<AdvertiserDeposit[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('advertiser_deposits').select('*').eq('advertiser_id', user.id).order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapDeposit)
}

/** The signed-in advertiser's balances (RLS: own rows). */
export async function getMyAdvertiserBalances(): Promise<AdvertiserBalance[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('advertiser_balances').select('*').eq('advertiser_id', user.id)
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    advertiserId: String(r.advertiser_id ?? ''), currency: String(r.currency ?? 'USD'),
    balance: num(r, 'balance') ?? 0, updatedAt: str(r, 'updated_at'),
  }))
}

/** NOWPayments payout batches (admin sees all via RLS; affiliates see
 *  their own). Used by the admin payouts screen. */
export async function getNpPayouts(): Promise<NpPayout[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('np_payouts').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapNpPayout)
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

/** Rate in basis points as a display percentage: 1000 -> "10", 1250 -> "12.5". */
function ratePct(rateBps: number): string {
  const p = rateBps / 100
  return Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0$/, '')
}

/** Commission for one offer (what the affiliate earns per conversion),
 *  or null when it cannot be calculated — a CPS offer with no rate.
 *  Never the sale value: computeCommission throws for rateless CPS. */
export function offerCommission(offer: Offer): number | null {
  try {
    return computeCommission(offer.payout, offer.payoutModel, offer.rateBps)
  } catch {
    return null
  }
}

/** How an offer pays, as shown in lists and tables. M-05: for CPS this
 *  is the percentage of the sale plus the dollar commission — never the
 *  bare sale amount. E.g. demo-offer-2: "CPS — 10% of sale ($1.20)". */
export function offerPayoutLabel(offer: Offer): string {
  if (offer.payoutModel === 'CPS') {
    if (offer.rateBps == null) return 'CPS — rate missing'
    const commission = offerCommission(offer)
    return `CPS — ${ratePct(offer.rateBps)}% of sale (${commission == null ? '—' : `$${commission.toFixed(2)}`})`
  }
  return `${offer.payoutModel} $${offer.payout.toFixed(2)} ${offer.currency}`
}

/** Commission line for an offer detail view. */
export function offerCommissionLabel(offer: Offer): string {
  const commission = offerCommission(offer)
  if (commission == null) return 'Rate missing — commission cannot be calculated'
  return offer.payoutModel === 'CPS'
    ? `$${commission.toFixed(2)} per sale (${ratePct(offer.rateBps ?? 0)}% of $${offer.payout.toFixed(2)} order)`
    : `$${commission.toFixed(2)} per conversion`
}

/** Commission owed for one conversion. M-05: the ledger is the money
 *  truth — when a ledger row exists for the conversion, its live rows
 *  win (reversed / rejected rows pay $0, and a fully-reversed
 *  conversion is $0 rather than the offer rate resurrected by the
 *  fallback). Only with NO ledger row at all (demo mode, legacy rows)
 *  do we compute from the offer's rate — so a CPS conversion counts
 *  its commission ($1.20), never its sale value ($12). A rateless CPS
 *  offer yields 0 here (unknowable, never the sale value); the offer
 *  itself renders "rate missing" so the gap stays visible. */
export function conversionCommission(conv: Conversion, ledger: CommissionLedgerEntry[] = [], offers: Offer[] = []): number {
  const rows = ledger.filter((l) => l.conversionId === conv.id)
  if (rows.length > 0) {
    return Math.round(rows.filter((l) => l.status !== 'reversed' && l.status !== 'rejected').reduce((s, l) => s + l.amount, 0) * 100) / 100
  }
  const offer = offers.find((o) => o.id === conv.offerId)
  if (!offer) return conv.payout // legacy fallback: unknown offer, keep old behaviour
  const commission = (() => {
    try {
      return computeCommission(conv.payout, offer.payoutModel, offer.rateBps)
    } catch {
      return 0
    }
  })()
  return commission
}

export function sumCommissions(convs: Conversion[], ledger: CommissionLedgerEntry[] = [], offers: Offer[] = []): number {
  return Math.round(convs.reduce((s, c) => s + conversionCommission(c, ledger, offers), 0) * 100) / 100
}

export function computeStats(clicks: Click[], conversions: Conversion[], ledger: CommissionLedgerEntry[] = [], offers: Offer[] = []): Stats {
  const approved = conversions.filter((c) => c.status === 'approved')
  // M-05: revenue AND commission come from the ledger (via
  // conversionCommission), never from summing conversion payout as
  // both. For CPS the conversion payout is the SALE value ($12) while
  // the commission is the ledger amount ($1.20 at 10%) — the old sum
  // overstated affiliate revenue up to 10x. Only approved conversions
  // count; pending/rejected/reversed never contribute.
  const commission = sumCommissions(approved, ledger, offers)
  return {
    clicks: clicks.length,
    uniqueClicks: new Set(clicks.map((c) => c.clickId)).size,
    conversions: conversions.length,
    approved: approved.length,
    rejected: conversions.filter((c) => c.status === 'rejected').length,
    pending: conversions.filter((c) => c.status === 'pending').length,
    revenue: commission,
    commission,
    epc: clicks.length ? commission / clicks.length : 0,
    cr: clicks.length ? conversions.length / clicks.length : 0,
  }
}

/** Stats: prefer the tracking service /api/stats when reachable, else compute locally. */
export async function getStats(filters: ReportFilters = {}): Promise<Stats> {
  const [clicks, conversions, ledger, offers] = await Promise.all([
    getClicks(filters), getConversions(filters), getLedgerEntries(filters), getOffers(),
  ])
  // The ledger is RLS-scoped to the caller's own/org rows; keep only rows
  // for conversions in this result set so the affiliateCode filter holds.
  const convIds = new Set(conversions.map((c) => c.id))
  return computeStats(clicks, conversions, ledger.filter((l) => convIds.has(l.conversionId)), offers)
}
