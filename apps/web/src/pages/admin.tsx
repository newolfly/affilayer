import { useEffect, useState } from 'react'
import { Card, Empty, Stat } from '../components/layout'
import { BarChart } from '../components/charts'
import { buildDailyClickSeries, conversionCommission, creditDepositManually, decideConversion, decidePayout, decideProfile, getAllDeposits, getAuditLogs, getCampaigns, getClicks, getConversions, getLedgerEntries, getNpPayouts, getOffers, getPayouts, getProfiles, getReconciliations, getStats, getTeamSummary, getTickets, offerPayoutLabel, recordProviderCredit, releasePayoutReservation, reverseConversion, setReconciliationStatus, updateOfferStatus } from '../lib/data'
import type { AuditLogEntry, ProviderReconciliation } from '../lib/data'
import { executePayout, getCustodyBalance, refreshPayoutStatus, verifyPayout } from '../lib/payments'
import { NETWORK_SETTINGS } from '../lib/network-settings'
import { supabase } from '../lib/supabase'
import { detectFraudSignals, ledgerTransition } from '@affilayer/shared'
import { useAuth } from '../lib/auth'
import type { AdvertiserDeposit, Campaign, CommissionLedgerEntry, Conversion, NpPayout, Offer, PayoutRequest, Profile, SupportTicket } from '../lib/types'

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900'
const btnCls = 'rounded-lg bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 px-3 py-2.5 text-sm font-semibold text-[#0B1220] disabled:opacity-50'
const ghostCls = 'rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const dangerCls = 'rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50'

export function AdminOverview() {
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, approved: 0, pending: 0, revenue: 0 })
  const [dailyClicks, setDailyClicks] = useState(() => buildDailyClickSeries([]))
  const [profiles, setProfiles] = useState<Profile[]>([])
  // Chart reads the same click rows the Clicks counter counts
  // (getStats -> getClicks), bucketed per UTC day, zero-filled.
  useEffect(() => {
    getStats().then(setStats)
    getClicks().then((clicks) => setDailyClicks(buildDailyClickSeries(clicks)))
    getProfiles().then(setProfiles)
  }, [])
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={String(profiles.length)} icon="users" />
        <Stat label="Clicks" value={String(stats.clicks)} icon="chart" />
        <Stat label="Conversions" value={String(stats.conversions)} icon="check" />
        <Stat label="Pending conversions" value={String(stats.pending)} icon="clock" />
      </div>
      <Card title="Clicks — last 7 days"><BarChart data={dailyClicks} /></Card>
    </div>
  )
}

function ProfilesTable({ filter, showTeam }: { filter?: (p: Profile) => boolean; showTeam?: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [team, setTeam] = useState<Map<string, { memberCount: number; parentId?: string; parentEmail?: string }>>(new Map())
  useEffect(() => { getProfiles().then(setProfiles) }, [])
  useEffect(() => { if (showTeam) getTeamSummary().then(setTeam) }, [showTeam])
  const list = filter ? profiles.filter(filter) : profiles
  const teamLabel = (p: Profile) => {
    const t = team.get(p.id)
    if (!t) return '—'
    if (t.parentEmail) return `On team: ${t.parentEmail}`
    if (t.memberCount > 0) return `Team: ${t.memberCount} member${t.memberCount === 1 ? '' : 's'}`
    return '—'
  }
  return (
    <Card title="Users">
      {list.length === 0 ? <Empty text="No users match." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th>{showTeam && <th>Team</th>}</tr></thead>
          <tbody>{list.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.fullName ?? '—'}</td><td>{p.email}</td><td>{p.role}</td><td>{p.status}</td>{showTeam && <td>{teamLabel(p)}</td>}</tr>)}</tbody>
        </table></div>
      )}
      <p className="mt-3 text-xs text-slate-500">Approvals, rejections and suspensions are handled in Compliance → KYC review. This table is read-only.</p>
    </Card>
  )
}

export function AdminUsers() { return <ProfilesTable /> }
export function AdminAffiliates() { return <ProfilesTable filter={(p) => p.role === 'affiliate'} showTeam /> }
export function AdminAdvertisers() { return <ProfilesTable filter={(p) => p.role === 'advertiser'} /> }

export function AdminOffers() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [error, setError] = useState('')
  useEffect(() => { getOffers().then(setOffers) }, [])
  const toggle = async (o: Offer) => {
    const next = o.status === 'active' ? 'paused' : 'active'
    const r = await updateOfferStatus(o.id, next)
    if (r.error) { setError(r.error); return }
    setError('')
    getOffers().then(setOffers)
  }
  return (
    <Card title="Offers">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {offers.length === 0 ? <Empty text="No offers yet." /> : offers.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
          <span>{o.name} — {o.vertical}</span>
          <span className="flex items-center gap-2">
            <span>{o.status} · {offerPayoutLabel(o)}</span>
            {o.status !== 'expired' && (
              <button className={ghostCls} onClick={() => toggle(o)}>{o.status === 'active' ? 'Pause' : 'Resume'}</button>
            )}
          </span>
        </div>
      ))}
    </Card>
  )
}

