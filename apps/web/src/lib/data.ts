// Data layer — Supabase only. There is no demo mode (removed entirely
// on 20 Nov 2026 under the production-grade rule): every read hits the
// real database and RLS scopes rows to the caller. We only SELECT
// user-visible tables with the anon key; clicks / conversions /
// commission_ledger writes are service-role only (see 002_rls.sql) and
// never happen from this browser code. Database rows are snake_case;
// the mappers below convert them to the shared camelCase domain types.
import { supabase, isSupabaseConfigured } from './supabase'
import { TRACKING_URL } from './tracking'
import { computeCommission } from '@affilayer/shared'
import type { AdvertiserBalance, AdvertiserDeposit, BankDetails, Campaign, Click, CommissionLedgerEntry, Conversion, NpPayout, Offer, PayoutRequest, PayoutWallet, Profile, Stats, SupportTicket } from './types'

export { isSupabaseConfigured }

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
    organizationId: str(r, 'organization_id'),
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
    organizationId: str(r, 'organization_id'),
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

/** Parse the bank-details snapshot on a payout request row
 *  (payout_requests.payment_details jsonb). Returns undefined unless
 *  the row actually carries bank fields — USDT rows store {}. */
export function parseBankDetails(raw: unknown): BankDetails | undefined {
  let obj: Record<string, unknown> | null = null
  if (raw && typeof raw === 'object') obj = raw as Record<string, unknown>
  else if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) as Record<string, unknown> } catch { return undefined }
  }
  if (!obj || typeof obj !== 'object') return undefined
  const pick = (k: string): string | undefined => (typeof obj[k] === 'string' && (obj[k] as string).trim() ? (obj[k] as string) : undefined)
  const details: BankDetails = {
    accountHolder: pick('accountHolder'), bankName: pick('bankName'), accountNumber: pick('accountNumber'),
    branch: pick('branch'), routing: pick('routing'), country: pick('country'), currency: pick('currency'),
  }
  return (details.accountHolder || details.bankName || details.accountNumber) ? details : undefined
}

export function mapPayout(r: Row): PayoutRequest {
  // The database status is 'pending'; the UI calls that state 'requested'.
  // Without this translation the admin action buttons (which check for
  // 'requested') never render for a live payout request.
  const dbStatus = String(r.status ?? 'pending')
  return {
    id: String(r.id), affiliateCode: String(r.affiliate_code ?? ''), affiliateId: str(r, 'affiliate_id'), amount: num(r, 'amount') ?? 0,
    currency: String(r.currency ?? 'USD'), status: (dbStatus === 'pending' ? 'requested' : dbStatus) as PayoutRequest['status'],
    method: str(r, 'payment_method') ?? str(r, 'method'), bankDetails: parseBankDetails(r.payment_details),
    createdAt: String(r.created_at ?? ''),
  }
}

export function mapTicket(r: Row): SupportTicket {
  return {
    // support_tickets stores the body in `description` and the owner in
    // `profile_id` (verified against the live schema 20 Nov 2026) —
    // mapping `message`/`user_id` rendered every ticket body blank.
    id: String(r.id), userId: str(r, 'profile_id'), subject: String(r.subject ?? ''),
    message: str(r, 'description') ?? str(r, 'message') ?? '', status: (r.status as SupportTicket['status']) ?? 'open',
    createdAt: String(r.created_at ?? ''),
  }
}

export async function getOffers(): Promise<Offer[]> {
  if (!isSupabaseConfigured || !supabase) return []
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
 *  the caller must show instead of claiming success. */
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
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapCampaign)
}

export async function getClicks(filters: ReportFilters = {}): Promise<Click[]> {
  if (!isSupabaseConfigured || !supabase) return []
  let q = supabase.from('clicks').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  if (filters.country) q = q.eq('country', filters.country)
  if (filters.device) q = q.eq('device', filters.device)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Row[]).map(mapClick).filter((c) => inRange(c.createdAt, filters))
}

