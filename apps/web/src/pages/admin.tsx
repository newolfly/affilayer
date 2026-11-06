import { useEffect, useState } from 'react'
import { Card, Empty, Stat } from '../components/layout'
import { BarChart } from '../components/charts'
import { getClicks, getConversions, getOffers, getPayouts, getProfiles, getStats, getTickets } from '../lib/data'
import { demoDailySeries } from '../lib/demo-data'

export function AdminOverview() {
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, approved: 0, pending: 0, revenue: 0 })
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof getProfiles>>>([])
  useEffect(() => { getStats().then(setStats); getProfiles().then(setProfiles) }, [])
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={String(profiles.length)} />
        <Stat label="Clicks" value={String(stats.clicks)} />
        <Stat label="Conversions" value={String(stats.conversions)} />
        <Stat label="Pending conversions" value={String(stats.pending)} />
      </div>
      <Card title="Clicks — last 7 days (demo sample)"><BarChart data={demoDailySeries.map((d) => ({ label: d.label, value: d.clicks }))} /></Card>
    </div>
  )
}

function ProfilesTable({ filter }: { filter?: (p: Awaited<ReturnType<typeof getProfiles>>[number]) => boolean }) {
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof getProfiles>>>([])
  useEffect(() => { getProfiles().then(setProfiles) }, [])
  const list = filter ? profiles.filter(filter) : profiles
  return (
    <Card title="Users">
      {list.length === 0 ? <Empty text="No users match." /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>{list.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.full_name ?? '—'}</td><td>{p.email}</td><td>{p.role}</td><td>{p.status}</td></tr>)}</tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-slate-400">Approvals and role changes are administered by a network manager; this MVP UI is read-only.</p>
    </Card>
  )
}

export function AdminUsers() { return <ProfilesTable /> }
export function AdminAffiliates() { return <ProfilesTable filter={(p) => p.role === 'affiliate'} /> }
export function AdminAdvertisers() { return <ProfilesTable filter={(p) => p.role === 'advertiser'} /> }

export function AdminOffers() {
  const [offers, setOffers] = useState<Awaited<ReturnType<typeof getOffers>>>([])
  useEffect(() => { getOffers().then(setOffers) }, [])
  return (
    <Card title="Offers">
      {offers.map((o) => (
        <div key={o.id} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
          <span>{o.name} — {o.vertical}</span><span>{o.status} · {o.payout_model} ${o.payout} {o.currency}</span>
        </div>
      ))}
    </Card>
  )
}

export function AdminCampaigns() {
  return <Card title="Campaigns"><p className="text-sm text-slate-600">Campaigns group offers per advertiser. See the advertiser section for campaign management; this overview is read-only in the MVP.</p></Card>
}

export function AdminConversions() {
  const [convs, setConvs] = useState<Awaited<ReturnType<typeof getConversions>>>([])
  useEffect(() => { getConversions().then(setConvs) }, [])
  return (
    <Card title="Conversions">
      {convs.length === 0 ? <Empty text="No conversions yet." /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Click ID</th><th>Offer</th><th>Affiliate</th><th>Payout</th><th>Status</th></tr></thead>
          <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2">{c.created_at.slice(0, 10)}</td><td className="font-mono">{c.click_id ?? '—'}</td><td>{c.offer_id}</td><td>{c.affiliate_code ?? '—'}</td><td>${c.payout.toFixed(2)}</td><td>{c.status}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  )
}

export function AdminFraud() {
  const [clicks, setClicks] = useState<Awaited<ReturnType<typeof getClicks>>>([])
  useEffect(() => { getClicks().then(setClicks) }, [])
  const byIp = new Map<string, number>()
  clicks.forEach((c) => { if (c.ip) byIp.set(c.ip, (byIp.get(c.ip) ?? 0) + 1) })
  const signals = [
    ...[...byIp.entries()].filter(([, n]) => n > 10).map(([ip, n]) => `More than 10 clicks from one IP (${ip}, ${n} clicks in the sample)`),
    ...clicks.filter((c) => !c.user_agent).map((c) => `Empty user agent on click ${c.click_id}`),
  ]
  return (
    <Card title="Fraud signals">
      <p className="mb-3 text-sm text-slate-500">Rule-based signals only: duplicate click IDs, more than 10 clicks from one IP in 60 seconds, empty user agent. Signals never auto-reject a conversion — a person reviews them.</p>
      {signals.length === 0 ? <Empty text="No fraud signals in the current data." /> : signals.map((s) => <p key={s} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 mt-2">{s}</p>)}
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
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Conversion</th><th>Affiliate</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2 font-mono">{c.id}</td><td>{c.affiliate_code ?? '—'}</td><td>${c.payout.toFixed(2)} {c.currency}</td><td>{c.status}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  )
}

export function AdminPayouts() {
  const [payouts, setPayouts] = useState<Awaited<ReturnType<typeof getPayouts>>>([])
  useEffect(() => { getPayouts().then(setPayouts) }, [])
  return (
    <Card title="Payouts">
      {payouts.length === 0 ? <Empty text="No payout requests yet." /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Affiliate</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
          <tbody>{payouts.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.created_at.slice(0, 10)}</td><td>{p.affiliate_code}</td><td>${p.amount.toFixed(2)} {p.currency}</td><td>{p.method}</td><td>{p.status}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  )
}

export function AdminCompliance() {
  return (
    <Card title="Compliance">
      <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
        <li>Offer terms must state the conversion definition, payout model and traffic rules.</li>
        <li>Accounts pending review cannot run offers until approved.</li>
        <li>Fraud signals are reviewed by a person; no conversion is auto-rejected.</li>
        <li>Ledger entries are immutable; corrections are made by reversing and re-issuing, not by editing.</li>
      </ul>
    </Card>
  )
}

export function AdminAuditLogs() {
  return (
    <Card title="Audit logs">
      <p className="text-sm text-slate-600">Audit entries are written by the database functions (approve/reject conversion, payout changes). In demo mode there is no live audit trail.</p>
      <Empty text="No audit log entries in demo mode." />
    </Card>
  )
}

export function AdminSettings() {
  return (
    <Card title="Settings">
      <p className="text-sm text-slate-600">Network settings (default currency, payout schedule, approval defaults) are managed here in a live deployment. In this MVP the settings are read-only placeholders — no live service is touched.</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Default currency</dt><dd>USD</dd></div>
        <div><dt className="text-slate-500">Payout schedule</dt><dd>Monthly, on approved balance</dd></div>
        <div><dt className="text-slate-500">New accounts</dt><dd>Require approval</dd></div>
      </dl>
    </Card>
  )
}

export function AdminTickets() {
  const [tickets, setTickets] = useState<Awaited<ReturnType<typeof getTickets>>>([])
  useEffect(() => { getTickets().then(setTickets) }, [])
  return (
    <Card title="Support tickets">
      {tickets.length === 0 ? <Empty text="No tickets yet." /> : tickets.map((t) => (
        <div key={t.id} className="border-b border-slate-100 py-2 text-sm last:border-0">
          <p className="font-medium">{t.subject} <span className="ml-2 text-slate-500">· {t.status}</span></p>
          <p className="text-slate-600">{t.message}</p>
        </div>
      ))}
    </Card>
  )
}