const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'ended'] as const

export function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editBudget, setEditBudget] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = () => { getCampaigns().then(setCampaigns) }
  useEffect(() => { load(); getProfiles().then(setProfiles) }, [])

  const setStatus = async (c: Campaign, status: (typeof CAMPAIGN_STATUSES)[number]) => {
    if (!supabase) return
    const { error: e } = await supabase.from('campaigns').update({ status }).eq('id', c.id)
    if (e) { setError(e.message); return }
    setError('')
    setNotice(`${c.name} is now ${status}.`)
    load()
  }

  const saveBudget = async (c: Campaign) => {
    const raw = editBudget[c.id]
    if (raw === undefined) return
    const budget = Number(raw)
    if (!Number.isFinite(budget) || budget < 0) { setNotice('Budget must be a number of 0 or more.'); return }
    if (!supabase) return
    const { error: e } = await supabase.from('campaigns').update({ budget }).eq('id', c.id)
    if (e) { setError(e.message); return }
    setError('')
    setNotice(`Budget for ${c.name} saved.`)
    setEditBudget((x) => { const n = { ...x }; delete n[c.id]; return n })
    load()
  }

  const advName = (id: string) => profiles.find((p) => p.id === id)?.email ?? id
  return (
    <div className="space-y-4">
      <Card title="Campaigns">
        <p className="mb-3 text-sm text-slate-500">Campaigns are created by advertisers in their own accounts. Admins manage status and budgets here.</p>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        {campaigns.length === 0 ? <Empty text="No campaigns yet." /> : campaigns.map((c) => (
          <div key={c.id} className="border-b border-slate-100 py-3 text-sm last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{c.name} <span className="ml-2 text-slate-500">· {c.status} · {advName(c.advertiserId)}</span></p>
              <span className="flex gap-2">
                {c.status === 'active' && <button className={ghostCls} onClick={() => setStatus(c, 'paused')}>Pause</button>}
                {c.status === 'paused' && <button className={ghostCls} onClick={() => setStatus(c, 'active')}>Resume</button>}
                {c.status === 'draft' && <button className={ghostCls} onClick={() => setStatus(c, 'active')}>Activate</button>}
                {c.status !== 'ended' && <button className={dangerCls} onClick={() => setStatus(c, 'ended')}>End</button>}
              </span>
            </div>
            <p className="mt-1 text-slate-600">{c.description ?? ''} {c.budget !== undefined ? `· Budget $${c.budget} ${c.currency}` : ''}</p>
            <div className="mt-2 flex gap-2">
              <input className={inputCls} type="number" min="0" step="0.01" placeholder="New budget" aria-label="New budget" value={editBudget[c.id] ?? ''} onChange={(e) => setEditBudget((x) => ({ ...x, [c.id]: e.target.value }))} />
              <button className={ghostCls} disabled={editBudget[c.id] === undefined} onClick={() => saveBudget(c)}>Save budget</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function AdminConversions() {
  const { user } = useAuth()
  const [liveConversions, setLiveConversions] = useState<Conversion[] | null>(null)
  const [ledger, setLedger] = useState<CommissionLedgerEntry[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [error, setError] = useState('')
  const [reverseTarget, setReverseTarget] = useState<string | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  useEffect(() => {
    getLedgerEntries().then(setLedger)
    getOffers().then(setOffers)
    getConversions().then(setLiveConversions)
  }, [])
  const conversions = liveConversions ?? []
  const decide = async (id: string, to: 'approved' | 'rejected') => {
    const conv = conversions.find((c) => c.id === id)
    if (!conv || !ledgerTransition(conv.status, to)) return
    if (!user) return
    const r = await decideConversion(id, to, user.id)
    if (r.error) { setError(r.error); return }
    setError('')
    getConversions().then(setLiveConversions)
    getLedgerEntries().then(setLedger)
  }
  // Balance mirror (migration 032): reverse an APPROVED conversion that
  // turns out to be wrong. Payable/paid rows are excluded — they are
  // reserved in a payout request, so release the reservation first.
  // The ledger is immutable: reversal flips the row to 'reversed' and a
  // corrected credit is recorded fresh (see Reconciliation).
  const reverse = async (id: string) => {
    const reason = reverseReason.trim()
    if (!reason) { setError('A reason is required to reverse a conversion.'); return }
    if (!user) return
    const r = await reverseConversion(id, reason, user.id)
    if (r.error) { setError(r.error); return }
    setError('')
    setReverseTarget(null)
    setReverseReason('')
    getConversions().then(setLiveConversions)
    getLedgerEntries().then(setLedger)
  }
  return (
    <Card title="Conversions">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {conversions.length === 0 ? <Empty text="No conversions yet." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Click ID</th><th>Offer</th><th>Affiliate</th><th>Commission</th><th>Status</th><th /></tr></thead>
          <tbody>{conversions.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="py-2">{c.createdAt.slice(0, 10)}</td><td className="font-mono">{c.clickId ?? '—'}</td>
              {/* M-05: commission owed (ledger / rate), not the conversion
                  payout — for CPS the payout is the sale value. */}
              <td>{c.offerId}</td><td>{c.affiliateCode ?? '—'}</td><td>${conversionCommission(c, ledger, offers).toFixed(2)} {c.currency}</td><td>{c.status}</td>
              <td className="text-right">
                {c.status === 'pending' && (
                  <span className="flex justify-end gap-2">
                    <button className={btnCls} onClick={() => decide(c.id, 'approved')}>Approve</button>
                    <button className={dangerCls} onClick={() => decide(c.id, 'rejected')}>Reject</button>
                  </span>
                )}
                {c.status === 'approved' && reverseTarget !== c.id && (
                  <button className={dangerCls} onClick={() => { setReverseTarget(c.id); setReverseReason('') }}>Reverse</button>
                )}
                {c.status === 'approved' && reverseTarget === c.id && (
                  <span className="flex justify-end gap-2">
                    <input className={`${inputCls} w-48`} placeholder="Reason (required)" aria-label="Reversal reason" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
                    <button className={dangerCls} onClick={() => reverse(c.id)}>Confirm reverse</button>
                    <button className={ghostCls} onClick={() => { setReverseTarget(null); setReverseReason('') }}>Cancel</button>
                  </span>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="mt-3 text-xs text-slate-500">Approvals follow the ledger state machine (pending → approved / rejected). Approved conversions can be reversed later; rejected ones are terminal.</p>
    </Card>
  )
}

export function AdminFraud() {
  const [clicks, setClicks] = useState<Awaited<ReturnType<typeof getClicks>>>([])
  useEffect(() => { getClicks().then(setClicks) }, [])
  const signals = detectFraudSignals(clicks.map((c) => ({ id: c.id, clickId: c.clickId, ip: c.ip, userAgent: c.userAgent, createdAt: c.createdAt })))
  return (
    <Card title="Fraud signals">
      <p className="mb-3 text-sm text-slate-500">Rule-based signals only: duplicate click IDs, more than 10 clicks from one IP in 60 seconds, empty user agent. Signals never auto-reject a conversion — a person reviews them.</p>
      {signals.length === 0 ? <Empty text="No fraud signals in the current data." /> : signals.slice(0, 50).map((s, i) => <p key={`${s.type}-${i}`} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{s.message}</p>)}
      {signals.length > 50 && <p className="mt-2 text-xs text-slate-500">Showing 50 of {signals.length} signals.</p>}
    </Card>
  )
}

export function AdminLedger() {
  const [liveConversions, setLiveConversions] = useState<Conversion[]>([])
  const [ledger, setLedger] = useState<CommissionLedgerEntry[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  // Reads the ledger itself (previously this card rendered conversion
  // payout as if it were the ledger amount — for CPS that showed the
  // $12 sale value instead of the $1.20 commission).
  useEffect(() => {
    getLedgerEntries().then(setLedger)
    getOffers().then(setOffers)
    getConversions().then(setLiveConversions)
  }, [])
  const conversions = liveConversions
  const codeByConversion = new Map(conversions.map((c) => [c.id, c.affiliateCode ?? c.affiliateId ?? '—']))
  const rows = ledger.map((l) => ({ id: l.id, conversionId: l.conversionId, code: codeByConversion.get(l.conversionId) ?? '—', amount: l.amount, currency: l.currency, status: l.status }))
  return (
    <Card title="Commission ledger">
      <p className="mb-3 text-sm text-slate-500">Append-only ledger (immutable trigger in the database). Entries mirror conversion status: pending → approved → reversed.</p>
      {rows.length === 0 ? <Empty text="No ledger entries yet." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Conversion</th><th>Affiliate</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="py-2 font-mono">{r.conversionId}</td><td>{r.code}</td><td>${r.amount.toFixed(2)} {r.currency}</td><td>{r.status}</td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  )
}

const RECONCILIATION_PROVIDERS = ['nowpayments', 'cj', 'mobidea', 'lospollos'] as const

/** Balance mirror (migration 032): the admin view of provider
 *  reconciliation. Admin-only — provider names and backend mechanics
 *  are visible here and nowhere affiliate-facing. The ledger is USD;
 *  mismatches are flagged and decided by a person, never auto-edited. */
export function AdminReconciliation() {
  const { user } = useAuth()
  const [rows, setRows] = useState<ProviderReconciliation[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [statusNote, setStatusNote] = useState<Record<string, string>>({})
  const [statusPick, setStatusPick] = useState<Record<string, ProviderReconciliation['status']>>({})
  const [credit, setCredit] = useState({ affiliateId: '', offerId: '', provider: 'nowpayments', reference: '', amount: '', note: '' })

  const load = () => {
    getReconciliations().then(setRows)
    getConversions().then(setConversions)
    getProfiles().then(setProfiles)
    getOffers().then(setOffers)
  }
  useEffect(() => { load() }, [])

  const mismatches = rows.filter((r) => r.status === 'mismatch' || (r.status === 'open' && Math.abs(r.difference) > 0.005))
  const openCount = rows.filter((r) => r.status === 'open').length
  const stuck = conversions.filter((c) => c.status === 'pending' && Date.now() - new Date(c.createdAt).getTime() > 7 * 24 * 3600 * 1000)
  const approvedAffiliates = profiles.filter((p) => p.role === 'affiliate' && p.status === 'approved')
  const activeOffers = offers.filter((o) => o.status === 'active')
  const emailById = new Map(profiles.map((p) => [p.id, p.email]))
  const offerName = (id: string) => offers.find((o) => o.id === id)?.name ?? id
  const latestCj = rows.find((r) => r.provider === 'cj')
  const cjUnmatched = (latestCj?.details?.unmatched as Array<Record<string, unknown>> | undefined) ?? []

  const markStatus = async (row: ProviderReconciliation) => {
    const to = statusPick[row.id] ?? 'matched'
    if (!user) return
    const r = await setReconciliationStatus(row.id, to, (statusNote[row.id] ?? '').trim(), user.id)
    if (r.error) { setError(r.error); return }
    setError('')
    setNotice(`${row.provider} ${row.periodStart} marked ${to}.`)
    load()
  }

  const submitCredit = async () => {
    if (!user) return
    const amount = Number(credit.amount)
    if (!credit.affiliateId || !credit.offerId || !credit.reference.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Pick an affiliate and an offer, enter a reference and a positive USD amount.')
      return
    }
    const r = await recordProviderCredit({
      affiliateId: credit.affiliateId, offerId: credit.offerId, provider: credit.provider,
      reference: credit.reference.trim(), amount, note: credit.note.trim(), actorId: user.id,
    })
    if (r.error) { setError(r.error); return }
    const res = r.result
    if (!res) { setError('No result returned.'); return }
    if (res.amountMismatch) {
      setError(`Already recorded at $${res.existingAmount?.toFixed(2)} — requested $${res.requestedAmount?.toFixed(2)}. Nothing was recorded; decide against the provider's own record.`)
      return
    }
    if (res.duplicate) {
      setNotice(`Already recorded (${res.idempotencyKey}). No duplicate created.`)
    } else {
      setNotice('Credit recorded as pending — it goes through the normal approval flow in Conversions.')
    }
    setError('')
    setCredit({ affiliateId: '', offerId: '', provider: 'nowpayments', reference: '', amount: '', note: '' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Open reconciliations" icon="clock" value={String(openCount)} />
        <Stat label="Mismatches to decide" icon="eye" value={String(mismatches.length)} />
        <Stat label="Pending over 7 days" icon="chart" value={String(stuck.length)} />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

      <Card title="Mismatches — decide, never auto-edit">
        <p className="mb-3 text-sm text-slate-500">A mismatch means what a provider reports and what the ledger holds disagree. Mark it matched (explained by the note), mismatch (still open), or explained — and fix the money by reversing the wrong conversion and recording a fresh credit, never by editing a ledger row.</p>
        {mismatches.length === 0 ? <Empty text="No mismatches. Open rows with a zero difference are fine." /> : mismatches.map((r) => (
          <div key={r.id} className="border-b border-slate-100 py-3 text-sm last:border-0">
            <p className="font-medium">{r.provider} · {r.periodStart} → {r.periodEnd} · provider ${r.providerTotal.toFixed(2)} vs ledger ${r.ledgerTotal.toFixed(2)} · <span className="text-red-700">difference ${r.difference.toFixed(2)}</span> · {r.status}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select className={inputCls} aria-label="New status" value={statusPick[r.id] ?? 'matched'} onChange={(e) => setStatusPick((x) => ({ ...x, [r.id]: e.target.value as ProviderReconciliation['status'] }))}>
                <option value="matched">matched</option>
                <option value="mismatch">mismatch</option>
                <option value="explained">explained</option>
                <option value="open">open</option>
              </select>
              <input className={`${inputCls} min-w-48 flex-1`} placeholder="Note — what explains this?" aria-label="Status note" value={statusNote[r.id] ?? ''} onChange={(e) => setStatusNote((x) => ({ ...x, [r.id]: e.target.value }))} />
              <button className={btnCls} onClick={() => markStatus(r)}>Mark</button>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Record a provider credit by hand">
        <p className="mb-3 text-sm text-slate-500">For earnings a provider reports with no automatic postback — NOWPayments referral earnings (affiliate self-report + admin verify) and corrections. The amount is already the affiliate amount in USD; no rate math happens here. A repeat with the same reference reports as a duplicate; a repeat with a different amount records nothing. The conversion starts pending and goes through the normal approval flow.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={inputCls} aria-label="Affiliate" value={credit.affiliateId} onChange={(e) => setCredit((c) => ({ ...c, affiliateId: e.target.value }))}>
            <option value="">Affiliate…</option>
            {approvedAffiliates.map((p) => <option key={p.id} value={p.id}>{p.email}</option>)}
          </select>
          <select className={inputCls} aria-label="Offer" value={credit.offerId} onChange={(e) => setCredit((c) => ({ ...c, offerId: e.target.value }))}>
            <option value="">Offer…</option>
            {activeOffers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={inputCls} aria-label="Provider" value={credit.provider} onChange={(e) => setCredit((c) => ({ ...c, provider: e.target.value }))}>
            {RECONCILIATION_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={inputCls} placeholder="Provider reference (merchant / transaction id)" aria-label="Provider reference" value={credit.reference} onChange={(e) => setCredit((c) => ({ ...c, reference: e.target.value }))} />
          <input className={inputCls} type="number" min="0" step="0.01" placeholder="Amount (USD)" aria-label="Amount in USD" value={credit.amount} onChange={(e) => setCredit((c) => ({ ...c, amount: e.target.value }))} />
          <input className={inputCls} placeholder="Note — what was verified, and where" aria-label="Credit note" value={credit.note} onChange={(e) => setCredit((c) => ({ ...c, note: e.target.value }))} />
        </div>
        <button className={`${btnCls} mt-3`} onClick={submitCredit}>Record credit</button>
      </Card>

      <Card title="Pending over 7 days">
        {stuck.length === 0 ? <Empty text="Nothing stuck — every pending conversion is under 7 days old." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Affiliate</th><th>Offer</th><th>Amount</th></tr></thead>
            <tbody>{stuck.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-2">{c.createdAt.slice(0, 10)}</td>
                <td>{emailById.get(c.affiliateId ?? '') ?? c.affiliateCode ?? '—'}</td>
                <td>{offerName(c.offerId)}</td><td>${c.payout.toFixed(2)} {c.currency}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mt-3 text-xs text-slate-500">Approve, reject, or reverse these in Conversions — this list only surfaces them.</p>
      </Card>

      <Card title="CJ import — read-only">
        <p className="mb-3 text-sm text-slate-500">CJ has no postback: sales reconcile weekly from the Transaction Detail report, matched by sid (the click id). Approve only after CJ's 60-day locking passes. Unmatched SIDs are never auto-credited — they wait here for an admin decision.</p>
        <p className="text-sm">Script: <span className="font-mono text-xs">~/workspace/work/affilayer-cj-import-report.py</span> (dry-run by default; <span className="font-mono text-xs">--live</span> inserts)</p>
        <p className="mt-1 text-sm">Review list file: <span className="font-mono text-xs">~/workspace/work/affilayer-cj-unmatched.json</span></p>
        {cjUnmatched.length === 0 ? <p className="mt-3 text-sm text-slate-500">No unmatched SIDs on the latest CJ import.</p> : (
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Transaction</th><th>SID</th><th>Reason</th></tr></thead>
            <tbody>{cjUnmatched.map((u, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-2 font-mono">{String(u.txid ?? '—')}</td>
                <td className="font-mono">{String(u.sid ?? '—')}</td>
                <td>{String(u.reason ?? '—')}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="All reconciliation rows">
        {rows.length === 0 ? <Empty text="No reconciliation rows yet — the first CJ import or manual check creates one." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Provider</th><th>Period</th><th>Provider total</th><th>Ledger total</th><th>Difference</th><th>Status</th></tr></thead>
            <tbody>{rows.slice(0, 50).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">{r.provider}</td><td>{r.periodStart} → {r.periodEnd}</td>
                <td>${r.providerTotal.toFixed(2)}</td><td>${r.ledgerTotal.toFixed(2)}</td>
                <td className={Math.abs(r.difference) > 0.005 ? 'text-red-700' : ''}>${r.difference.toFixed(2)}</td><td>{r.status}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mt-3 text-xs text-slate-500">Daily checks run from the VM cron (reconciliation-daily.py) and the daily report flags anything new. Mobidea is dormant until activation; its receiver converts EUR to USD at the ECB daily rate at record time.</p>
      </Card>
    </div>
  )
}

export function AdminPayouts() {
  const { user } = useAuth()
  const [livePayouts, setLivePayouts] = useState<PayoutRequest[] | null>(null)
  const [npPayouts, setNpPayouts] = useState<NpPayout[]>([])
  const [custody, setCustody] = useState<Record<string, { amount: number }> | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [payBusy, setPayBusy] = useState('')
  const [verifyCodes, setVerifyCodes] = useState<Record<string, string>>({})
  useEffect(() => {
    getPayouts().then(setLivePayouts)
    getNpPayouts().then(setNpPayouts)
    getCustodyBalance().then((r) => {
      if (r.balances && typeof r.balances === 'object') setCustody(r.balances as Record<string, { amount: number }>)
    })
  }, [])
  const payouts = livePayouts ?? []
  const payable = payouts.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0)
  const npByRequest = new Map(npPayouts.map((n) => [n.payoutRequestId, n]))
  const refreshNp = () => { getNpPayouts().then(setNpPayouts); getPayouts().then(setLivePayouts) }
  const payViaNowPayments = async (p: PayoutRequest) => {
    if (!user) return
    setPayBusy(p.id)
    setError('')
    setNotice('')
    const r = await executePayout(p.id)
    setPayBusy('')
    if (r.error) { setError(r.error); return }
    setNotice(`NOWPayments payout ${String(r.batch_id ?? '')} created (${String(r.status ?? '')}).${r.auto_verified ? ' Verified automatically.' : ' Awaiting 2FA verification.'}`)
    refreshNp()
  }
  const verifyBatch = async (batchId: string) => {
    const code = (verifyCodes[batchId] ?? '').trim()
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit 2FA code.'); return }
    setError('')
    const r = await verifyPayout(batchId, code)
    if (r.error) { setError(r.error); return }
    setNotice(`Payout ${batchId} verified.`)
    refreshNp()
  }
  const refreshBatch = async (batchId: string) => {
    const r = await refreshPayoutStatus(batchId)
    if (r.error) { setError(r.error); return }
    setNotice(`Payout ${batchId} is ${String(r.status ?? '')}.`)
    refreshNp()
  }
  const release = async (p: PayoutRequest) => {
    if (!user) return
    const r = await releasePayoutReservation(p.id, user.id)
    if (r.error) { setError(r.error); return }
    setNotice(`Reservation for $${p.amount.toFixed(2)} released — the request is pending again.`)
    refreshNp()
  }
  const setStatus = async (p: PayoutRequest, status: PayoutRequest['status']) => {
    if (!user) return
    // approved = approve (reserves the ledger balance), rejected = reject,
    // paid = complete (records the settlement after money moved outside).
    const to = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'paid'
    const r = await decidePayout(p.id, to, user.id)
    if (r.error) { setError(r.error); return }
    setError('')
    getPayouts().then(setLivePayouts)
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Approved, awaiting payment" icon="banknote" value={`$${payable.toFixed(2)}`} />
        <Stat label="Payout requests" icon="ticket" value={String(payouts.length)} />
        <Stat label="NOWPayments custody (USDT)" icon="wallet" value={custody ? `${(custody.usdttrc20?.amount ?? 0).toFixed(2)} USDT` : '—'} sub="Balance available for affiliate payouts" />
      </div>
      <Card title="Payouts">
        <p className="mb-3 text-sm text-slate-500">Approving a request reserves the ledger balance but does not move money. Pay via NOWPayments sends USDT (TRC20) to the affiliate's saved wallet — the ledger settles to paid only when NOWPayments reports the payout finished. "Mark paid" is for payouts made outside NOWPayments. Bank transfer requests are paid by hand from the details shown on the request — check them, send the money yourself, then use "Mark paid".</p>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        {payouts.length === 0 ? <Empty text="No payout requests yet." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Affiliate</th><th>Amount</th><th>Method</th><th>Status</th><th>NOWPayments</th><th /></tr></thead>
            <tbody>{payouts.map((p) => {
              const np = npByRequest.get(p.id)
              return (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2">{p.createdAt.slice(0, 10)}</td><td>{p.affiliateCode}</td>
                <td>${p.amount.toFixed(2)} {p.currency}</td><td>{p.method ?? '—'}{p.method === 'Bank transfer' && p.bankDetails && (
                  <span className="mt-1 block text-xs text-slate-500">
                    {p.bankDetails.accountHolder} · {p.bankDetails.bankName} · Acct {p.bankDetails.accountNumber}
                    {p.bankDetails.branch ? ` · ${p.bankDetails.branch}` : ''}{p.bankDetails.routing ? ` · ${p.bankDetails.routing}` : ''}{p.bankDetails.country ? ` · ${p.bankDetails.country}` : ''}{p.bankDetails.currency ? ` · ${p.bankDetails.currency}` : ''}
                  </span>
                )}{p.method === 'Bank transfer' && !p.bankDetails && (
                  <span className="mt-1 block text-xs text-red-600">No bank details on this request.</span>
                )}</td><td>{p.status}</td>
                <td>{np ? (<>
                  <span className="font-mono text-xs">{np.batchId}</span> · {np.status}
                  <span className="mt-1 flex gap-2">
                    <button className={ghostCls} onClick={() => refreshBatch(np.batchId)}>Refresh</button>
                    {np.status === 'awaiting_2fa' && (<>
                      <input className={`${inputCls} w-24`} type="text" inputMode="numeric" maxLength={6} placeholder="2FA code" aria-label="2FA code" value={verifyCodes[np.batchId] ?? ''} onChange={(e) => setVerifyCodes((v) => ({ ...v, [np.batchId]: e.target.value }))} />
                      <button className={btnCls} onClick={() => verifyBatch(np.batchId)}>Verify</button>
                    </>)}
                  </span>
                </>) : '—'}</td>
                <td className="text-right">
                  <span className="flex justify-end gap-2">
                    {p.status === 'requested' && (<>
                      <button className={btnCls} onClick={() => setStatus(p, 'approved')}>Approve</button>
                      <button className={dangerCls} onClick={() => setStatus(p, 'rejected')}>Reject</button>
                    </>)}
                    {p.status === 'approved' && (<>
                      {p.method !== 'Bank transfer' && <button className={btnCls} disabled={payBusy === p.id} onClick={() => payViaNowPayments(p)}>{payBusy === p.id ? 'Paying…' : 'Pay via NOWPayments'}</button>}
                      <button className={btnCls} onClick={() => setStatus(p, 'paid')}>Mark paid</button>
                      {np && (np.status === 'rejected' || np.status === 'failed') && <button className={ghostCls} onClick={() => release(p)}>Release</button>}
                    </>)}
                  </span>
                </td>
              </tr>
            )})}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}

export function AdminCompliance() {
  const { user } = useAuth()
  const [liveProfiles, setLiveProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  useEffect(() => { getProfiles().then(setLiveProfiles) }, [])
  const profiles = liveProfiles ?? []

  const decide = async (p: Profile, to: 'approved' | 'rejected') => {
    const reason = (reasons[p.id] ?? '').trim()
    if (to === 'rejected' && !reason) { setNotice(`A reason is required to reject ${p.email}.`); return }
    if (!user) return
    const r = await decideProfile(p.id, to, user.id, `${p.email} (${p.role}) ${to}${reason ? ` — ${reason}` : ''}.`)
    if (r.error) { setError(r.error); return }
    setError('')
    setNotice(`${p.email} ${to}.`)
    setReasons((r) => { const n = { ...r }; delete n[p.id]; return n })
    getProfiles().then(setLiveProfiles)
  }

  const suspend = async (p: Profile, to: 'suspended' | 'approved') => {
    const reason = (reasons[p.id] ?? '').trim()
    if (to === 'suspended' && !reason) { setNotice(`A reason is required to suspend ${p.email}.`); return }
    if (!user) return
    const detail = `${p.email} → ${to}${reason ? ` — ${reason}` : ''}.`
    const r = await decideProfile(p.id, to === 'suspended' ? 'suspended' : 'approved', user.id, detail)
    if (r.error) { setError(r.error); return }
    setError('')
    setNotice(`${p.email} ${to === 'suspended' ? 'suspended' : 'reinstated'}.`)
    setReasons((r) => { const n = { ...r }; delete n[p.id]; return n })
    getProfiles().then(setLiveProfiles)
  }

  const pending = profiles.filter((p) => p.status === 'pending')
  const decided = profiles.filter((p) => p.status !== 'pending')
  const reasonInput = (p: Profile, placeholder: string) => (
    <input className={`${inputCls} w-full`} placeholder={placeholder} aria-label={placeholder} value={reasons[p.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))} />
  )
  return (
    <div className="space-y-4">
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Card title="KYC review queue">
        <p className="mb-3 text-sm text-slate-500">Accounts pending review cannot run offers until approved. Rejection and suspension always need a written reason, and every decision is recorded in the audit log.</p>
        {pending.length === 0 ? <Empty text="No accounts waiting for review." /> : pending.map((p) => (
          <div key={p.id} className="border-b border-slate-100 py-3 last:border-0">
            <p className="text-sm font-medium">{p.fullName ?? '—'} · {p.email} · {p.role}</p>
            <p className="mt-1 text-sm text-slate-600">
              Traffic: {p.trafficSource ?? '—'} · Vertical: {p.vertical ?? '—'} · GEO: {p.geo ?? '—'} ·
              Volume: {p.volume ?? '—'} · Payment: {p.paymentMethod ?? '—'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="min-w-48 flex-1">{reasonInput(p, 'Reason (required to reject)')}</div>
              <button className={btnCls} onClick={() => decide(p, 'approved')}>Approve</button>
              <button className={dangerCls} onClick={() => decide(p, 'rejected')}>Reject</button>
            </div>
          </div>
        ))}
      </Card>
      <Card title="Accounts">
        {decided.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
            <span>{p.fullName ?? '—'} · {p.email} · {p.role} · {p.status}{p.reviewNote ? ` — “${p.reviewNote}”` : ''}</span>
            <span className="flex gap-2">
              {p.status === 'approved' && (<>
                <div className="w-48">{reasonInput(p, 'Reason (required to suspend)')}</div>
                <button className={dangerCls} onClick={() => suspend(p, 'suspended')}>Suspend</button>
              </>)}
              {p.status === 'suspended' && <button className={ghostCls} onClick={() => suspend(p, 'approved')}>Reinstate</button>}
            </span>
          </div>
        ))}
      </Card>
      <Card title="Compliance rules">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Offer terms must state the conversion definition, payout model and traffic rules.</li>
          <li>Accounts pending review cannot run offers until approved.</li>
          <li>Fraud signals are reviewed by a person; no conversion is auto-rejected.</li>
          <li>Ledger entries are immutable; corrections are made by reversing and re-issuing, not by editing.</li>
        </ul>
      </Card>
    </div>
  )
}

export function AdminAuditLogs() {
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  useEffect(() => { getAuditLogs().then(setAuditLog) }, [])
  const entities = [...new Set(auditLog.map((e) => e.entityType).filter((t): t is string => !!t))]
  const actions = [...new Set(auditLog.map((e) => e.action))]
  const filtered = auditLog.filter(
    (e) =>
      (!entity || e.entityType === entity) &&
      (!action || e.action === action) &&
      (!q || `${e.actorId ?? ''} ${e.action} ${e.entityId ?? ''} ${e.details ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  )
  return (
    <Card title={`Audit logs (${filtered.length} of ${auditLog.length})`}>
      <p className="mb-3 text-sm text-slate-500">The network's audit trail from the database — KYC decisions, payout decisions, suspensions and other recorded actions.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={inputCls} placeholder="Search actor, action, detail…" aria-label="Search actor, action, detail" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} aria-label="Filter by entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {entities.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className={inputCls} aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? <Empty text="No audit entries match the filters." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>{filtered.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="py-2 whitespace-nowrap">{e.createdAt.slice(0, 19).replace('T', ' ')}</td>
              <td className="font-mono text-xs">{e.actorId ? `${e.actorId.slice(0, 8)}…` : '—'}</td><td className="font-mono">{e.action}</td>
              <td>{e.entityType ?? ''} <span className="font-mono text-slate-500">{e.entityId ?? ''}</span></td>
              <td>{e.details ?? ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  )
}

export function AdminSettings() {
  const s = NETWORK_SETTINGS
  const rows: [string, string][] = [
    ['Network name', s.networkName],
    ['Support email', s.supportEmail],
    ['Default currency', s.defaultCurrency],
    ['Minimum payout', `$${s.minPayout.toFixed(2)}`],
    ['Payout schedule', s.payoutSchedule],
    ['New accounts require approval', s.requireApproval ? 'Yes' : 'No'],
  ]
  return (
    <Card title="Network settings">
      <p className="mb-3 text-sm text-slate-500">These are the network's live terms. They are set in code (lib/network-settings.ts) and match the public pricing page — there is no settings table yet, so nothing here is editable in the browser.</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
      </dl>
    </Card>
  )
}

export function AdminDeposits() {
  const { user } = useAuth()
  const [deposits, setDeposits] = useState<AdvertiserDeposit[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = () => { getAllDeposits().then(setDeposits) }
  useEffect(() => { load() }, [])
  const credit = async (d: AdvertiserDeposit) => {
    const value = Number(amounts[d.id])
    if (!Number.isFinite(value) || value <= 0) { setError('Enter the USD amount actually received — read it off the NOWPayments dashboard, never guess.'); return }
    if (!user) return
    const r = await creditDepositManually(d.id, value, user.id)
    if (r.error) { setError(r.error); return }
    setError('')
    setNotice(`Deposit credited $${value.toFixed(2)}.`)
    load()
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Deposits" icon="wallet" value={String(deposits.length)} />
        <Stat label="Waiting / partial" icon="clock" value={String(deposits.filter((d) => d.status === 'waiting' || d.status === 'partially_paid').length)} />
        <Stat label="Credited (USD)" icon="banknote" value={`$${deposits.filter((d) => d.status === 'finished').reduce((sum, d) => sum + d.amountUsd, 0).toFixed(2)}`} />
      </div>
      <Card title="Advertiser deposits">
        <p className="mb-3 text-sm text-slate-500">Deposits credit automatically when NOWPayments confirms a full payment. A partially-paid deposit can be credited manually here — enter the USD amount actually received, read off the NOWPayments dashboard.</p>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        {deposits.length === 0 ? <Empty text="No deposits yet." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Advertiser</th><th>Amount</th><th>Paid in</th><th>Status</th><th>Invoice</th><th /></tr></thead>
            <tbody>{deposits.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="py-2">{d.createdAt.slice(0, 10)}</td>
                <td className="font-mono text-xs">{d.advertiserId.slice(0, 8)}…</td>
                <td>${d.amountUsd.toFixed(2)} {d.currency}</td>
                <td>{d.npPayCurrency ? `${d.npPayAmount ?? ''} ${d.npPayCurrency}` : '—'}</td>
                <td>{d.status}{d.adminNote ? ` — ${d.adminNote}` : ''}</td>
                <td className="font-mono text-xs">{d.npInvoiceId ?? '—'}</td>
                <td className="text-right">
                  {(d.status === 'waiting' || d.status === 'partially_paid') && (
                    <span className="flex justify-end gap-2">
                      <input className={`${inputCls} w-28`} type="number" min="0" step="0.01" placeholder="USD received" aria-label="USD amount received" value={amounts[d.id] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [d.id]: e.target.value }))} />
                      <button className={btnCls} onClick={() => credit(d)}>Credit manually</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}

export function AdminTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [error, setError] = useState('')
  const load = () => { getTickets().then(setTickets) }
  useEffect(() => { load() }, [])
  const advance = async (t: SupportTicket) => {
    if (t.status === 'closed' || !supabase) return
    const next = t.status === 'open' ? 'in_progress' : 'closed'
    const { error: e } = await supabase.from('support_tickets').update({ status: next }).eq('id', t.id)
    if (e) { setError(e.message); return }
    setError('')
    load()
  }
  return (
    <Card title="Support tickets">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {tickets.length === 0 ? <Empty text="No tickets yet." /> : tickets.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
          <div>
            <p className="font-medium">{t.subject} <span className="ml-2 text-slate-500">· {t.status}</span></p>
            <p className="text-slate-600">{t.message}</p>
          </div>
          {t.status !== 'closed' && (
            <button className={ghostCls} onClick={() => advance(t)}>
              {t.status === 'open' ? 'Start handling' : 'Close'}
            </button>
          )}
        </div>
      ))}
    </Card>
  )
}