export async function getConversions(filters: ReportFilters = {}): Promise<Conversion[]> {
  if (!isSupabaseConfigured || !supabase) return []
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

/** Commission ledger rows. RLS scopes the rows to the caller's own /
 *  org / admin rows; a select error yields [] and the caller falls
 *  back, so stats never break on a ledger read failure. */
export async function getLedgerEntries(filters: ReportFilters = {}): Promise<CommissionLedgerEntry[]> {
  if (!isSupabaseConfigured || !supabase) return []
  let q = supabase.from('commission_ledger').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Row[]).map(mapLedgerEntry)
}

export async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapProfile)
}

export type TeamSummary = {
  memberCount: number
  parentId?: string
  parentEmail?: string
}

/** Admin view of team links (migration 030): for each profile id, how many
 *  team members they head and, when they are a member, who their parent is.
 *  Admins can read affiliate_profiles in full, so this is one query. */
export async function getTeamSummary(): Promise<Map<string, TeamSummary>> {
  const out = new Map<string, TeamSummary>()
  if (!isSupabaseConfigured || !supabase) return out
  const { data, error } = await supabase.from('affiliate_profiles').select('profile_id, parent_affiliate_id')
  if (error || !data) return out
  const { data: profs } = await supabase.from('profiles').select('id, email')
  const emailById = new Map(((profs as Row[] | null) ?? []).map((p) => [String(p.id), String(p.email ?? '')]))
  for (const row of data as Row[]) {
    const pid = String(row.profile_id)
    const parent = row.parent_affiliate_id ? String(row.parent_affiliate_id) : ''
    if (!out.has(pid)) out.set(pid, { memberCount: 0 })
    if (parent) {
      const s = out.get(pid)!
      s.parentId = parent
      s.parentEmail = emailById.get(parent) ?? ''
      if (!out.has(parent)) out.set(parent, { memberCount: 0 })
      out.get(parent)!.memberCount += 1
    }
  }
  return out
}

export async function getPayouts(): Promise<PayoutRequest[]> {
  if (!isSupabaseConfigured || !supabase) return []
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

/** Admin financial actions (H-5). These call the SECURITY DEFINER
 *  RPCs (003 approve/reject_conversion, 008 payout RPCs), which enforce
 *  the admin gate and the ledger state machine. */

export async function decideConversion(id: string, to: 'approved' | 'rejected', actorId: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.rpc(to === 'approved' ? 'approve_conversion' : 'reject_conversion', {
    p_conversion_id: id, p_actor: actorId,
  })
  return error ? { error: error.message } : {}
}

/** Balance mirror (migration 032): provider reconciliation rows.
 *  Admin-only table; a non-admin read yields [] via RLS. */
export type ProviderReconciliation = {
  id: string
  provider: 'lospollos' | 'cj' | 'nowpayments' | 'mobidea'
  periodStart: string
  periodEnd: string
  providerTotal: number
  ledgerTotal: number
  difference: number
  status: 'open' | 'matched' | 'mismatch' | 'explained'
  details: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export async function getReconciliations(): Promise<ProviderReconciliation[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('provider_reconciliations').select('*').order('period_start', { ascending: false }).limit(200)
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    id: String(r.id),
    provider: String(r.provider) as ProviderReconciliation['provider'],
    periodStart: String(r.period_start ?? ''),
    periodEnd: String(r.period_end ?? ''),
    providerTotal: num(r, 'provider_total') ?? 0,
    ledgerTotal: num(r, 'ledger_total') ?? 0,
    difference: num(r, 'difference') ?? 0,
    status: String(r.status ?? 'open') as ProviderReconciliation['status'],
    details: (r.details as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }))
}

export async function setReconciliationStatus(id: string, status: ProviderReconciliation['status'], note: string, actorId: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.rpc('set_reconciliation_status', {
    p_row_id: id, p_status: status, p_note: note || null, p_actor: actorId,
  })
  return error ? { error: error.message } : {}
}

