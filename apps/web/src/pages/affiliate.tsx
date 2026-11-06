import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Empty, Stat } from '../components/layout'
import { BarChart, LineChart } from '../components/charts'
import { useAuth } from '../lib/auth'
import { getClicks, getConversions, getOffers, getPayouts, getStats, getTickets } from '../lib/data'
import type { ReportFilters } from '../lib/data'
import { demoDailySeries } from '../lib/demo-data'
import { trackingLink } from '../lib/types'
import type { Click, Conversion, Offer, PayoutRequest, SupportTicket } from '../lib/types'

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900'
const btnCls = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white'

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clicks" value={String(stats.clicks)} />
        <Stat label="Conversions" value={String(stats.conversions)} />
        <Stat label="Approved" value={String(stats.approved)} />
        <Stat label="Revenue" value={`$${stats.revenue.toFixed(2)}`} sub={`EPC $${stats.epc.toFixed(2)} · CR ${(stats.cr * 100).toFixed(1)}%`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Clicks — last 7 days (demo sample)"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></Card>
        <Card title="Conversions — last 7 days (demo sample)"><LineChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.conversions }))} /></Card>
      </div>
      <Card title="Active offers">
        {offers.filter((o) => o.status === 'active').map((o) => (
          <div key={o.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
            <span>{o.name} — {o.payout_model} ${o.payout} {o.currency}</span>
            <Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-blue-700">View →</Link>
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
        <input className={inputCls} placeholder="Search offers…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <td>{o.payout_model} ${o.payout} {o.currency}</td><td>{o.countries.join(', ')}</td><td>{o.status}</td>
                <td><Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-blue-700">View</Link></td>
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
  const [offer, setOffer] = useState<Offer | undefined>()
  const [applied, setApplied] = useState(false)
  useEffect(() => { if (id) getOffers().then((os) => setOffer(os.find((o) => o.id === id))) }, [id])
  if (!offer) return <Card><Empty text="Offer not found." /></Card>
  return (
    <Card title={offer.name}>
      <p className="text-sm text-slate-600">{offer.description}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Vertical</dt><dd>{offer.vertical}</dd></div>
        <div><dt className="text-slate-500">Conversion</dt><dd>{offer.conversion_type}</dd></div>
        <div><dt className="text-slate-500">Payout</dt><dd>{offer.payout_model} ${offer.payout} {offer.currency}</dd></div>
        <div><dt className="text-slate-500">Countries</dt><dd>{offer.countries.join(', ')}</dd></div>
        <div><dt className="text-slate-500">Devices</dt><dd>{offer.devices.join(', ')}</dd></div>
        <div><dt className="text-slate-500">Traffic sources</dt><dd>{offer.traffic_sources.join(', ')}</dd></div>
        <div><dt className="text-slate-500">Caps</dt><dd>Daily {offer.cap_daily ?? '—'} · Total {offer.cap_total ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Approval required</dt><dd>{offer.approval_required ? 'Yes' : 'No'}</dd></div>
        <div><dt className="text-slate-500">Landing URL</dt><dd className="break-all">{offer.landing_url}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd>{offer.status}</dd></div>
      </dl>
      {applied
        ? <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Application submitted. You will be notified when the advertiser reviews it.</p>
        : <button className={`${btnCls} mt-4`} onClick={() => setApplied(true)}>{offer.approval_required ? 'Apply for this offer' : 'Join this offer'}</button>}
      <Link to="/app/affiliate/tracking-links" className="ml-3 text-sm font-semibold text-blue-700">Generate tracking link →</Link>
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
          <span>{o.name} — {o.payout_model} ${o.payout} {o.currency}</span>
          <Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-blue-700">View</Link>
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
            <input key={k} className={inputCls} placeholder={k} value={subs[k]} onChange={(e) => setSubs((s) => ({ ...s, [k]: e.target.value }))} />
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
    clicks.forEach((c) => m.set(c.offer_id, { clicks: (m.get(c.offer_id)?.clicks ?? 0) + 1, convs: m.get(c.offer_id)?.convs ?? 0 }))
    convs.forEach((c) => m.set(c.offer_id, { clicks: m.get(c.offer_id)?.clicks ?? 0, convs: (m.get(c.offer_id)?.convs ?? 0) + 1 }))
    return [...m.entries()]
  }, [clicks, convs])
  return (
    <div className="space-y-4">
      <Card title="Reports">
        <ReportFiltersForm filters={filters} setFilters={setFilters} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Clicks" value={String(clicks.length)} />
          <Stat label="Conversions" value={String(convs.length)} />
          <Stat label="Approved revenue" value={`$${convs.filter((c) => c.status === 'approved').reduce((s, c) => s + c.payout, 0).toFixed(2)}`} />
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
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState<string[]>([])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url) { setSaved((s) => [...s, url]); setUrl('') }
  }
  return (
    <Card title="Postbacks">
      <p className="mb-3 text-sm text-slate-500">Register a postback URL. Supported macros: {'{click_id}'} {'{conversion_id}'} {'{payout}'} {'{currency}'} {'{status}'} {'{sub1}'}. The tracking service calls it when a conversion is recorded.</p>
      <form onSubmit={submit} className="flex gap-2">
        <input className={`${inputCls} flex-1`} placeholder="https://example.com/postback?click_id={click_id}&payout={payout}" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className={btnCls}>Save</button>
      </form>
      {saved.length === 0 ? <p className="mt-4 text-sm text-slate-500">No postbacks configured.</p> : saved.map((u) => <p key={u} className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm font-mono">{u}</p>)}
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
        <Stat label="Approved earnings" value={`$${approved.reduce((s, c) => s + c.payout, 0).toFixed(2)}`} />
        <Stat label="Pending" value={`$${pending.reduce((s, c) => s + c.payout, 0).toFixed(2)}`} />
        <Stat label="Rejected / reversed" value={String(convs.filter((c) => c.status === 'rejected' || c.status === 'reversed').length)} />
      </div>
      <Card title="Conversions">
        {convs.length === 0 ? <Empty text="No conversions yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Offer</th><th>Payout</th><th>Status</th></tr></thead>
            <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2">{c.created_at.slice(0, 10)}</td><td>{c.offer_id}</td><td>${c.payout.toFixed(2)} {c.currency}</td><td>{c.status}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

export function AffiliatePayouts() {
  const { data: payouts } = useLoad(getPayouts, [] as PayoutRequest[])
  const [amount, setAmount] = useState('')
  const [requested, setRequested] = useState(false)
  return (
    <div className="space-y-4">
      <Card title="Request a payout">
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); setRequested(true) }} className="flex gap-2">
          <input className={inputCls} type="number" min="0" step="0.01" placeholder="Amount (USD)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className={btnCls}>Request payout</button>
        </form>
        {requested && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Payout request submitted for review.</p>}
        <p className="mt-3 text-xs text-slate-400">Payouts are calculated from approved commissions in the ledger. Demo mode: requests are not sent anywhere.</p>
      </Card>
      <Card title="Payout history">
        {payouts.length === 0 ? <Empty text="No payouts yet." /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>{payouts.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.created_at.slice(0, 10)}</td><td>${p.amount.toFixed(2)} {p.currency}</td><td>{p.method}</td><td>{p.status}</td></tr>)}</tbody>
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
      <Link to="/onboarding" className="mt-4 inline-block font-semibold text-blue-700 text-sm">Edit onboarding details →</Link>
    </Card>
  )
}

export function AffiliateTickets() {
  const { data: tickets } = useLoad(getTickets, [] as SupportTicket[])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <div className="space-y-4">
      <Card title="New ticket">
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); setSent(true); setSubject(''); setMessage('') }} className="space-y-3">
          <input className={`${inputCls} w-full`} placeholder="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className={`${inputCls} w-full`} rows={4} placeholder="Describe the issue…" required value={message} onChange={(e) => setMessage(e.target.value)} />
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
