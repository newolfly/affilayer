import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Card, Empty, FirstSteps, Stat } from '../components/layout'
import { BarChart } from '../components/charts'
import { getCampaigns, getClicks, getConversions, getMyAdvertiserBalances, getMyDeposits, getOffers, getProfiles, getStats, isDemoMode, createOffer } from '../lib/data'
import { createDeposit } from '../lib/payments'
import type { AdvertiserBalance, AdvertiserDeposit } from '../lib/types'
import { demoDailySeries } from '../lib/demo-data'
import { logAudit, newId, updateDemo, useDemoState } from '../lib/demo-store'
import { useAuth } from '../lib/auth'
import type { Campaign, Offer, PayoutModel } from '../lib/types'
import { ReportFiltersForm } from './affiliate'
import type { ReportFilters } from '../lib/data'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900'
const labelCls = 'mb-1 block text-sm font-medium text-slate-700'
const btnCls = 'rounded-lg bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-[#0B1220]'

export function AdvertiserDashboard() {
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, approved: 0, revenue: 0 })
  const [offers, setOffers] = useState<Offer[]>([])
  useEffect(() => { getStats().then(setStats); getOffers().then(setOffers) }, [])
  return (
    <div className="space-y-4">
      <FirstSteps role="advertiser" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clicks" value={String(stats.clicks)} icon="chart" />
        <Stat label="Conversions" value={String(stats.conversions)} icon="check" />
        <Stat label="Approved" value={String(stats.approved)} icon="shield" />
        <Stat label="Commission payable" value={`$${stats.revenue.toFixed(2)}`} icon="banknote" />
      </div>
      <Card title="Clicks — last 7 days (demo sample)"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></Card>
      <Card title="Your offers">
        {offers.map((o) => <div key={o.id} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0"><span>{o.name}</span><span>{o.status} · {o.payoutModel} ${o.payout}</span></div>)}
      </Card>
    </div>
  )
}

export function AdvertiserCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  useEffect(() => { getCampaigns().then(setCampaigns) }, [])
  return (
    <Card title="Campaigns">
      {campaigns.length === 0 ? <Empty text="No campaigns yet. Create an offer to start." /> : campaigns.map((c) => (
        <div key={c.id} className="border-b border-slate-100 py-3 text-sm last:border-0">
          <p className="font-medium">{c.name} <span className="ml-2 text-slate-500">· {c.status}</span></p>
          <p className="text-slate-600">{c.description ?? ''} {c.budget ? `· Budget $${c.budget} ${c.currency ?? 'USD'}` : ''}</p>
        </div>
      ))}
    </Card>
  )
}

