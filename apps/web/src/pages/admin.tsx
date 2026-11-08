import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Card, Empty, Stat } from '../components/layout'
import { BarChart } from '../components/charts'
import { decideConversion, decidePayout, decideProfile, getClicks, getConversions, getNpPayouts, getPayouts, getProfiles, getStats, isDemoMode, releasePayoutReservation } from '../lib/data'
import { executePayout, getCustodyBalance, refreshPayoutStatus, verifyPayout } from '../lib/payments'
import { demoDailySeries } from '../lib/demo-data'
import { logAudit, newId, resetDemo, updateDemo, useDemoState } from '../lib/demo-store'
import type { NetworkSettings } from '../lib/demo-store'
import { detectFraudSignals, ledgerTransition } from '@affilayer/shared'
import { useAuth } from '../lib/auth'
import type { Campaign, Conversion, NpPayout, Offer, PayoutRequest, Profile } from '../lib/types'

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900'
const btnCls = 'rounded-lg bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 px-3 py-2.5 text-sm font-semibold text-[#0B1220] disabled:opacity-50'
const ghostCls = 'rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const dangerCls = 'rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50'

export function AdminOverview() {
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, approved: 0, pending: 0, revenue: 0 })
  const { profiles } = useDemoState()
  useEffect(() => { getStats().then(setStats) }, [])
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={String(profiles.length)} icon="users" />
        <Stat label="Clicks" value={String(stats.clicks)} icon="chart" />
        <Stat label="Conversions" value={String(stats.conversions)} icon="check" />
        <Stat label="Pending conversions" value={String(stats.pending)} icon="clock" />
      </div>
      <Card title="Clicks — last 7 days (demo sample)"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></Card>
    </div>
  )
}

function ProfilesTable({ filter }: { filter?: (p: Profile) => boolean }) {
  const { profiles } = useDemoState()
  const list = filter ? profiles.filter(filter) : profiles
  return (
    <Card title="Users">
      {list.length === 0 ? <Empty text="No users match." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.fullName ?? '—'}</td><td>{p.email}</td><td>{p.role}</td><td>{p.status}</td></tr>)}</tbody>
        </table></div>
      )}
      <p className="mt-3 text-xs text-slate-400">Approvals, rejections and suspensions are handled in Compliance → KYC review. This table is read-only.</p>
    </Card>
  )
}

export function AdminUsers() { return <ProfilesTable /> }
export function AdminAffiliates() { return <ProfilesTable filter={(p) => p.role === 'affiliate'} /> }
export function AdminAdvertisers() { return <ProfilesTable filter={(p) => p.role === 'advertiser'} /> }