/** Admin: reverse a pending/approved conversion (and its ledger row) —
 *  the correction path for a wrong credit. Payable/paid rows are
 *  refused by the RPC (they are reserved in a payout request). The
 *  ledger is immutable: a reversal never edits a row, it flips the
 *  status to 'reversed', and a corrected credit is recorded fresh. */
export async function reverseConversion(id: string, reason: string, actorId: string): Promise<{ error?: string; result?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('reverse_conversion', {
    p_conversion_id: id, p_actor: actorId, p_reason: reason,
  })
  if (error) return { error: error.message }
  return { result: typeof data === 'string' ? data : undefined }
}

export type ProviderCreditResult = {
  duplicate: boolean
  amountMismatch: boolean
  existingAmount?: number
  requestedAmount?: number
  conversionId?: string
  idempotencyKey?: string
}

/** Admin: record a provider credit by hand (NOWPayments self-report +
 *  admin verify, or a CJ/Mobidea/LosPollos correction). The amount is
 *  already the affiliate amount in USD — no rate math happens here.
 *  Idempotent on `manual:<provider>:<reference>`: a repeat with the
 *  same amount reports duplicate, a repeat with a different amount
 *  reports amountMismatch and records nothing. The conversion starts
 *  pending and goes through the normal approval flow. */
export async function recordProviderCredit(args: {
  affiliateId: string
  offerId: string
  provider: string
  reference: string
  amount: number
  note: string
  actorId: string
  metadata?: Record<string, unknown>
}): Promise<{ error?: string; result?: ProviderCreditResult }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('record_provider_credit', {
    p_affiliate_id: args.affiliateId,
    p_offer_id: args.offerId,
    p_provider: args.provider,
    p_provider_reference: args.reference,
    p_amount: args.amount,
    p_currency: 'USD',
    p_note: args.note || null,
    p_actor: args.actorId,
    p_metadata: args.metadata ?? {},
  })
  if (error) return { error: error.message }
  const r = (data ?? {}) as Record<string, unknown>
  return {
    result: {
      duplicate: r.duplicate === true,
      amountMismatch: r.amount_mismatch === true,
      existingAmount: typeof r.existing_amount === 'number' ? r.existing_amount : undefined,
      requestedAmount: typeof r.requested_amount === 'number' ? r.requested_amount : undefined,
      conversionId: typeof r.conversion_id === 'string' ? r.conversion_id : (typeof r.id === 'string' ? r.id : undefined),
      idempotencyKey: typeof r.idempotency_key === 'string' ? r.idempotency_key : undefined,
    },
  }
}

/** Admin: approve / reject / suspend / reinstate an affiliate account.
 *  In Supabase mode this updates `profiles.status` directly. That is safe
 *  because the table's UPDATE policy (`profiles_update_own_or_admin`)
 *  admits admins, and the `profiles_enforce_role_status` trigger lets
 *  admins set status while forcing any non-admin's row back to
 *  affiliate / pending / not_started — so a non-admin calling this can
 *  never escalate or change anyone's status. The decision is also
 *  recorded in `audit_logs` via the `log_audit` RPC (admin JWT); a
 *  logging failure never blocks the decision itself. */
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
export async function requestPayout(amount: number, currency: string, method: string, details?: BankDetails): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  // Bank transfer: the details ride on the request row as a snapshot
  // (payout_requests.payment_details jsonb, already in the schema),
  // so the admin sees exactly what was submitted — even if the
  // affiliate changes their saved details later. USDT rows store {}.
  const { error } = await supabase.from('payout_requests').insert({
    affiliate_id: user.id, amount, currency, payment_method: method,
    payment_details: details ?? {},
  })
  return error ? { error: error.message } : {}
}

/** The affiliate's saved bank-transfer details
 *  (affiliate_profiles.payment_details jsonb, key "bank_transfer"),
 *  so the form is prefilled next time. Same read-merge-write pattern
 *  as saveFirstSteps — other keys are never dropped. */