export function AdvertiserCreateOffer() {
  const { user } = useAuth()
  const { settings } = useDemoState()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', vertical: 'Finance', countries: 'US, GB', devices: 'desktop, mobile',
    trafficSources: 'SEO, Content', conversionType: 'Signup', payoutModel: 'CPA' as PayoutModel,
    payout: '', rate: '', currency: settings.defaultCurrency, capDaily: '', capTotal: '', landingUrl: '', creatives: '',
    approvalRequired: true,
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string; checked?: boolean } }) =>
    setForm((f) => ({ ...f, [k]: k === 'approvalRequired' ? Boolean(e.target.checked) : e.target.value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const payout = Number(form.payout)
    if (!Number.isFinite(payout) || payout < 0) { setError('Payout must be a number of 0 or more.'); return }
    let rateBps: number | undefined
    if (form.payoutModel === 'CPS') {
      const rate = Number(form.rate)
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setError('Commission rate must be between 0 and 100%.'); return }
      rateBps = Math.round(rate * 100)
    }
    let landing: URL
    try { landing = new URL(form.landingUrl) } catch { setError('Landing URL must be a valid URL.'); return }
    if (landing.protocol !== 'https:' && landing.protocol !== 'http:') { setError('Landing URL must start with http:// or https://.'); return }
    const capDaily = form.capDaily === '' ? null : Number(form.capDaily)
    const capTotal = form.capTotal === '' ? null : Number(form.capTotal)
    if ((capDaily !== null && (!Number.isInteger(capDaily) || capDaily < 0)) || (capTotal !== null && (!Number.isInteger(capTotal) || capTotal < 0))) {
      setError('Caps must be whole numbers of 0 or more.'); return
    }
    const split = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)
    setError('')
    setSaved(false)
    // Demo mode keeps the exact old behaviour: local store only.
    if (isDemoMode) {
      const offer: Offer = {
        id: newId('offer'), name: form.name.trim(), description: form.description.trim(),
        vertical: form.vertical.trim(), countries: split(form.countries), devices: split(form.devices),
        trafficSources: split(form.trafficSources), conversionType: form.conversionType.trim(),
        payoutModel: form.payoutModel, payout, rateBps, currency: form.currency.trim() || settings.defaultCurrency,
        capDaily, capTotal,
        landingUrl: form.landingUrl.trim(), creatives: split(form.creatives),
        approvalRequired: form.approvalRequired, status: 'active', advertiserId: user?.id,
        createdAt: new Date().toISOString(),
      }
      updateDemo((s) => { s.offers.unshift(offer) })
      logAudit(user?.email ?? 'advertiser', 'offer.create', 'offer', offer.id, `Offer "${offer.name}" created (${offer.payoutModel} $${offer.payout} ${offer.currency}).`)
      setSaved(true)
      return
    }
    // Live mode: real insert — the offer only counts as created once
    // the row exists. Any failure is shown; success is never claimed
    // on a failed insert.
    setBusy(true)
    const r = await createOffer({
      name: form.name.trim(), description: form.description.trim(),
      vertical: form.vertical.trim(), countries: split(form.countries), devices: split(form.devices),
      trafficSources: split(form.trafficSources), conversionType: form.conversionType.trim(),
      payoutModel: form.payoutModel, payout, rateBps, currency: form.currency.trim() || settings.defaultCurrency,
      capDaily, capTotal,
      landingUrl: form.landingUrl.trim(), creatives: split(form.creatives),
      approvalRequired: form.approvalRequired,
    })
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setSaved(true)
  }
  return (
    <Card title="Create offer">
      <form onSubmit={submit} className="space-y-3">
        <div><label className={labelCls} htmlFor="adv-name">Name</label><input id="adv-name" className={inputCls} required value={form.name} onChange={set('name')} /></div>
        <div><label className={labelCls} htmlFor="adv-description">Description</label><textarea id="adv-description" className={inputCls} rows={3} required value={form.description} onChange={set('description')} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="adv-vertical">Vertical</label><input id="adv-vertical" className={inputCls} required value={form.vertical} onChange={set('vertical')} /></div>
          <div><label className={labelCls} htmlFor="adv-conversion-type">Conversion type</label><input id="adv-conversion-type" className={inputCls} required value={form.conversionType} onChange={set('conversionType')} /></div>
          <div><label className={labelCls} htmlFor="adv-countries">Countries (comma-separated)</label><input id="adv-countries" className={inputCls} required value={form.countries} onChange={set('countries')} /></div>
          <div><label className={labelCls} htmlFor="adv-devices">Devices (comma-separated)</label><input id="adv-devices" className={inputCls} required value={form.devices} onChange={set('devices')} /></div>
          <div><label className={labelCls} htmlFor="adv-traffic-sources">Traffic sources (comma-separated)</label><input id="adv-traffic-sources" className={inputCls} required value={form.trafficSources} onChange={set('trafficSources')} /></div>
          <div><label className={labelCls} htmlFor="adv-landing-url">Landing URL</label><input id="adv-landing-url" className={inputCls} type="url" required value={form.landingUrl} onChange={set('landingUrl')} /></div>
          <div><label className={labelCls} htmlFor="adv-payout-model">Payout model</label>
            <select id="adv-payout-model" className={inputCls} value={form.payoutModel} onChange={(e) => setForm((f) => ({ ...f, payoutModel: e.target.value as PayoutModel }))}>
              {(['CPA', 'CPL', 'CPS', 'CPC'] as PayoutModel[]).map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div><label className={labelCls} htmlFor="adv-payout">Payout (amount{form.payoutModel === 'CPS' ? ' — for CPS this is the order value; set the commission rate below' : ''})</label><input id="adv-payout" className={inputCls} type="number" min="0" step="0.01" required value={form.payout} onChange={set('payout')} /></div>
          {form.payoutModel === 'CPS' && (<div><label className={labelCls} htmlFor="adv-rate">Commission rate (%)</label><input id="adv-rate" className={inputCls} type="number" min="0" max="100" step="0.01" required value={form.rate} onChange={set('rate')} /></div>)}
          <div><label className={labelCls} htmlFor="adv-currency">Currency</label><input id="adv-currency" className={inputCls} value={form.currency} onChange={set('currency')} /></div>
          <div><label className={labelCls} htmlFor="adv-creatives">Creatives (URLs, comma-separated)</label><input id="adv-creatives" className={inputCls} value={form.creatives} onChange={set('creatives')} /></div>
          <div><label className={labelCls} htmlFor="adv-cap-daily">Daily cap</label><input id="adv-cap-daily" className={inputCls} type="number" min="0" value={form.capDaily} onChange={set('capDaily')} /></div>
          <div><label className={labelCls} htmlFor="adv-cap-total">Total cap</label><input id="adv-cap-total" className={inputCls} type="number" min="0" value={form.capTotal} onChange={set('capTotal')} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.approvalRequired} onChange={set('approvalRequired')} /> Approval required for affiliates</label>
        <button className={btnCls} disabled={busy}>{busy ? 'Creating…' : 'Create offer'}</button>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{isDemoMode ? 'Offer created — demo mode: stored in this browser only.' : 'Offer created — it now appears in the offer marketplace.'}</p>}
      </form>
    </Card>
  )
}