export function AdminOffers() {
  const { user } = useAuth()
  const { offers } = useDemoState()
  const actor = user?.email ?? 'admin'
  const toggle = (o: Offer) => {
    const next = o.status === 'active' ? 'paused' : 'active'
    updateDemo((s) => { const t = s.offers.find((x) => x.id === o.id); if (t) t.status = next })
    logAudit(actor, `offer.${next === 'paused' ? 'pause' : 'resume'}`, 'offer', o.id, `${o.name} → ${next}`)
  }
  return (
    <Card title="Offers">
      {offers.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
          <span>{o.name} — {o.vertical}</span>
          <span className="flex items-center gap-2">
            <span>{o.status} · {o.payoutModel} ${o.payout} {o.currency}</span>
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
  const { user } = useAuth()
  const { campaigns, profiles } = useDemoState()
  const actor = user?.email ?? 'admin'
  const advertisers = profiles.filter((p) => p.role === 'advertiser')
  const [form, setForm] = useState({ name: '', description: '', advertiserId: '', budget: '', currency: 'USD' })
  const [editBudget, setEditBudget] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  const setStatus = (c: Campaign, status: (typeof CAMPAIGN_STATUSES)[number]) => {
    updateDemo((s) => { const t = s.campaigns.find((x) => x.id === c.id); if (t) t.status = status })
    logAudit(actor, `campaign.${status}`, 'campaign', c.id, `${c.name} → ${status}`)
    setNotice(`${c.name} is now ${status}.`)
  }

  const saveBudget = (c: Campaign) => {
    const raw = editBudget[c.id]
    if (raw === undefined) return
    const budget = Number(raw)
    if (!Number.isFinite(budget) || budget < 0) { setNotice('Budget must be a number of 0 or more.'); return }
    updateDemo((s) => { const t = s.campaigns.find((x) => x.id === c.id); if (t) t.budget = budget })
    logAudit(actor, 'campaign.budget', 'campaign', c.id, `${c.name} budget set to $${budget}`)
    setNotice(`Budget for ${c.name} saved.`)
    setEditBudget((e) => { const n = { ...e }; delete n[c.id]; return n })
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setNotice('Campaign name is required.'); return }
    if (!form.advertiserId) { setNotice('Choose an advertiser.'); return }
    const budget = form.budget === '' ? undefined : Number(form.budget)
    if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) { setNotice('Budget must be a number of 0 or more.'); return }
    const campaign: Campaign = {
      id: newId('camp'), name: form.name.trim(), description: form.description.trim() || undefined,
      advertiserId: form.advertiserId, status: 'active', budget, currency: form.currency,
      createdAt: new Date().toISOString(),
    }
    updateDemo((s) => { s.campaigns.unshift(campaign) })
    logAudit(actor, 'campaign.create', 'campaign', campaign.id, `${campaign.name} created for ${campaign.advertiserId} (budget $${budget ?? '—'} ${campaign.currency}).`)
    setForm({ name: '', description: '', advertiserId: '', budget: '', currency: 'USD' })
    setNotice(`Campaign "${campaign.name}" created.`)
  }

  const advName = (id: string) => profiles.find((p) => p.id === id)?.email ?? id
  return (
    <div className="space-y-4">
      <Card title="Create campaign">
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium">Name</label><input className={`${inputCls} w-full`} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="mb-1 block text-sm font-medium">Advertiser</label>
              <select className={`${inputCls} w-full`} required value={form.advertiserId} onChange={(e) => setForm((f) => ({ ...f, advertiserId: e.target.value }))}>
                <option value="">Select…</option>
                {advertisers.map((a) => <option key={a.id} value={a.id}>{a.fullName ?? a.email}</option>)}
              </select>
            </div>
            <div><label className="mb-1 block text-sm font-medium">Budget</label><input className={`${inputCls} w-full`} type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} /></div>
            <div><label className="mb-1 block text-sm font-medium">Currency</label>
              <select className={`${inputCls} w-full`} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                {['USD', 'EUR', 'GBP', 'BDT'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div><label className="mb-1 block text-sm font-medium">Description</label><input className={`${inputCls} w-full`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <button className={btnCls}>Create campaign</button>
          {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
        </form>
      </Card>
      <Card title="Campaigns">
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
  const { conversions: demoConversions } = useDemoState()
  const [liveConversions, setLiveConversions] = useState<Conversion[] | null>(null)
  const [error, setError] = useState('')
  const actor = user?.email ?? 'admin'
  // Supabase mode reads live rows; demo mode reads the demo store.
  useEffect(() => { if (!isDemoMode) getConversions().then(setLiveConversions) }, [])
  const conversions = isDemoMode ? demoConversions : (liveConversions ?? [])
  const decide = async (id: string, to: 'approved' | 'rejected') => {
    const conv = conversions.find((c) => c.id === id)
    if (!conv || !ledgerTransition(conv.status, to)) return
    if (isDemoMode) {
      updateDemo((s) => { const t = s.conversions.find((x) => x.id === id); if (t) t.status = to })
      logAudit(actor, `conversion.${to}`, 'conversion', id, `Conversion ${id} ${to} (payout $${conv.payout.toFixed(2)} ${conv.currency}).`)
      return
    }
    if (!user) return
    const r = await decideConversion(id, to, user.id)
    if (r.error) { setError(r.error); return }
    setError('')
    getConversions().then(setLiveConversions)
  }
  return (
    <Card title="Conversions">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {conversions.length === 0 ? <Empty text="No conversions yet." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Click ID</th><th>Offer</th><th>Affiliate</th><th>Payout</th><th>Status</th><th /></tr></thead>
          <tbody>{conversions.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="py-2">{c.createdAt.slice(0, 10)}</td><td className="font-mono">{c.clickId ?? '—'}</td>
              <td>{c.offerId}</td><td>{c.affiliateCode ?? '—'}</td><td>${c.payout.toFixed(2)}</td><td>{c.status}</td>
              <td className="text-right">
                {c.status === 'pending' && (
                  <span className="flex justify-end gap-2">
                    <button className={btnCls} onClick={() => decide(c.id, 'approved')}>Approve</button>
                    <button className={dangerCls} onClick={() => decide(c.id, 'rejected')}>Reject</button>
                  </span>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="mt-3 text-xs text-slate-400">Approvals follow the ledger state machine (pending → approved / rejected). Approved conversions can be reversed later; rejected ones are terminal.</p>
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
      {signals.length > 50 && <p className="mt-2 text-xs text-slate-400">Showing 50 of {signals.length} signals.</p>}
    </Card>
  )
}

export function AdminLedger() {
  const [convs, setConvs] = useState<Awaited<ReturnType<typeof getConversions>>>([])
  useEffect(() => { getConversions().then(setConvs) }, [])
  return (
    <Card title="Commission ledger">
      <p className="mb-3 text-sm text-slate-500">Append-only ledger (immutable trigger in the database). Entries mirror conversion status: pending → approved → reversed.</p>
      {convs.length === 0 ? <Empty text="No ledger entries yet." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Conversion</th><th>Affiliate</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2 font-mono">{c.id}</td><td>{c.affiliateCode ?? '—'}</td><td>${c.payout.toFixed(2)} {c.currency}</td><td>{c.status}</td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  )
}

export function AdminPayouts() {
  const { user } = useAuth()
  const { payouts: demoPayouts } = useDemoState()
  const [livePayouts, setLivePayouts] = useState<PayoutRequest[] | null>(null)
  const [npPayouts, setNpPayouts] = useState<NpPayout[]>([])
  const [custody, setCustody] = useState<Record<string, { amount: number }> | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [payBusy, setPayBusy] = useState('')
  const [verifyCodes, setVerifyCodes] = useState<Record<string, string>>({})
  const actor = user?.email ?? 'admin'
  // Supabase mode reads live rows; demo mode reads the demo store.
  useEffect(() => {
    if (isDemoMode) return
    getPayouts().then(setLivePayouts)
    getNpPayouts().then(setNpPayouts)
    getCustodyBalance().then((r) => {
      if (r.balances && typeof r.balances === 'object') setCustody(r.balances as Record<string, { amount: number }>)
    })
  }, [])
  const payouts = isDemoMode ? demoPayouts : (livePayouts ?? [])
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
    if (isDemoMode) {
      updateDemo((s) => { const t = s.payouts.find((x) => x.id === p.id); if (t) t.status = status })
      logAudit(actor, `payout.${status}`, 'payout', p.id, `Payout $${p.amount.toFixed(2)} ${p.currency} to ${p.affiliateCode} → ${status}.`)
      return
    }
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
        <p className="mb-3 text-sm text-slate-500">Approving a request reserves the ledger balance but does not move money. Pay via NOWPayments sends USDT (TRC20) to the affiliate's saved wallet — the ledger settles to paid only when NOWPayments reports the payout finished. "Mark paid" is for payouts made outside NOWPayments.</p>
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
                <td>${p.amount.toFixed(2)} {p.currency}</td><td>{p.method ?? '—'}</td><td>{p.status}</td>
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
                    {p.status === 'approved' && !isDemoMode && (<>
                      <button className={btnCls} disabled={payBusy === p.id} onClick={() => payViaNowPayments(p)}>{payBusy === p.id ? 'Paying…' : 'Pay via NOWPayments'}</button>
                      <button className={btnCls} onClick={() => setStatus(p, 'paid')}>Mark paid</button>
                      {np && (np.status === 'rejected' || np.status === 'failed') && <button className={ghostCls} onClick={() => release(p)}>Release</button>}
                    </>)}
                    {p.status === 'approved' && isDemoMode && <button className={btnCls} onClick={() => setStatus(p, 'paid')}>Mark paid</button>}
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
  const { profiles: demoProfiles } = useDemoState()
  const [liveProfiles, setLiveProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState('')
  const actor = user?.email ?? 'admin'
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  // Supabase mode reads live rows; demo mode reads the demo store.
  useEffect(() => { if (!isDemoMode) getProfiles().then(setLiveProfiles) }, [])
  const profiles = isDemoMode ? demoProfiles : (liveProfiles ?? [])

  const decide = async (p: Profile, to: 'approved' | 'rejected') => {
    const reason = (reasons[p.id] ?? '').trim()
    if (to === 'rejected' && !reason) { setNotice(`A reason is required to reject ${p.email}.`); return }
    if (isDemoMode) {
      updateDemo((s) => {
        const t = s.profiles.find((x) => x.id === p.id)
        if (t) { t.status = to; t.reviewNote = reason || undefined }
      })
      logAudit(actor, `kyc.${to}`, 'profile', p.id, `${p.email} (${p.role}) ${to}${reason ? ` — ${reason}` : ''}.`)
      setNotice(`${p.email} ${to}.`)
      setReasons((r) => { const n = { ...r }; delete n[p.id]; return n })
      return
    }
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
    if (isDemoMode) {
      updateDemo((s) => {
        const t = s.profiles.find((x) => x.id === p.id)
        if (t) { t.status = to; t.reviewNote = reason || undefined }
      })
      logAudit(actor, to === 'suspended' ? 'account.suspend' : 'account.unsuspend', 'profile', p.id, `${p.email} → ${to}${reason ? ` — ${reason}` : ''}.`)
      setNotice(`${p.email} ${to === 'suspended' ? 'suspended' : 'reinstated'}.`)
      setReasons((r) => { const n = { ...r }; delete n[p.id]; return n })
      return
    }
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
  const { auditLog } = useDemoState()
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const entities = [...new Set(auditLog.map((e) => e.entityType))]
  const actions = [...new Set(auditLog.map((e) => e.action))]
  const filtered = auditLog.filter(
    (e) =>
      (!entity || e.entityType === entity) &&
      (!action || e.action === action) &&
      (!q || `${e.actor} ${e.action} ${e.entityId} ${e.detail}`.toLowerCase().includes(q.toLowerCase())),
  )
  return (
    <Card title={`Audit logs (${filtered.length} of ${auditLog.length})`}>
      <p className="mb-3 text-sm text-slate-500">Every action taken in this demo session is recorded here — offer and campaign changes, KYC decisions, payout decisions, suspensions. In a live deployment these entries come from the database audit table instead.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={inputCls} placeholder="Search actor, action, detail…" aria-label="Search actor, action, detail" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {entities.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? <Empty text="No audit entries match the filters." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>{filtered.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="py-2 whitespace-nowrap">{e.timestamp.slice(0, 19).replace('T', ' ')}</td>
              <td>{e.actor}</td><td className="font-mono">{e.action}</td>
              <td>{e.entityType} <span className="font-mono text-slate-500">{e.entityId}</span></td>
              <td>{e.detail}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  )
}

export function AdminSettings() {
  const { settings } = useDemoState()
  const { user } = useAuth()
  const actor = user?.email ?? 'admin'
  const [form, setForm] = useState<NetworkSettings>(settings)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  // Refresh the form if settings change elsewhere (e.g. after a reset).
  useEffect(() => { setForm(settings) }, [settings])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: string[] = []
    if (!form.networkName.trim()) errs.push('Network name is required.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.supportEmail.trim())) errs.push('Support email must be a valid email address.')
    if (!['USD', 'EUR', 'GBP', 'BDT'].includes(form.defaultCurrency)) errs.push('Default currency must be USD, EUR, GBP or BDT.')
    if (!Number.isFinite(form.minPayout) || form.minPayout < 0) errs.push('Minimum payout must be 0 or more.')
    if (!Number.isInteger(form.payoutDay) || form.payoutDay < 1 || form.payoutDay > 28) errs.push('Payout day must be a whole day from 1 to 28.')
    if (!form.payoutSchedule.trim()) errs.push('Payout schedule is required.')
    setErrors(errs)
    if (errs.length > 0) { setSaved(false); return }
    const next: NetworkSettings = { ...form, networkName: form.networkName.trim(), supportEmail: form.supportEmail.trim(), payoutSchedule: form.payoutSchedule.trim() }
    updateDemo((s) => { s.settings = next })
    logAudit(actor, 'settings.update', 'settings', 'network', `Network settings saved (currency ${next.defaultCurrency}, min payout $${next.minPayout}, payout day ${next.payoutDay}).`)
    setSaved(true)
  }

  const set = <K extends keyof NetworkSettings>(k: K) => (e: { target: { value: string; checked?: boolean } }) =>
    setForm((f) => ({ ...f, [k]: k === 'requireApproval' ? Boolean(e.target.checked) : e.target.value } as NetworkSettings))

  return (
    <div className="space-y-4">
      <Card title="Network settings">
        <form onSubmit={submit} className="space-y-3">
          {errors.length > 0 && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errors.map((x) => <p key={x}>{x}</p>)}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium">Network name</label><input className={`${inputCls} w-full`} value={form.networkName} onChange={set('networkName')} /></div>
            <div><label className="mb-1 block text-sm font-medium">Support email</label><input className={`${inputCls} w-full`} type="email" value={form.supportEmail} onChange={set('supportEmail')} /></div>
            <div><label className="mb-1 block text-sm font-medium">Default currency</label>
              <select className={`${inputCls} w-full`} value={form.defaultCurrency} onChange={set('defaultCurrency')}>
                {['USD', 'EUR', 'GBP', 'BDT'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="mb-1 block text-sm font-medium">Minimum payout (in default currency)</label><input className={`${inputCls} w-full`} type="number" min="0" step="0.01" value={form.minPayout} onChange={(e) => setForm((f) => ({ ...f, minPayout: Number(e.target.value) }))} /></div>
            <div><label className="mb-1 block text-sm font-medium">Payout day of month (1–28)</label><input className={`${inputCls} w-full`} type="number" min="1" max="28" step="1" value={form.payoutDay} onChange={(e) => setForm((f) => ({ ...f, payoutDay: Number(e.target.value) }))} /></div>
            <div><label className="mb-1 block text-sm font-medium">Payout schedule</label><input className={`${inputCls} w-full`} value={form.payoutSchedule} onChange={set('payoutSchedule')} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requireApproval} onChange={set('requireApproval')} /> New accounts require approval before they can run offers</label>
          <button className={btnCls}>Save settings</button>
          {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Settings saved (demo mode: stored in this browser only).</p>}
          <p className="text-xs text-slate-400">Where these apply in demo mode: the minimum payout is enforced on affiliate payout requests, and the default currency pre-fills new offers. The support email is shown on the contact page in a live deployment.</p>
        </form>
      </Card>
      <Card title="Demo data">
        <p className="text-sm text-slate-600">Reset all demo changes (offers, campaigns, payouts, tickets, audit log, settings) back to the built-in sample data.</p>
        <button
          className={`${dangerCls} mt-3`}
          onClick={() => { if (window.confirm('Reset all demo data to the built-in sample? This cannot be undone.')) resetDemo() }}
        >Reset demo data</button>
      </Card>
    </div>
  )
}

export function AdminTickets() {
  const { user } = useAuth()
  const { tickets } = useDemoState()
  const actor = user?.email ?? 'admin'
  const advance = (id: string) => {
    const t = tickets.find((x) => x.id === id)
    if (!t) return
    const next = t.status === 'open' ? 'in_progress' : t.status === 'in_progress' ? 'closed' : 'closed'
    if (t.status === 'closed') return
    updateDemo((s) => { const x = s.tickets.find((y) => y.id === id); if (x) x.status = next })
    logAudit(actor, `ticket.${next}`, 'ticket', id, `Ticket "${t.subject}" → ${next}.`)
  }
  return (
    <Card title="Support tickets">
      {tickets.length === 0 ? <Empty text="No tickets yet." /> : tickets.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
          <div>
            <p className="font-medium">{t.subject} <span className="ml-2 text-slate-500">· {t.status}</span></p>
            <p className="text-slate-600">{t.message}</p>
          </div>
          {t.status !== 'closed' && (
            <button className={ghostCls} onClick={() => advance(t.id)}>
              {t.status === 'open' ? 'Start handling' : 'Close'}
            </button>
          )}
        </div>
      ))}
    </Card>
  )
}