export async function getBankDetails(): Promise<BankDetails | undefined> {
  if (!isSupabaseConfigured || !supabase) return undefined
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return undefined
  const { data } = await supabase.from('affiliate_profiles').select('payment_details').eq('profile_id', user.id).maybeSingle()
  const details = (data as Row | null)?.payment_details
  if (!details || typeof details !== 'object') return undefined
  const saved = (details as Record<string, unknown>).bank_transfer
  if (!saved || typeof saved !== 'object') return undefined
  return parseBankDetails(saved)
}

export async function saveBankDetails(details: BankDetails): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { data: row } = await supabase.from('affiliate_profiles').select('payment_details').eq('profile_id', user.id).maybeSingle()
  const current = ((row as Row | null)?.payment_details ?? {}) as Record<string, unknown>
  const next = { ...current, bank_transfer: details }
  if (row) {
    const { error } = await supabase.from('affiliate_profiles').update({ payment_details: next }).eq('profile_id', user.id)
    return error ? { error: error.message } : {}
  }
  const { error } = await supabase.from('affiliate_profiles').insert({ profile_id: user.id, payment_details: next })
  return error ? { error: error.message } : {}
}

/** Persist the signed-in user's full name on their profiles row.
 *  Walk audit 20 Nov 2026: the name was collected at registration
 *  and at onboarding and saved nowhere. Registration now stores it
 *  via the signup trigger; this is the backstop for accounts that
 *  registered before that fix (and for the onboarding form, which
 *  doubles as the profile editor). Ordinary self-edits of full_name
 *  pass through RLS, and the 024 trigger clamps role/status/kyc
 *  back to the row's values, so an approved user stays approved. */
export async function saveMyFullName(fullName: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
  return error ? { error: error.message } : {}
}

/** First-steps checklist progress, saved on the affiliate's own account
 *  (affiliate_profiles.payment_details jsonb, key "first_steps_<role>")
 *  so it follows the affiliate to any device. payment_details is
 *  otherwise unused by the app (onboarding keeps its payment-details
 *  copy in local state only), and the read-merge-write below never
 *  drops other keys. Local storage stays as the fallback when the
 *  account save cannot land (no row yet, RLS, or offline). */
export async function getFirstSteps(role: 'affiliate' | 'advertiser'): Promise<Record<number, boolean>> {
  if (!isSupabaseConfigured || !supabase) return {}
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data } = await supabase.from('affiliate_profiles').select('payment_details').eq('profile_id', user.id).maybeSingle()
  const details = (data as Row | null)?.payment_details
  if (!details || typeof details !== 'object') return {}
  const steps = (details as Record<string, unknown>)[`first_steps_${role}`]
  if (!steps || typeof steps !== 'object') return {}
  return steps as Record<number, boolean>
}

export async function saveFirstSteps(role: 'affiliate' | 'advertiser', checked: Record<number, boolean>): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const key = `first_steps_${role}`
  const { data: row } = await supabase.from('affiliate_profiles').select('payment_details').eq('profile_id', user.id).maybeSingle()
  const current = ((row as Row | null)?.payment_details ?? {}) as Record<string, unknown>
  const next = { ...current, [key]: checked }
  if (row) {
    const { error } = await supabase.from('affiliate_profiles').update({ payment_details: next }).eq('profile_id', user.id)
    return error ? { error: error.message } : {}
  }
  const { error } = await supabase.from('affiliate_profiles').insert({ profile_id: user.id, payment_details: next })
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
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map(mapTicket)
}

/** File a support ticket for the signed-in user.
 *  The public contact form uses this — a message must reach the team,
 *  never just localStorage. RLS allows the insert when profile_id is
 *  the caller's own id. */