export function AdvertiserAffiliates() {
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof getProfiles>>>([])
  useEffect(() => { getProfiles().then((ps) => setProfiles(ps.filter((p) => p.role === 'affiliate'))) }, [])
  return (
    <Card title="Affiliates">
      {profiles.length === 0 ? <Empty text="No affiliates yet." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Name</th><th>Email</th><th>Code</th><th>Status</th></tr></thead>
          <tbody>{profiles.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.fullName ?? '—'}</td><td>{p.email}</td><td className="font-mono">{p.affiliateCode ?? '—'}</td><td>{p.status}</td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  )
}

export function AdvertiserConversions() {
  const [convs, setConvs] = useState<Awaited<ReturnType<typeof getConversions>>>([])
  useEffect(() => { getConversions().then(setConvs) }, [])
  return (
    <Card title="Conversions">
      {convs.length === 0 ? <Empty text="No conversions yet." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Click ID</th><th>Offer</th><th>Payout</th><th>Status</th></tr></thead>
          <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2">{c.createdAt.slice(0, 10)}</td><td className="font-mono">{c.clickId ?? '—'}</td><td>{c.offerId}</td><td>${c.payout.toFixed(2)} {c.currency}</td><td>{c.status}</td></tr>)}</tbody>
        </table></div>
      )}
      <p className="mt-3 text-xs text-slate-400">Status changes go through approve/reject functions with ledger state-transition checks; this UI is read-only in the MVP.</p>
    </Card>
  )
}

export function AdvertiserReports() {
  const [filters, setFilters] = useState<ReportFilters>({})
  const [clicks, setClicks] = useState<Awaited<ReturnType<typeof getClicks>>>([])
  const [convs, setConvs] = useState<Awaited<ReturnType<typeof getConversions>>>([])
  useEffect(() => { getClicks(filters).then(setClicks); getConversions(filters).then(setConvs) }, [filters])
  return (
    <Card title="Reports">
      <ReportFiltersForm filters={filters} setFilters={setFilters} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Clicks" value={String(clicks.length)} icon="chart" />
        <Stat label="Conversions" value={String(convs.length)} icon="check" />
        <Stat label="Approved spend" value={`$${convs.filter((c) => c.status === 'approved').reduce((s, c) => s + c.payout, 0).toFixed(2)}`} icon="wallet" />
      </div>
      <div className="mt-4"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></div>
    </Card>
  )
}

export function AdvertiserBilling() {
  const [deposits, setDeposits] = useState<AdvertiserDeposit[]>([])
  const [balances, setBalances] = useState<AdvertiserBalance[]>([])
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (isDemoMode) return
    getMyDeposits().then(setDeposits)
    getMyAdvertiserBalances().then(setBalances)
    const q = new URLSearchParams(window.location.search)
    if (q.get('deposit') === 'success') setNotice('Payment received — your balance updates once NOWPayments confirms it (usually a few minutes).')
    if (q.get('deposit') === 'cancelled') setNotice('Deposit cancelled — nothing was charged.')
  }, [])
  const balanceUsd = balances.find((b) => b.currency === 'USD')?.balance ?? 0
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 10) { setError('Minimum deposit is $10.'); return }
    setBusy(true)
    setError('')
    const r = await createDeposit(value)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    const url = typeof r.invoice_url === 'string' ? r.invoice_url : ''
    if (!url) { setError('NOWPayments returned no payment page. Try again.'); return }
    window.location.href = url
  }
  return (
    <div className="space-y-4">
      <Card title="Billing">
        <p className="text-sm text-slate-600">Billing is based on approved conversions in the commission ledger. Deposits are paid in crypto through NOWPayments and priced in USD — pick any coin on the payment page.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Available balance" value={`$${balanceUsd.toFixed(2)}`} sub="Spendable credit from confirmed deposits" icon="banknote" />
        <Stat label="Deposits" value={String(deposits.length)} sub="All time" icon="wallet" />
      </div>
      {isDemoMode ? (
        <Card title="Current balance (demo sample)">
          <Stat label="Payable (approved, unpaid)" value="$102.00" sub="From demo ledger data — not real" icon="banknote" />
        </Card>
      ) : (
        <>
          <Card title="Add funds">
            <form onSubmit={submit} className="flex gap-2">
              <input className={inputCls} type="number" min="10" step="0.01" placeholder="Amount (USD, min $10)" aria-label="Amount (USD)" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className={btnCls} disabled={busy}>{busy ? 'Creating…' : 'Deposit with crypto'}</button>
            </form>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {notice && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
            <p className="mt-3 text-xs text-slate-400">You are redirected to NOWPayments to pay. Your balance is credited only once the payment is confirmed on-chain — underpaid deposits are held for manual review, never auto-credited.</p>
          </Card>
          <Card title="Deposits">
            {deposits.length === 0 ? <Empty text="No deposits yet." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Amount</th><th>Paid in</th><th>Status</th></tr></thead>
                <tbody>{deposits.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="py-2">{d.createdAt.slice(0, 10)}</td>
                    <td>${d.amountUsd.toFixed(2)} {d.currency}</td>
                    <td>{d.npPayCurrency ? `${d.npPayAmount ?? ''} ${d.npPayCurrency}` : '—'}</td>
                    <td>{d.status}{d.adminNote ? ` — ${d.adminNote}` : ''}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
