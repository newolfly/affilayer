import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Empty, FirstSteps, Stat } from '../components/layout'
import { BarChart, LineChart } from '../components/charts'
import { useAuth } from '../lib/auth'
import { getClicks, getConversions, getMyAffiliateProfile, getOffers, getPayouts, getStats, isDemoMode, requestPayout } from '../lib/data'
import type { ReportFilters } from '../lib/data'
import { demoDailySeries } from '../lib/demo-data'
import { DEFAULT_SETTINGS, logAudit, newId, updateDemo, useDemoState } from '../lib/demo-store'
import { trackingLink } from '../lib/tracking'
import type { Click, Conversion, Offer, PayoutRequest } from '../lib/types'

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900'
const btnCls = 'rounded-lg bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-[#0B1220]'

function useLoad<T>(fn: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    fn().then((d) => { if (alive) { setData(d); setLoading(false) } }).catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])
  return { data, loading }
}

export function AffiliateDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, epc: 0, cr: 0 })
  const [offers, setOffers] = useState<Offer[]>([])
  useEffect(() => {
    getStats({ affiliateCode: user?.affiliateCode }).then((s) => setStats(s))
    getOffers().then(setOffers)
  }, [user?.affiliateCode])
  return (
    <div className="space-y-4">
      <FirstSteps role="affiliate" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clicks" value={String(stats.clicks)} icon="chart" />
        <Stat label="Conversions" value={String(stats.conversions)} icon="check" />
        <Stat label="Approved" value={String(stats.approved)} icon="shield" />
        <Stat label="Revenue" value={`$${stats.revenue.toFixed(2)}`} sub={`EPC $${stats.epc.toFixed(2)} · CR ${(stats.cr * 100).toFixed(1)}%`} icon="wallet" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Clicks — last 7 days (demo sample)"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></Card>
        <Card title="Conversions — last 7 days (demo sample)"><LineChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.conversions }))} /></Card>
      </div>
      <Card title="Active offers">
        {offers.filter((o) => o.status === 'active').map((o) => (
          <div key={o.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
            <span>{o.name} — {o.payoutModel} ${o.payout} {o.currency}</span>
            <Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-amber-700">View →</Link>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function AffiliateOffers() {
  const { data: offers } = useLoad(getOffers, [] as Offer[])
  const [q, setQ] = useState('')
  const [vertical, setVertical] = useState('')
  const filtered = offers.filter((o) => (!q || o.name.toLowerCase().includes(q.toLowerCase())) && (!vertical || o.vertical === vertical))
  return (
    <Card title="Offers">
      <div className="mb-4 flex gap-2">
        <input className={inputCls} placeholder="Search offers…" aria-label="Search offers" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={vertical} onChange={(e) => setVertical(e.target.value)}>
          <option value="">All verticals</option>
          {[...new Set(offers.map((o) => o.vertical))].map((v) => <option key={v}>{v}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? <Empty text="No offers match your filters." /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Offer</th><th>Vertical</th><th>Payout</th><th>GEO</th><th>Status</th><th /></tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{o.name}</td><td>{o.vertical}</td>
                <td>{o.payoutModel} ${o.payout} {o.currency}</td><td>{(o.countries ?? []).join(', ')}</td><td>{o.status}</td>
                <td><Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-amber-700">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

export function AffiliateOfferDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { applications } = useDemoState()
  const [offer, setOffer] = useState<Offer | undefined>()
  const code = user?.affiliateCode ?? 'AFF-DEMO-001'
  useEffect(() => { if (id) getOffers().then((os) => setOffer(os.find((o) => o.id === id))) }, [id])
  if (!offer) return <Card><Empty text="Offer not found." /></Card>
  const applied = applications.some((a) => a.offerId === offer.id && a.affiliateCode === code)
  const apply = () => {
    updateDemo((s) => {
      s.applications.push({ id: newId('app'), offerId: offer.id, affiliateCode: code, status: offer.approvalRequired ? 'pending' : 'approved', createdAt: new Date().toISOString() })
    })
    logAudit(user?.email ?? code, 'offer.apply', 'offer', offer.id, `${code} applied to "${offer.name}"${offer.approvalRequired ? ' (needs approval)' : ' (auto-approved)'}.`)
  }
  return (
    <Card title={offer.name}>
      <p className="text-sm text-slate-600">{offer.description}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Vertical</dt><dd>{offer.vertical}</dd></div>
        <div><dt className="text-slate-500">Conversion</dt><dd>{offer.conversionType}</dd></div>
        <div><dt className="text-slate-500">Payout</dt><dd>{offer.payoutModel} ${offer.payout} {offer.currency}</dd></div>
        <div><dt className="text-slate-500">Countries</dt><dd>{(offer.countries ?? []).join(', ')}</dd></div>
        <div><dt className="text-slate-500">Devices</dt><dd>{(offer.devices ?? []).join(', ')}</dd></div>
        <div><dt className="text-slate-500">Traffic sources</dt><dd>{(offer.trafficSources ?? []).join(', ')}</dd></div>
        <div><dt className="text-slate-500">Caps</dt><dd>Daily {offer.capDaily ?? '—'} · Total {offer.capTotal ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Approval required</dt><dd>{offer.approvalRequired ? 'Yes' : 'No'}</dd></div>
        <div><dt className="text-slate-500">Landing URL</dt><dd className="break-all">{offer.landingUrl}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd>{offer.status}</dd></div>
      </dl>
      {applied
        ? <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Application submitted. You will be notified when the advertiser reviews it.</p>
        : <button className={`${btnCls} mt-4`} onClick={apply}>{offer.approvalRequired ? 'Apply for this offer' : 'Join this offer'}</button>}
      <Link to="/app/affiliate/tracking-links" className="ml-3 text-sm font-semibold text-amber-700">Generate tracking link →</Link>
    </Card>
  )
}

export function AffiliateMyCampaigns() {
  const { data: offers } = useLoad(getOffers, [] as Offer[])
  const approved = offers.filter((o) => o.status === 'active')
  return (
    <Card title="My campaigns">
      <p className="mb-3 text-sm text-slate-500">Offers you have joined or been approved for. In demo mode this lists active offers as a sample.</p>
      {approved.length === 0 ? <Empty text="No campaigns yet. Browse offers and apply." /> : approved.map((o) => (
        <div key={o.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
          <span>{o.name} — {o.payoutModel} ${o.payout} {o.currency}</span>
          <Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-amber-700">View</Link>
        </div>
      ))}
    </Card>
  )
}

export function AffiliateTrackingLinks() {
  const { user } = useAuth()
  const { data: offers } = useLoad(getOffers, [] as Offer[])
  const [offerId, setOfferId] = useState('')
  const [subs, setSubs] = useState({ sub1: '', sub2: '', sub3: '', sub4: '', sub5: '' })
  const code = user?.affiliateCode ?? 'AFF-DEMO-001'
  const url = useMemo(
    () => (offerId ? trackingLink(code, offerId, subs) : ''),
    [offerId, code, subs],
  )
  const [copied, setCopied] = useState(false)
  return (
    <Card title="Tracking link generator">
      <p className="mb-4 text-sm text-slate-500">Links use the tracking service: <code>{'{TRACKING_URL}'}/c/{'{affiliate_code}'}/{'{offer_id}'}</code> with optional sub1–sub5 parameters.</p>
      <div className="space-y-3">
        <div><label className="mb-1 block text-sm font-medium">Offer</label>
          <select className={`${inputCls} w-full`} value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            <option value="">Select an offer…</option>
            {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-5">
          {(Object.keys(subs) as (keyof typeof subs)[]).map((k) => (
            <input key={k} className={inputCls} placeholder={k} aria-label={k} value={subs[k]} onChange={(e) => setSubs((s) => ({ ...s, [k]: e.target.value }))} />
          ))}
        </div>
        {url && (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="break-all text-sm font-mono">{url}</p>
            <button className={`${btnCls} mt-3`} onClick={() => { navigator.clipboard?.writeText(url).catch(() => undefined); setCopied(true) }}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        )}
      </div>
    </Card>
  )
}

export function ReportFiltersForm({ filters, setFilters }: { filters: ReportFilters; setFilters: (f: ReportFilters) => void }) {
  const { data: offers } = useLoad(getOffers, [] as Offer[])
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <input type="date" className={inputCls} value={filters.from ?? ''} onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} aria-label="From date" />
      <input type="date" className={inputCls} value={filters.to ?? ''} onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} aria-label="To date" />
      <select className={inputCls} value={filters.offerId ?? ''} onChange={(e) => setFilters({ ...filters, offerId: e.target.value || undefined })}>
        <option value="">All offers</option>
        {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select className={inputCls} value={filters.country ?? ''} onChange={(e) => setFilters({ ...filters, country: e.target.value || undefined })}>
        <option value="">All countries</option>{['US', 'GB', 'CA', 'DE', 'FR'].map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className={inputCls} value={filters.device ?? ''} onChange={(e) => setFilters({ ...filters, device: e.target.value || undefined })}>
        <option value="">All devices</option>{['desktop', 'mobile', 'tablet'].map((d) => <option key={d}>{d}</option>)}
      </select>
      <select className={inputCls} value={filters.source ?? ''} onChange={(e) => setFilters({ ...filters, source: e.target.value || undefined })}>
        <option value="">All sources</option>{['SEO', 'Social', 'Email', 'PPC', 'Content'].map((s) => <option key={s}>{s}</option>)}
      </select>
    </div>
  )
}

export function AffiliateReports() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<ReportFilters>({ affiliateCode: user?.affiliateCode })
  const [clicks, setClicks] = useState<Click[]>([])
  const [convs, setConvs] = useState<Conversion[]>([])
  useEffect(() => {
    getClicks(filters).then(setClicks)
    getConversions(filters).then(setConvs)
  }, [filters])
  const byOffer = useMemo(() => {
    const m = new Map<string, { clicks: number; convs: number }>()
    clicks.forEach((c) => m.set(c.offerId, { clicks: (m.get(c.offerId)?.clicks ?? 0) + 1, convs: m.get(c.offerId)?.convs ?? 0 }))
    convs.forEach((c) => m.set(c.offerId, { clicks: m.get(c.offerId)?.clicks ?? 0, convs: (m.get(c.offerId)?.convs ?? 0) + 1 }))
    return [...m.entries()]
  }, [clicks, convs])
  return (
    <div className="space-y-4">
      <Card title="Reports">
        <ReportFiltersForm filters={filters} setFilters={setFilters} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Clicks" value={String(clicks.length)} icon="chart" />
          <Stat label="Conversions" value={String(convs.length)} icon="check" />
          <Stat label="Approved revenue" value={`$${convs.filter((c) => c.status === 'approved').reduce((s, c) => s + c.payout, 0).toFixed(2)}`} icon="wallet" />
        </div>
      </Card>
      <Card title="By offer">
        {byOffer.length === 0 ? <Empty text="No data for the selected filters." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Offer</th><th>Clicks</th><th>Conversions</th></tr></thead>
            <tbody>{byOffer.map(([id, v]) => <tr key={id} className="border-t border-slate-100"><td className="py-2">{id}</td><td>{v.clicks}</td><td>{v.convs}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
      <Card title="Clicks"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></Card>
    </div>
  )
}

export function AffiliatePostbacks() {
  const { user } = useAuth()
  const { postbacks } = useDemoState()
  const code = user?.affiliateCode ?? 'AFF-DEMO-001'
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const mine = postbacks.filter((p) => p.affiliateCode === code)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    let parsed: URL
    try { parsed = new URL(url.trim()) } catch { setError('Enter a valid URL starting with http:// or https://.'); return }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') { setError('Postback URL must start with http:// or https://.'); return }
    updateDemo((s) => { s.postbacks.push({ id: newId('pb'), affiliateCode: code, url: url.trim(), createdAt: new Date().toISOString() }) })
    logAudit(user?.email ?? code, 'postback.save', 'postback', code, `Postback URL registered for ${code}.`)
    setUrl('')
    setError('')
    setSaved(true)
  }
  return (
    <Card title="Postbacks">
      <p className="mb-3 text-sm text-slate-500">Register a postback URL. Supported macros: {'{click_id}'} {'{conversion_id}'} {'{payout}'} {'{currency}'} {'{status}'} {'{sub1}'}. The tracking service calls it when a conversion is recorded.</p>
      <form onSubmit={submit} className="flex gap-2">
        <input className={`${inputCls} flex-1`} type="url" required placeholder="https://example.com/postback?click_id={click_id}&payout={payout}" aria-label="Postback URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className={btnCls}>Save</button>
      </form>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Postback saved (demo mode: stored in this browser only).</p>}
      {mine.length === 0 ? <p className="mt-4 text-sm text-slate-500">No postbacks configured.</p> : mine.map((u) => <p key={u.id} className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm font-mono">{u.url}</p>)}
      <p className="mt-4 text-xs text-slate-400">Demo mode: postbacks are stored locally only and are not sent anywhere.</p>
    </Card>
  )
}

export function AffiliateEarnings() {
  const { data: convs } = useLoad(() => getConversions(), [] as Conversion[])
  const approved = convs.filter((c) => c.status === 'approved')
  const pending = convs.filter((c) => c.status === 'pending')
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Approved earnings" icon="wallet" value={`$${approved.reduce((s, c) => s + c.payout, 0).toFixed(2)}`} />
        <Stat label="Pending" value={`$${pending.reduce((s, c) => s + c.payout, 0).toFixed(2)}`} icon="clock" />
        <Stat label="Rejected / reversed" value={String(convs.filter((c) => c.status === 'rejected' || c.status === 'reversed').length)} icon="alert" />
      </div>
      <Card title="Conversions">
        {convs.length === 0 ? <Empty text="No conversions yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Offer</th><th>Payout</th><th>Status</th></tr></thead>
            <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2">{c.createdAt.slice(0, 10)}</td><td>{c.offerId}</td><td>${c.payout.toFixed(2)} {c.currency}</td><td>{c.status}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

export function AffiliatePayouts() {
  const { user } = useAuth()
  const demo = useDemoState()
  const [live, setLive] = useState<{ payouts: PayoutRequest[]; conversions: Conversion[]; method: string } | null>(null)
  const [amount, setAmount] = useState('')
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const code = user?.affiliateCode ?? 'AFF-DEMO-001'
  // Supabase mode reads live rows; demo mode reads the demo store. There
  // is no network-settings table yet, so Supabase mode uses the defaults.
  const settings = isDemoMode ? demo.settings : DEFAULT_SETTINGS
  useEffect(() => {
    if (isDemoMode) return
    Promise.all([getPayouts(), getConversions(), getMyAffiliateProfile()]).then(([payouts, conversions, ap]) =>
      setLive({ payouts, conversions, method: ap.paymentMethod ?? 'Bank transfer' }),
    )
  }, [])
  const payouts = isDemoMode ? demo.payouts : (live?.payouts ?? [])
  const conversions = isDemoMode ? demo.conversions : (live?.conversions ?? [])
  // Real affiliates have no affiliate_code yet — match live rows by owner
  // id instead of by code.
  const mine = isDemoMode
    ? payouts.filter((p) => p.affiliateCode === code)
    : payouts.filter((p) => p.affiliateId === user?.id)
  const approvedBalance = conversions
    .filter((c) => (isDemoMode ? c.affiliateCode === code : c.affiliateId === user?.id) && c.status === 'approved')
    .reduce((s, c) => s + c.payout, 0)
  const method = isDemoMode
    ? (demo.profiles.find((p) => p.affiliateCode === code)?.paymentMethod ?? 'Bank transfer')
    : (live?.method ?? 'Bank transfer')
  const request = async (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError('Enter an amount greater than 0.'); return }
    if (value < settings.minPayout) { setError(`Minimum payout is $${settings.minPayout.toFixed(2)} ${settings.defaultCurrency}.`); return }
    if (value > approvedBalance) { setError(`Amount exceeds your approved balance of $${approvedBalance.toFixed(2)}.`); return }
    if (isDemoMode) {
      updateDemo((s) => {
        s.payouts.unshift({
          id: newId('pay'), affiliateCode: code, amount: value, currency: settings.defaultCurrency,
          status: 'requested', method, createdAt: new Date().toISOString(),
        })
      })
      logAudit(user?.email ?? code, 'payout.request', 'payout', code, `Payout requested: $${value.toFixed(2)} ${settings.defaultCurrency}.`)
    } else {
      const r = await requestPayout(value, settings.defaultCurrency, method)
      if (r.error) { setError(r.error); return }
      const payouts = await getPayouts()
      setLive((prev) => (prev ? { ...prev, payouts } : prev))
    }
    setAmount('')
    setError('')
    setRequested(true)
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Approved balance" icon="banknote" value={`$${approvedBalance.toFixed(2)}`} />
        <Stat label="Minimum payout" icon="banknote" value={`$${settings.minPayout.toFixed(2)} ${settings.defaultCurrency}`} />
      </div>
      <Card title="Request a payout">
        <form onSubmit={request} className="flex gap-2">
          <input className={inputCls} type="number" min="0" step="0.01" placeholder={`Amount (${settings.defaultCurrency})`} aria-label={`Amount (${settings.defaultCurrency})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className={btnCls}>Request payout</button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {requested && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Payout request submitted for review.</p>}
        <p className="mt-3 text-xs text-slate-400">Payouts are calculated from approved commissions in the ledger. {isDemoMode ? 'Demo mode: requests are not sent anywhere.' : 'Requests are reviewed by the network admin.'}</p>
      </Card>
      <Card title="Payout history">
        {mine.length === 0 ? <Empty text="No payouts yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>{mine.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.createdAt.slice(0, 10)}</td><td>${p.amount.toFixed(2)} {p.currency}</td><td>{p.method ?? '—'}</td><td>{p.status}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

export function AffiliateProfile() {
  const { user } = useAuth()
  return (
    <Card title="Profile">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Name</dt><dd>{user?.fullName ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Email</dt><dd>{user?.email}</dd></div>
        <div><dt className="text-slate-500">Role</dt><dd>{user?.role}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd>{user?.status}</dd></div>
        <div><dt className="text-slate-500">Affiliate code</dt><dd className="font-mono">{user?.affiliateCode ?? '—'}</dd></div>
      </dl>
      <Link to="/onboarding" className="mt-4 inline-block font-semibold text-amber-700 text-sm">Edit onboarding details →</Link>
    </Card>
  )
}

export function AffiliateTickets() {
  const { user } = useAuth()
  const { tickets } = useDemoState()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    updateDemo((s) => {
      s.tickets.unshift({
        id: newId('ticket'), userId: user?.id, subject: subject.trim(), message: message.trim(),
        status: 'open', createdAt: new Date().toISOString(),
      })
    })
    logAudit(user?.email ?? 'affiliate', 'ticket.create', 'ticket', subject.trim(), `Support ticket opened: "${subject.trim()}".`)
    setSent(true)
    setSubject('')
    setMessage('')
  }
  return (
    <div className="space-y-4">
      <Card title="New ticket">
        <form onSubmit={submit} className="space-y-3">
          <input className={`${inputCls} w-full`} placeholder="Subject" aria-label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className={`${inputCls} w-full`} rows={4} placeholder="Describe the issue…" aria-label="Describe the issue" required value={message} onChange={(e) => setMessage(e.target.value)} />
          {isDemoMode && (
            <p className="text-xs text-amber-700">Demo mode — tickets are saved in this browser only and are not sent to support.</p>
          )}
          <button className={btnCls}>Submit ticket</button>
        </form>
        {sent && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Ticket submitted.</p>}
      </Card>
      <Card title="My tickets">
        {tickets.length === 0 ? <Empty text="No tickets yet." /> : tickets.map((t) => (
          <div key={t.id} className="border-b border-slate-100 py-2 text-sm last:border-0">
            <p className="font-medium">{t.subject} <span className="ml-2 text-slate-500">· {t.status}</span></p>
            <p className="text-slate-600">{t.message}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