export async function createTicket(subject: string, description: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Tickets are not available right now.' }
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

/** Money with its currency code attached — a EUR offer must never
 *  render as $. "$40.00 USD" / "€5.47 EUR". */
export function money(amount: number, currency: string): string {
  const code = (currency || 'USD').toUpperCase()
  const symbol = code === 'EUR' ? '€' : '$'
  return `${symbol}${amount.toFixed(2)} ${code}`
}

/** What a CPS offer pays on a $100 / €100 example order. CPS rows store
 *  payout 0 — the sale value is unknown until a visitor buys — so a
 *  label must never multiply the stored payout (that renders $0.00). */
function exampleCommission(offer: Offer): number | null {
  if (offer.payoutModel !== 'CPS' || offer.rateBps == null) return null
  try {
    return computeCommission(100, 'CPS', offer.rateBps)
  } catch {
    return null
  }
}

/** Big payout figure for an offer card: the % for CPS, the flat amount
 *  otherwise, "Varies" when the amount is not a fixed number. */
export function offerHeadline(offer: Offer): string {
  if (offer.payoutModel === 'CPS') {
    if (offer.rateBps == null) return 'Rate missing'
    return `${ratePct(offer.rateBps)}%`
  }
  if (offer.payout <= 0) return 'Varies'
  return money(offer.payout, offer.currency)
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
 *  is the percentage of the sale plus the commission on a $100 / €100
 *  example order — never the stored payout (CPS rows store payout 0).
 *  E.g. a 40% CPS offer: "CPS — 40% of sale ($40.00 USD on a
 *  $100.00 USD order)". A flat offer with no fixed amount renders
 *  "varies", never $0.00. */
export function offerPayoutLabel(offer: Offer): string {
  if (offer.payoutModel === 'CPS') {
    if (offer.rateBps == null) return 'CPS — rate missing'
    const commission = exampleCommission(offer)
    return `CPS — ${ratePct(offer.rateBps)}% of sale (${commission == null ? '—' : `${money(commission, offer.currency)} on a ${money(100, offer.currency)} order`})`
  }
  if (offer.payout <= 0) return `${offer.payoutModel} — varies per ${resultNoun(offer.conversionType)}`
  return `${offer.payoutModel} ${money(offer.payout, offer.currency)}`
}

/** Commission line for an offer detail view. CPS shows the commission on
 *  a $100 / €100 example order, never the stored payout (which is 0). */
export function offerCommissionLabel(offer: Offer): string {
  if (offer.payoutModel === 'CPS') {
    if (offer.rateBps == null) return 'Rate missing — commission cannot be calculated'
    const commission = exampleCommission(offer)
    if (commission == null) return 'Rate missing — commission cannot be calculated'
    return `${money(commission, offer.currency)} per sale (${ratePct(offer.rateBps)}% of a ${money(100, offer.currency)} order)`
  }
  if (offer.payout <= 0) return `Varies per ${resultNoun(offer.conversionType)}`
  return `${money(offer.payout, offer.currency)} per ${resultNoun(offer.conversionType)}`
}

/** Plain words for a conversion type: what the visitor does that earns money. */
export function resultNoun(conversionType?: string): string {
  switch ((conversionType ?? '').toLowerCase()) {
    case 'sale':
    case 'purchase':
      return 'sale'
    case 'lead':
      return 'sign-up'
    case 'registration':
      return 'registration'
    case 'ftd':
      return 'first deposit'
    default:
      return 'result'
  }
}

/** What the affiliate earns, in plain words: "You earn $57.25 USD for
 *  each sale" / "You earn 40% of each sale ($40.00 USD on a
 *  $100.00 USD order)". A flat offer with no fixed amount renders
 *  "varies", never $0.00. */
export function offerPayoutPlain(offer: Offer): string {
  if (offer.payoutModel === 'CPS') {
    if (offer.rateBps == null) return 'You earn a share of each sale — rate missing'
    const commission = exampleCommission(offer)
    if (commission == null) return 'You earn a share of each sale — rate missing'
    return `You earn ${ratePct(offer.rateBps)}% of each sale (${money(commission, offer.currency)} on a ${money(100, offer.currency)} order)`
  }
  if (offer.payout <= 0) return `You earn a commission for each ${resultNoun(offer.conversionType)} — the amount varies`
  return `You earn ${money(offer.payout, offer.currency)} for each ${resultNoun(offer.conversionType)}`
}

/** Commission owed for one conversion. M-05: the ledger is the money
 *  truth — when a ledger row exists for the conversion, its live rows
 *  win (reversed / rejected rows pay $0, and a fully-reversed
 *  conversion is $0 rather than the offer rate resurrected by the
 *  fallback). Only with NO ledger row at all (legacy rows)
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

export interface DailyClickPoint {
  /** ISO date (UTC), e.g. "2026-11-13". */
  date: string
  /** Short weekday label for that UTC date, e.g. "Fri". */
  label: string
  value: number
}

/** Real clicks per day for the last 7 UTC days (today included),
 *  oldest → newest, zero-filled for days with no clicks. Buckets by
 *  the UTC date prefix of `createdAt` — the same convention `inRange`
 *  and the admin tables (createdAt.slice(0, 10)) already use, and the
 *  same click rows `getStats` counts, so the series always reconciles
 *  with the Clicks counter: sum(series) = clicks in the last 7 days. */
export function buildDailyClickSeries(clicks: Click[], now: Date = new Date()): DailyClickPoint[] {
  const dayMs = 86400000
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const days: DailyClickPoint[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayUtc - (6 - i) * dayMs)
    return {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      value: 0,
    }
  })
  const indexByDate = new Map(days.map((d, i) => [d.date, i]))
  for (const c of clicks) {
    const i = indexByDate.get(c.createdAt.slice(0, 10))
    if (i !== undefined) days[i].value += 1
  }
  return days
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

// ---------------------------------------------------------------------
// Offer applications + postback configs (real tables; these replaced
// the demo store's local-only copies when demo mode was removed).

export interface OfferApplication {
  id: string
  offerId: string
  status: string
  createdAt: string
}

export async function getMyOfferApplications(): Promise<OfferApplication[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('offer_applications').select('*').eq('affiliate_id', user.id).order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    id: String(r.id), offerId: String(r.offer_id ?? ''), status: String(r.status ?? 'pending'), createdAt: String(r.created_at ?? ''),
  }))
}

/** Apply to (or join) an offer. Approval-required offers land as
 *  'pending' for the advertiser to review; open offers are recorded as
 *  'approved' immediately. RLS restricts inserts to the caller's own
 *  affiliate id. */
export async function applyToOffer(offer: Offer): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Applications are not available right now.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { error } = await supabase.from('offer_applications').insert({
    offer_id: offer.id,
    affiliate_id: user.id,
    status: offer.approvalRequired ? 'pending' : 'approved',
  })
  return error ? { error: error.message } : {}
}

export interface PostbackConfig {
  id: string
  url: string
  createdAt: string
}

export async function getMyPostbackConfigs(): Promise<PostbackConfig[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('postback_configs').select('*').eq('affiliate_id', user.id).order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    id: String(r.id), url: String(r.url ?? ''), createdAt: String(r.created_at ?? ''),
  }))
}

export async function savePostbackConfig(url: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Postbacks are not available right now.' }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { error } = await supabase.from('postback_configs').insert({
    affiliate_id: user.id, url, events: ['conversion'], is_active: true,
  })
  return error ? { error: error.message } : {}
}

// ---------------------------------------------------------------------
// Admin reads (RLS admits admins; non-admins get empty results).

export interface AuditLogEntry {
  id: string
  actorId?: string
  action: string
  entityType?: string
  entityId?: string
  details?: string
  createdAt: string
}

/** The real audit trail (audit_logs table; admin-only by RLS). */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    id: String(r.id),
    actorId: str(r, 'actor_id'),
    action: String(r.action ?? ''),
    entityType: str(r, 'entity_type'),
    entityId: str(r, 'entity_id'),
    details: r.details == null ? undefined : (typeof r.details === 'string' ? r.details : JSON.stringify(r.details)),
    createdAt: String(r.created_at ?? ''),
  }))
}

/** All advertiser deposits (admin view; RLS admits admins). */
export async function getAllDeposits(): Promise<AdvertiserDeposit[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('advertiser_deposits').select('*').order('created_at', { ascending: false }).limit(200)
  if (error || !data) return []
  return (data as Row[]).map(mapDeposit)
}

/** Admin: pause / resume / expire a real offer. The offers UPDATE
 *  policy admits org members and admins. */
export async function updateOfferStatus(id: string, status: 'active' | 'paused' | 'expired'): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured.' }
  const { error } = await supabase.from('offers').update({ status }).eq('id', id)
  return error ? { error: error.message } : {}
}

// ---------------------------------------------------------------------
// Team sub-panel (design 2026-11-26; database side is migration 030:
// parent_affiliate_id on affiliate_profiles, the team_invites table,
// and the my_team_context / create_team_invite / accept_team_invite /
// decline_team_invite / remove_team_member / leave_team RPCs).
// Until 030 is applied every call below fails closed — an empty list
// or an error string — and never crashes the page. The invite email
// route POST /api/team/invite already exists on the Worker.

export interface TeamContext {
  parentId: string
  parentCode: string
  parentEmail: string
}

export interface TeamMember {
  id: string
  email: string
  fullName?: string
  /** parent_linked_at, ISO date. */
  dateAdded: string
}

export interface TeamInvite {
  id: string
  email: string
  status: string
  createdAt: string
  /** Email of the affiliate who sent the invite (pending invites to me). */
  inviterEmail?: string
  /** Copyable link, built from the invite token (parent view). */
  inviteUrl?: string
}

/** The caller's team context: their team head's id, code and email —
 *  or null when they are a standalone affiliate. The code is public
 *  by design (it sits in every tracking-link URL); the parent's payout
 *  wallet is never returned here. */
export async function getMyTeamContext(): Promise<TeamContext | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.rpc('my_team_context')
  if (error || !data) return null
  const row = data as Row
  const parentId = str(row, 'parent_id')
  const parentCode = str(row, 'parent_code')
  const parentEmail = str(row, 'parent_email')
  if (!parentId || !parentCode || !parentEmail) return null
  return { parentId, parentCode, parentEmail }
}

/** Members of the caller's team (parent view). Data comes from the
 *  extended profiles / affiliate_profiles SELECT policies (030): a
 *  parent reads members' rows, never the other way round. */
export async function getMyTeamMembers(): Promise<TeamMember[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('affiliate_profiles')
    .select('profile_id, parent_linked_at').eq('parent_affiliate_id', user.id)
    .order('parent_linked_at', { ascending: false })
  if (error || !data) return []
  const rows = data as Row[]
  const ids = rows.map((r) => String(r.profile_id ?? '')).filter(Boolean)
  if (ids.length === 0) return []
  const { data: profs } = await supabase.from('profiles').select('id, email, full_name').in('id', ids)
  const byId = new Map(((profs as Row[] | null) ?? []).map((p) => [String(p.id), p]))
  return rows.map((r) => {
    const p = byId.get(String(r.profile_id ?? ''))
    return {
      id: String(r.profile_id ?? ''),
      email: p ? String(p.email ?? '') : '',
      fullName: p ? str(p, 'full_name') : undefined,
      dateAdded: String(r.parent_linked_at ?? '').slice(0, 10),
    }
  })
}

/** Invites the caller sent (parent view), newest first. The invite
 *  link is rebuilt from the token — same base the Worker uses
 *  (TEAM_INVITE_URL_BASE in services/tracking-worker/src/index.ts) —
 *  so the copyable link survives a page reload. */
export async function getMyTeamInvites(): Promise<TeamInvite[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('team_invites')
    .select('id, invited_email, token, status, created_at').eq('inviter_id', user.id)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as Row[]).map((r) => ({
    id: String(r.id),
    email: String(r.invited_email ?? ''),
    status: String(r.status ?? 'pending'),
    createdAt: String(r.created_at ?? ''),
    inviteUrl: typeof r.token === 'string' && r.token
      ? `https://affilayer.com/register?team=${r.token}`
      : undefined,
  }))
}

/** Invites sent TO the signed-in email that are still waiting for a
 *  reply — the accept / decline banner on the dashboard and /pending. */
export async function getMyPendingInvites(): Promise<TeamInvite[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return []
  const { data, error } = await supabase.from('team_invites')
    .select('id, inviter_id, invited_email, status, created_at').eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  const mine = (data as Row[]).filter(
    (r) => typeof r.invited_email === 'string' && r.invited_email.toLowerCase() === user.email!.toLowerCase(),
  )
  const inviterIds = [...new Set(mine.map((r) => String(r.inviter_id ?? '')).filter(Boolean))]
  let emailById = new Map<string, string>()
  if (inviterIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, email').in('id', inviterIds)
    emailById = new Map(((profs as Row[] | null) ?? []).map((p) => [String(p.id), String(p.email ?? '')]))
  }
  return mine.map((r) => ({
    id: String(r.id),
    email: String(r.invited_email ?? ''),
    status: String(r.status ?? 'pending'),
    createdAt: String(r.created_at ?? ''),
    inviterEmail: emailById.get(String(r.inviter_id ?? '')),
  }))
}

/** Invite one email to the caller's team, via the Worker
 *  (POST /api/team/invite). Same call pattern as lib/payments.ts
 *  workerCall: the user's Supabase JWT in the Authorization header,
 *  JSON body, plain error on failure. The Worker calls the
 *  create_team_invite RPC and sends the email; if the email fails the
 *  invite still exists and the response carries the copyable link. */
export async function inviteTeamMember(email: string): Promise<{ inviteUrl?: string; emailSent?: boolean; emailNote?: string; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Invites are not available right now.' }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You are not signed in.' }
  let res: Response
  try {
    res = await fetch(`${TRACKING_URL.replace(/\/$/, '')}/api/team/invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.trim() }),
    })
  } catch {
    return { error: 'Could not reach the invite service. Try again.' }
  }
  let data: Row = {}
  try {
    data = (await res.json()) as Row
  } catch {
    data = {}
  }
  if (!res.ok) return { error: typeof data.error === 'string' ? data.error : `Invite service returned ${res.status}.` }
  return {
    inviteUrl: typeof data.invite_url === 'string' ? data.invite_url : undefined,
    emailSent: data.email_sent === true,
    emailNote: typeof data.email_note === 'string' ? data.email_note : undefined,
  }
}

async function teamRpc(fn: string, params?: Record<string, unknown>): Promise<{ error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { error: 'Teams are not available right now.' }
  const { error } = params ? await supabase.rpc(fn, params) : await supabase.rpc(fn)
  return error ? { error: error.message } : {}
}

/** Accept a team invite (the invited affiliate). */
export async function acceptTeamInvite(id: string): Promise<{ error?: string }> {
  return teamRpc('accept_team_invite', { p_invite_id: id })
}

/** Decline a team invite (the invited affiliate). */
export async function declineTeamInvite(id: string): Promise<{ error?: string }> {
  return teamRpc('decline_team_invite', { p_invite_id: id })
}

/** Remove a member from the caller's team (the parent). */
export async function removeTeamMember(id: string): Promise<{ error?: string }> {
  return teamRpc('remove_team_member', { p_member_id: id })
}

/** Leave the caller's own team (the member). */
export async function leaveTeam(): Promise<{ error?: string }> {
  return teamRpc('leave_team')
}

/** Cancel a pending invite the caller sent (the parent).
 *  NOTE: design §4 requires a Cancel invite action, but §2d lists no
 *  cancel RPC (only accept/decline for the invitee). Migration 030
 *  defines `cancel_team_invite(p_invite_id)` as an extra RPC for
 *  exactly this action (inviter-only, marks the row `cancelled`) —
 *  this calls it. Do not rewire it to decline_team_invite — that RPC
 *  is invitee-only by design. */
export async function cancelTeamInvite(id: string): Promise<{ error?: string }> {
  return teamRpc('cancel_team_invite', { p_invite_id: id })
}
