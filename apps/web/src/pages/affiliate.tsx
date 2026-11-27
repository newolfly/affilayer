import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, Empty, FirstSteps, Stat } from '../components/layout'
import { BarChart, LineChart } from '../components/charts'
import { useAuth } from '../lib/auth'
import { acceptTeamInvite, applyToOffer, cancelTeamInvite, conversionCommission, createTicket, declineTeamInvite, getClicks, getConversions, getLedgerEntries, getMyAffiliateProfile, getMyOfferApplications, getMyPendingInvites, getMyPostbackConfigs, getMyTeamInvites, getMyTeamMembers, getNpPayouts, getOffers, getPayouts, getStats, getTickets, inviteTeamMember, leaveTeam, offerCommissionLabel, offerHeadline, offerPayoutLabel, offerPayoutPlain, removeTeamMember, requestPayout, resultNoun, savePostbackConfig, savePayoutWallet, sumCommissions } from '../lib/data'
import type { OfferApplication, PostbackConfig, ReportFilters, TeamInvite, TeamMember } from '../lib/data'
import { looksLikeTrc20, validatePayoutAddress } from '../lib/payments'
import { NETWORK_SETTINGS } from '../lib/network-settings'
import { smartLink, trackingLink } from '../lib/tracking'
import { trackEvent } from '../lib/analytics'
import type { Click, CommissionLedgerEntry, Conversion, NpPayout, Offer, PayoutRequest, PayoutWallet, SupportTicket } from '../lib/types'

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900'
const btnCls = 'rounded-lg bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-[#0B1220]'

/** Real per-day counts for the last 7 days (replaces the old hardcoded
 *  "(demo sample)" series — demo mode was removed on 20 Nov 2026). */
function last7DaysSeries(rows: { createdAt: string }[]): { label: string; value: number }[] {
  const days: { label: string; value: number }[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ label: key.slice(5), value: rows.filter((r) => r.createdAt.slice(0, 10) === key).length })
  }
  return days
}

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
  const { user, refreshTeamContext } = useAuth()
  const location = useLocation()
  // A plain message carried by a redirect — e.g. a team member opening
  // the Payouts URL directly ("Payouts are handled by your team head.").
  const notice = (location.state as { notice?: string } | null)?.notice
  const isMember = !!user?.teamContext
  const [stats, setStats] = useState({ clicks: 0, conversions: 0, approved: 0, pending: 0, revenue: 0, epc: 0, cr: 0 })
  const [offers, setOffers] = useState<Offer[]>([])
  const [offersLoading, setOffersLoading] = useState(true)
  const [balance, setBalance] = useState(0)
  const [chartClicks, setChartClicks] = useState<Click[]>([])
  const [chartConvs, setChartConvs] = useState<Conversion[]>([])
  const [hasWallet, setHasWallet] = useState(false)
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [inviteError, setInviteError] = useState('')
  useEffect(() => { getMyPendingInvites().then(setInvites) }, [])
  const respondInvite = async (invite: TeamInvite, accept: boolean) => {
    const r = accept ? await acceptTeamInvite(invite.id) : await declineTeamInvite(invite.id)
    if (r.error) { setInviteError(r.error); return }
    setInvites((list) => list.filter((i) => i.id !== invite.id))
    if (accept) await refreshTeamContext()
  }
  useEffect(() => {
    getMyAffiliateProfile().then((ap) => setHasWallet(!!ap.payoutWallet?.address))
  }, [])
  // The ONE next action, in plain words, from the affiliate's real state.
  // A team member has no wallet step and no approval wait — they go
  // straight to making their first tracking link (design §6).
  const nextStep = (() => {
    if (user?.status === 'rejected') return { text: 'Your application was not approved. Message the team and we will tell you why.', to: '/app/affiliate/tickets', link: 'Message the team' }
    if (isMember) {
      if (stats.clicks === 0) return { text: 'Your next step: make your first tracking link and share it.', to: '/app/affiliate/tracking-links', link: 'Make a tracking link' }
      if (stats.conversions === 0) return { text: 'You have clicks — now share your link in more places and watch Reports.', to: '/app/affiliate/reports', link: 'See your reports' }
      return { text: 'You have results — check your earnings.', to: '/app/affiliate/earnings', link: 'See your earnings' }
    }
    if (user?.status !== 'approved') return { text: 'Your next step: confirm your email, then wait for approval. Click the confirmation link we emailed you — you cannot log in until your email is confirmed.', to: '/pending', link: 'Check approval status' }
    if (!hasWallet) return { text: 'Your next step: add your USDT wallet so you can get paid.', to: '/app/affiliate/payouts', link: 'Add your wallet' }
    if (stats.clicks === 0) return { text: 'Your next step: make your first tracking link and share it.', to: '/app/affiliate/tracking-links', link: 'Make a tracking link' }
    if (stats.conversions === 0) return { text: 'You have clicks — now share your link in more places and watch Reports.', to: '/app/affiliate/reports', link: 'See your reports' }
    return { text: 'You have results — check your earnings. At $50 approved balance you can request a payout.', to: '/app/affiliate/earnings', link: 'See your earnings' }
  })()
  useEffect(() => {
    getStats({ affiliateCode: user?.affiliateCode }).then((s) => setStats(s))
    // The Active-offers card must not flash "No open offers" while the
    // list is still loading — the empty message is only true once the
    // load has finished and returned zero active offers.
    setOffersLoading(true)
    getOffers().then((os) => { setOffers(os); setOffersLoading(false) }).catch(() => setOffersLoading(false))
    getClicks({ affiliateCode: user?.affiliateCode }).then(setChartClicks)
  }, [user?.affiliateCode])
  useEffect(() => {
    // Approved balance, computed exactly like the Payouts page:
    // ledger commission on my approved conversions only (M-05).
    Promise.all([getConversions(), getLedgerEntries(), getOffers()]).then(([convs, ledger, os]) => {
      const mine = convs.filter((c) => c.status === 'approved' && c.affiliateId === user?.id)
      setBalance(sumCommissions(mine, ledger, os))
      setChartConvs(convs)
    })
  }, [user?.affiliateCode, user?.id])
  return (
    <div className="space-y-4">
      <FirstSteps role="affiliate" />
      {notice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3">
          <p className="text-sm text-slate-700">{notice}</p>
        </div>
      )}
      {isMember && user?.teamContext && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-50 px-4 py-3">
          <p className="text-sm text-slate-700">You're on {user.teamContext.parentEmail}'s team. These are your whole team's numbers, not just yours.</p>
        </div>
      )}
      {invites.map((inv) => (
        <div key={inv.id} className="rounded-xl border border-sky-500/40 bg-sky-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{inv.inviterEmail ?? 'Someone'} invited you to join their team</p>
          {user?.status === 'approved' && <p className="mt-1 text-sm text-slate-700">Joining means your own tracking links stop earning — your team's links earn for the team instead.</p>}
          <div className="mt-2 flex gap-2">
            <button className={btnCls} onClick={() => respondInvite(inv, true)}>Accept</button>
            <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => respondInvite(inv, false)}>Decline</button>
          </div>
        </div>
      ))}
      {inviteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{inviteError}</p>}
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Your next step</p>
        <p className="mt-0.5 text-sm text-slate-700">{nextStep.text}</p>
        <Link to={nextStep.to} className="mt-2 inline-block text-sm font-semibold text-amber-700">{nextStep.link} →</Link>
        <Link to="/app/affiliate/guide" className="ml-4 mt-2 inline-block text-sm font-semibold text-amber-700">Getting-started guide →</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clicks" value={String(stats.clicks)} sub="People who clicked your links" icon="chart" />
        <Stat label="Results" value={String(stats.conversions)} sub="Clicks that turned into a sale, sign-up or install" icon="check" />
        <Stat label="Approved results" value={String(stats.approved)} sub="Confirmed — these earn you money" icon="shield" />
        <Stat label="Revenue" value={`$${stats.revenue.toFixed(2)}`} sub={stats.clicks === 0 ? 'No clicks yet — share your tracking link to start earning.' : `About $${stats.epc.toFixed(2)} earned per click · ${(stats.cr * 100).toFixed(1)}% of clicks become a result`} icon="wallet" />
      </div>
      <Card title="Your balance">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Approved balance <span className="ml-1 text-base font-bold text-slate-900">${balance.toFixed(2)}</span>
            {isMember
              ? <span className="ml-2">Payouts go to your team head.</span>
              : <span className="ml-2">Withdraw it in USDT (TRC20) from the Payouts page.</span>}
          </p>
          {!isMember && <Link to="/app/affiliate/payouts" className={btnCls}>Withdraw</Link>}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Clicks — last 7 days"><BarChart data={last7DaysSeries(chartClicks)} /></Card>
        <Card title="Results — last 7 days"><LineChart data={last7DaysSeries(chartConvs)} /></Card>
      </div>
      <Card title="Active offers">
        {offersLoading ? <p className="py-2 text-sm text-slate-500">Loading offers…</p>
        : offers.filter((o) => o.status === 'active').length === 0 ? <Empty text="No open offers right now — check back soon." /> : offers.filter((o) => o.status === 'active').map((o) => (
          <div key={o.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
            <span>{o.name} — {offerPayoutPlain(o)}</span>
            <Link to={`/app/affiliate/offers/${o.id}`} className="font-semibold text-amber-700">View →</Link>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function AffiliateGuide() {
  const { user } = useAuth()
  const isMember = !!user?.teamContext
  const steps = [
    {
      title: 'Confirm your email',
      text: 'We emailed you a confirmation link when you signed up. Click it — you cannot log in until your email is confirmed. After that, a person reviews your application; most complete applications are decided the same day.',
      to: '/pending',
      link: 'Check approval status',
    },
    {
      title: 'Complete your profile',
      text: 'Tell us who you are and where your traffic comes from — a website, a social account, a channel, or anywhere else you share links. You do not need a website to join.',
      to: '/onboarding',
      link: 'Complete onboarding',
    },
    {
      title: 'Add your USDT wallet',
      text: 'Payouts go to your USDT wallet on the TRON network (TRC20). Paste your wallet address on the Payouts page. Make sure it is a TRC20 address — an address from another network will not work.',
      to: '/app/affiliate/payouts',
      link: 'Add your wallet',
    },
    {
      title: 'Pick an offer',
      text: 'Browse the Offers page. Each offer shows what it pays, which countries it accepts, and what the visitor has to do — buy, sign up, or install. Start with one offer your audience already wants.',
      to: '/app/affiliate/offers',
      link: 'Browse offers',
    },
    {
      title: 'Make your first tracking link',
      text: 'Open the Tracking links page, pick your offer, and copy the link it makes. That link is yours — anyone who clicks it is counted as yours, and if they buy or sign up, you earn the commission. The tags are optional labels so you can tell clicks apart.',
      to: '/app/affiliate/tracking-links',
      link: 'Make a tracking link',
    },
    {
      title: 'Share the link',
      text: 'Share it where your audience already is — a post, a video description, a message, a website. Clicks and results show up in Reports, so you can see what is working.',
      to: '/app/affiliate/reports',
      link: 'See your reports',
    },
    {
      title: 'Get paid',
      text: 'When your approved balance reaches $50, request a payout on the Payouts page. We pay in USDT (TRC20). Approved money becomes payable 30 days after the end of the month it was approved in — that is what Net-30 means. Until 25 February 2027, you keep 100% of the payout.',
      to: '/app/affiliate/payouts',
      link: 'Request a payout',
    },
  ]
  return (
    <div className="space-y-4">
      <Card title="Getting started">
        <p className="text-sm text-slate-600">Seven steps from a new account to your first payout. Each step links to the page that does it — nothing here is a demo, and every number is the real term.</p>
        {isMember && (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">You are on a team — your team head handles approval and payouts. Your steps start at step 4: pick an offer and make a link with the team's code.</p>
        )}
      </Card>
      {steps.map((s, i) => (
        <Card key={s.title} title={`${i + 1}. ${s.title}`}>
          <p className="text-sm text-slate-600">{s.text}</p>
          <Link to={s.to} className="mt-3 inline-block text-sm font-semibold text-amber-700">{s.link} →</Link>
        </Card>
      ))}
      <Card title="Stuck on a step?">
        <p className="text-sm text-slate-600">Open a ticket and a person will answer — describe what you tried and what you saw.</p>
        <Link to="/app/affiliate/tickets" className="mt-3 inline-block text-sm font-semibold text-amber-700">Open a ticket →</Link>
      </Card>
    </div>
  )
}

/** The Dating Smartlink: one link, 1,000+ dating offers inside. The line
 *  is shown verbatim on the smartlink card and at the top of its detail
 *  page — it is the whole point of the product, so it cannot be buried
 *  in the description. No provider name, no backend mechanics. */
const SMARTLINK_OFFER_NAME = 'Dating Smartlink'
const SMARTLINK_LINE = 'One link with 1,000+ dating offers inside — each visitor sees the best match for their country and device.'
const isSmartlink = (o: Offer) => o.name === SMARTLINK_OFFER_NAME

/** The Gambling Smartlink: one link rotating the South Asia casino and
 *  sports betting brands (migration 033). Same shape as the dating line
 *  above — no provider name, no backend mechanics. The live card below
 *  renders only when at least one Gambling offer is active; all rows
 *  are paused at build time, so nothing shows yet. */
const GAMBLING_SMARTLINK_CODE = 'gambling'
const GAMBLING_SMARTLINK_LINE = 'One link that rotates South Asia casino and sports betting — each visitor sees the best match for their country and device.'
const isGamblingOffer = (o: Offer) => o.vertical === 'Gambling'

function countriesText(o: Offer): string {
  return !o.countries || o.countries.length === 0 || o.countries.includes('ALL') ? 'All countries' : o.countries.join(', ')
}

/** Coming-soon showcase — STATIC, by design. These offers are paused in
 *  the DB and RLS hides paused offers from affiliates, so the page
 *  cannot read them from the API; the cards below are the showcase.
 *  Rates verified 27 Nov 2026 against the DB rows (named + Mobidea) and
 *  the CJ welcome emails (CJ 8). When an offer activates, DELETE its row
 *  here — the live card then comes from getOffers() automatically.
 *  NEVER list here: the internal Test Finance Offer, the 9 CPAlead rows
 *  (account denied), the 23 Beans drafts (unverified), Velocity Outdoor
 *  (programme deactivated). */
type ComingSoonOffer = { name: string; payout: string; category: string; countries?: string }
const COMING_SOON_NAMED: ComingSoonOffer[] = [
  { name: 'GearUP', payout: '70% of each sale', category: 'Gaming & Software', countries: 'All countries' },
  { name: 'EdenFantasys', payout: '25% of each sale', category: 'Adult', countries: 'All countries' },
  { name: 'Canada Pet Care', payout: '10% of each sale', category: 'Pets', countries: 'All countries' },
  { name: 'Virgin Mobile UAE', payout: '$20.00 USD per order', category: 'Telecom', countries: 'All countries' },
  { name: 'AliExpress - Global', payout: 'From 1% of each sale', category: 'E-commerce', countries: 'All countries' },
  // Systeme.io: the DB row still holds the stale pre-promo 4500 bps; the
  // programme pays 60% lifetime, so 60% is the rate at launch.
  { name: 'Systeme.io', payout: '60% of each sale', category: 'Marketing Software', countries: 'All countries' },
  // Finance Survey RevShare: the 50% was seen once and never re-confirmed
  // — no % on this card until it is confirmed in writing at launch.
  { name: 'Finance Survey RevShare', payout: 'Revenue share — rate confirmed at launch', category: 'Surveys', countries: 'All countries' },
  // Gambling Smartlink: the 8 South Asia brands are paused in the DB
  // (migration 033). DELETE this row when the first gambling offer
  // activates — the live card then comes from getOffers() automatically.
  { name: 'Gambling Smartlink', payout: 'Up to 45% of net revenue', category: 'Gambling', countries: 'Bangladesh, India, Pakistan, Nepal' },
]
const COMING_SOON_MOBIDEA: ComingSoonOffer[] = [
  // Real € payouts from the DB rows (imported 27 Nov 2026, all CPA, EUR),
  // best first. Names are the cleaned DB names, spellings as stored.
  { name: 'NO Download Now PIN', payout: '€5.47 EUR per sign-up', category: 'Entertainment', countries: 'NO' },
  { name: 'FR Metaplay PIN', payout: '€3.19 EUR per sign-up', category: 'Entertainment', countries: 'FR' },
  { name: 'CZ Access to Content SMS', payout: '€0.91 EUR per sign-up', category: 'Entertainment', countries: 'CZ' },
  { name: 'YT Fitness All Click2SMS', payout: '€0.70 EUR per sign-up', category: 'Entertainment', countries: 'YT' },
  { name: 'IN Starly PayU', payout: '€0.64 EUR per sign-up', category: 'Entertainment', countries: 'IN' },
  { name: 'IN Starly PayU 7', payout: '€0.64 EUR per sign-up', category: 'Entertainment', countries: 'IN' },
  { name: 'EE AI Art Download SMS', payout: '€0.64 EUR per sign-up', category: 'Entertainment', countries: 'EE' },
  { name: 'PK Metaplay BILL Jazz Non billable PIN', payout: '€0.51 EUR per sign-up', category: 'Entertainment', countries: 'PK' },
  { name: 'PK Sypee Jazz billable PIN', payout: '€0.51 EUR per sign-up', category: 'Entertainment', countries: 'PK' },
  { name: 'PT Download File SMS', payout: '€0.47 EUR per sign-up', category: 'Entertainment', countries: 'PT' },
  { name: 'GH Story Portal MTN 2 Click', payout: '€0.32 EUR per sign-up', category: 'Entertainment', countries: 'GH' },
  { name: 'NG Game Win Evina MTN 2 Click', payout: '€0.29 EUR per sign-up', category: 'Gaming & Software', countries: 'NG' },
  { name: 'ZW Hardy Games Econet PIN', payout: '€0.29 EUR per sign-up', category: 'Gaming & Software', countries: 'ZW' },
  { name: 'GH HomiTV Videos MTN 2 click', payout: '€0.26 EUR per sign-up', category: 'Entertainment', countries: 'GH' },
  { name: 'JO MAGZMOBI All Non Billable PIN', payout: '€0.26 EUR per sign-up', category: 'Entertainment', countries: 'JO' },
  { name: 'JO Metaplay All Non Billable PIN', payout: '€0.26 EUR per sign-up', category: 'Entertainment', countries: 'JO' },
  { name: 'LK Metaplay Hutch Non Billable PIN', payout: '€0.26 EUR per sign-up', category: 'Entertainment', countries: 'LK' },
  { name: 'GH 233 Comics MTN 2 Click', payout: '€0.22 EUR per sign-up', category: 'Entertainment', countries: 'GH' },
  { name: 'MM Get Access ATOM PIN', payout: '€0.22 EUR per sign-up', category: 'Entertainment', countries: 'MM' },
  { name: 'NG Century Games MTN Evina 2Click', payout: '€0.19 EUR per sign-up', category: 'Gaming & Software', countries: 'NG' },
  { name: 'TZ Hardy Games Vodacom PIN', payout: '€0.19 EUR per sign-up', category: 'Gaming & Software', countries: 'TZ' },
  { name: 'ID Classic Histeria Telkomsel Evina PIN', payout: '€0.16 EUR per sign-up', category: 'Entertainment', countries: 'ID' },
  { name: 'ID FITRI Hot Telkomsel Evina PIN', payout: '€0.16 EUR per sign-up', category: 'Entertainment', countries: 'ID' },
  { name: 'ID Fun Fun Telkomsel Evina PIN', payout: '€0.16 EUR per sign-up', category: 'Entertainment', countries: 'ID' },
  { name: 'ID GAME 2.0 Telkomsel PIN', payout: '€0.16 EUR per sign-up', category: 'Gaming & Software', countries: 'ID' },
  { name: 'ID IZZ Hotquiz', payout: '€0.16 EUR per sign-up', category: 'Gaming & Software', countries: 'ID' },
  { name: 'BR Win Mistery Box PIN Revshare', payout: '€0.15 EUR per sign-up', category: 'Sweeps', countries: 'BR' },
  { name: 'CD Metaplay Africell Non billable PIN', payout: '€0.13 EUR per sign-up', category: 'Entertainment', countries: 'CD' },
  { name: 'PH Darna Play Games', payout: '€0.13 EUR per sign-up', category: 'Gaming & Software', countries: 'PH' },
  { name: 'PK Metagame Jazz Non billable PIN', payout: '€0.13 EUR per sign-up', category: 'Gaming & Software', countries: 'PK' },
  { name: 'PK Slypee Jazz Non billable PIN', payout: '€0.13 EUR per sign-up', category: 'Entertainment', countries: 'PK' },
  { name: 'TZ TeeAI Vodacom PIN', payout: '€0.10 EUR per sign-up', category: 'Entertainment', countries: 'TZ' },
  { name: 'IN Mystery Box PIN', payout: '€0.02 EUR per sign-up', category: 'Sweeps', countries: 'IN' },
]
const COMING_SOON_CJ: ComingSoonOffer[] = [
  // Rates from the CJ welcome emails (verified 26 Nov 2026). No DB rows
  // exist for these — the tracking links were never collected — so these
  // cards are static only and must never gain a tracking-link action.
  { name: 'DUOTTS', payout: '6% per sale', category: 'E-bikes' },
  { name: '24-7PressRelease', payout: '$15.00 USD flat per sale', category: 'Marketing' },
  { name: 'Abelssoft', payout: '50% per sale', category: 'Software' },
  { name: 'Bilet BG / Eistirio', payout: '2–7% per sale', category: 'Tickets', countries: 'Bulgaria, Greece, Cyprus' },
  { name: 'Silver Gold Bull', payout: '1.7% new customers / 0.8% returning', category: 'Finance' },
  { name: 'DHGate', payout: '2–50% per sale', category: 'E-commerce' },
  { name: 'Corel', payout: 'Rate confirmed at launch', category: 'Software' },
  { name: 'TikTok Shop US', payout: 'Rate confirmed at launch', category: 'E-commerce', countries: 'United States' },
]

export function AffiliateOffers() {
  const { user } = useAuth()
  const { data: offers, loading } = useLoad(getOffers, [] as Offer[])
  const [q, setQ] = useState('')
  const [vertical, setVertical] = useState('')
  const filtered = offers.filter((o) => (!q || o.name.toLowerCase().includes(q.toLowerCase())) && (!vertical || o.vertical === vertical))
  const active = filtered.filter((o) => o.status === 'active')
  const comingSoon = [...COMING_SOON_NAMED, ...COMING_SOON_MOBIDEA, ...COMING_SOON_CJ]
  // Gambling Smartlink: renders only once a Gambling offer is active.
  // Team members share their head's code (same pattern as the promo kit).
  const gamblingActive = offers.filter((o) => o.status === 'active' && isGamblingOffer(o))
  const gamblingCode = user?.teamContext?.parentCode ?? user?.affiliateCode ?? ''
  return (
    <div className="space-y-4">
      {gamblingActive.length > 0 && gamblingCode && (
        <Card title="Gambling Smartlink">
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{GAMBLING_SMARTLINK_LINE}</p>
          <p className="mt-2 text-sm text-slate-600">You earn 22.5%–45% of net revenue, depending on the brand. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.</p>
          <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">{smartLink(gamblingCode, GAMBLING_SMARTLINK_CODE)}</p>
          <CopyButton text={smartLink(gamblingCode, GAMBLING_SMARTLINK_CODE)} label="Copy smartlink" className="mt-3" />
        </Card>
      )}
      <Card title="Offers">
        <div className="mb-4 flex gap-2">
          <input className={inputCls} placeholder="Search offers…" aria-label="Search offers" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inputCls} value={vertical} onChange={(e) => setVertical(e.target.value)}>
            <option value="">All categories</option>
            {[...new Set(offers.map((o) => o.vertical))].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        {loading ? <p className="py-2 text-sm text-slate-500">Loading offers…</p>
        : active.length === 0 ? <Empty text="No offers match your filters. Clear the search or pick a different category." /> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {active.map((o) => (
              <div key={o.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{o.name}</h3>
                  <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">Open</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{offerHeadline(o)}</p>
                <p className="mt-0.5 text-sm text-slate-600">{offerPayoutPlain(o)}</p>
                {isSmartlink(o) && (
                  <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{SMARTLINK_LINE}</p>
                )}
                <p className="mt-2 text-sm text-slate-500">{o.vertical ?? '—'} · {countriesText(o)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/app/affiliate/offers/${o.id}`} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">View</Link>
                  <Link to={`/app/affiliate/tracking-links?offer=${o.id}`} className={btnCls}>Get tracking link</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Coming soon">
        <p className="mb-4 text-sm text-slate-600">Offers we're finishing the setup for — they'll open here when they're ready. Nothing below can be run yet.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {comingSoon.map((c) => (
            <div key={c.name} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{c.name}</h3>
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Coming soon</span>
              </div>
              <p className="mt-1 text-base font-bold text-slate-800">{c.payout}</p>
              <p className="mt-0.5 text-sm text-slate-500">{c.category}{c.countries ? ` · ${c.countries}` : ''}</p>
              <p className="mt-2 text-sm text-slate-500">Opening soon — we're finishing the setup.</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** Escape text for embedding in an HTML snippet. */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function CopyButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={`${btnCls} ${className}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => undefined)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

const STEP_ICONS = {
  link: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
  ),
}

/** Ready-made promotion material for one active offer: banners, a
 *  poster, bio lines, and the steps to share them. Every template
 *  carries the affiliate's own tracking link — team members use their
 *  team head's code, same as the tracking-links page. Active offers
 *  only; coming-soon cards get no promo kit. */
function AffiliatePromoKit({ offer }: { offer: Offer }) {
  const { user } = useAuth()
  const code = user?.teamContext?.parentCode ?? user?.affiliateCode ?? ''
  const url = code ? trackingLink(code, offer.id) : ''
  const payout = offerPayoutPlain(offer)
  const headline = offerHeadline(offer)
  const [done, setDone] = useState<string[]>([])
  const toggle = (k: string) => setDone((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]))

  const wideHtml = `<a href="${url}" style="display:block;max-width:728px;background:linear-gradient(135deg,#1e1b4b,#294ffc);color:#ffffff;padding:18px 24px;border-radius:12px;text-decoration:none;font-family:sans-serif;"><span style="font-size:20px;font-weight:700;">${escHtml(offer.name)}</span><br><span style="font-size:14px;">${escHtml(payout)}</span></a>`
  const squareHtml = `<a href="${url}" style="display:block;width:300px;background:linear-gradient(160deg,#312e81,#2e8cff);color:#ffffff;padding:24px;border-radius:16px;text-decoration:none;font-family:sans-serif;text-align:center;"><span style="font-size:22px;font-weight:700;">${escHtml(offer.name)}</span><br><span style="font-size:14px;">${escHtml(payout)}</span><br><span style="display:inline-block;margin-top:12px;background:#fbbf24;color:#0b1220;font-weight:700;font-size:14px;padding:8px 16px;border-radius:999px;">Start now</span></a>`
  const posterHtml = `<div style="width:360px;background:#f4f5f9;border-radius:16px;padding:28px 24px;font-family:sans-serif;text-align:center;"><p style="color:#294ffc;font-weight:700;letter-spacing:2px;font-size:12px;">AFFILAYER</p><h2 style="font-size:26px;margin:8px 0;color:#1e1b4b;">${escHtml(offer.name)}</h2><p style="font-size:15px;color:#2b2b4d;">${escHtml(offerCommissionLabel(offer))}</p><p style="margin-top:16px;"><a href="${url}" style="color:#294ffc;font-weight:700;word-break:break-all;">${escHtml(url)}</a></p></div>`

  const bios = [
    `Earning with AffiLayer — ${offer.name}: ${payout}. My link: ${url} · Code: ${code}`,
    `${offer.name} pays ${headline} — I promote it with AffiLayer. Join me: ${url} · Code: ${code}`,
    `My AffiLayer link for ${offer.name} — ${payout}. ${url} · Code: ${code}`,
  ]
  const todos = [
    'Copy your tracking link',
    'Put the banner on your page or in a post',
    'Add a bio line to your profile',
    'Share your link in one place today',
  ]
  const steps = [
    { key: 'link', icon: STEP_ICONS.link, title: '1. Copy your link', text: 'Your own link for this offer. Anyone who uses it counts as yours.', action: 'Copy your link', copy: url },
    { key: 'banner', icon: STEP_ICONS.image, title: '2. Get your banner', text: 'A ready-made banner with your link built in. Paste it on your page or in a post.', action: 'Copy banner HTML', copy: wideHtml },
    { key: 'share', icon: STEP_ICONS.share, title: '3. Share it', text: 'Post it where your people are — WhatsApp, Facebook, Telegram, or your own page.', action: 'Copy link to share', copy: url },
  ]

  return (
    <Card title="Promote this offer">
      <p className="text-sm text-slate-600">Everything below is ready to use — your tracking link is already built into every template. Copy, paste, share.</p>
      {user?.teamContext && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">These templates use your team head's code — clicks and earnings go to the team.</p>}
      {!url && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your affiliate code is not available on this account yet, so a working link cannot be generated. Please contact support@affilayer.com.</p>}
      {url && (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-900">Your code: <span className="font-mono">{code}</span></p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.key} className="flex flex-col rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/70 to-white p-4 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e1b4b] to-[#294ffc] text-white">{s.icon}</div>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 flex-1 text-sm text-slate-600">{s.text}</p>
                <CopyButton text={s.copy} label={s.action} className="mt-3 self-start" />
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Your to-do list <span className="font-normal text-slate-500">— {done.length} of {todos.length} done</span></p>
            <ul className="mt-2 space-y-2">
              {todos.map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => toggle(t)} className="flex items-center gap-2 text-left text-sm text-slate-700" aria-pressed={done.includes(t)}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${done.includes(t) ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>✓</span>
                    <span className={done.includes(t) ? 'line-through text-slate-400' : ''}>{t}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <h3 className="mt-6 text-base font-semibold text-slate-900">Banners — your link is built in</h3>
          <div className="mt-3 space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Wide banner</p>
              <div className="rounded-xl bg-gradient-to-r from-[#1e1b4b] to-[#294ffc] px-6 py-4 text-white">
                <p className="text-lg font-bold">{offer.name}</p>
                <p className="text-sm text-indigo-100">{payout}</p>
              </div>
              <CopyButton text={wideHtml} label="Copy HTML" className="mt-2" />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Square banner</p>
              <div className="flex aspect-square w-full max-w-[300px] flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#312e81] to-[#2e8cff] p-6 text-center text-white">
                <p className="text-xl font-bold">{offer.name}</p>
                <p className="mt-1 text-sm text-indigo-100">{payout}</p>
                <span className="mt-3 rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-[#0b1220]">Start now</span>
              </div>
              <CopyButton text={squareHtml} label="Copy HTML" className="mt-2" />
            </div>
          </div>
          <h3 className="mt-6 text-base font-semibold text-slate-900">Poster</h3>
          <div className="mt-3 w-full max-w-[360px] rounded-2xl bg-[#f4f5f9] p-7 text-center">
            <p className="text-xs font-bold tracking-[2px] text-[#294ffc]">AFFILAYER</p>
            <p className="mt-2 text-2xl font-bold text-[#1e1b4b]">{offer.name}</p>
            <p className="mt-1 text-sm text-[#2b2b4d]">{offerCommissionLabel(offer)}</p>
            <p className="mt-4 break-all text-sm font-semibold text-[#294ffc]">{url}</p>
          </div>
          <CopyButton text={posterHtml} label="Copy poster HTML" className="mt-2" />
          <h3 className="mt-6 text-base font-semibold text-slate-900">Bio lines — paste one on your profile</h3>
          <div className="mt-3 space-y-3">
            {bios.map((b, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="break-words text-sm text-slate-700">{b}</p>
                <CopyButton text={b} label="Copy bio" className="mt-2" />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

export function AffiliateOfferDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  // Team members cannot apply to offers (design §3) — the team head
  // applies. The button is hidden; the tracking-link shortcut stays,
  // since members generate links with the team head's code.
  const isMember = !!user?.teamContext
  const [offer, setOffer] = useState<Offer | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [application, setApplication] = useState<OfferApplication | null>(null)
  const [applyError, setApplyError] = useState('')
  const [applying, setApplying] = useState(false)
  useEffect(() => { if (id) getOffers().then((os) => { setOffer(os.find((o) => o.id === id)); setLoaded(true) }).catch(() => setLoaded(true)) }, [id])
  // PostHog offer_viewed (27 Nov 2026): once per offer shown, with id
  // + name only. The ref guard skips the StrictMode double-effect in dev.
  const viewedRef = useRef('')
  useEffect(() => {
    if (offer && viewedRef.current !== offer.id) {
      viewedRef.current = offer.id
      trackEvent('offer_viewed', { offer_id: offer.id, offer_name: offer.name })
    }
  }, [offer])
  useEffect(() => {
    if (id) getMyOfferApplications().then((apps) => setApplication(apps.find((a) => a.offerId === id) ?? null))
  }, [id])
  // Show a loading state until the offers arrive — rendering "not found"
  // first flashed it on every click-through from the Offers page.
  if (!loaded) return <Card><p className="text-sm text-slate-500">Loading offer…</p></Card>
  if (!offer) return <Card><Empty text="Offer not found." /></Card>
  const apply = async () => {
    setApplying(true)
    const r = await applyToOffer(offer)
    setApplying(false)
    if (r.error) { setApplyError(r.error); return }
    trackEvent('offer_applied', { offer_id: offer.id, offer_name: offer.name })
    const apps = await getMyOfferApplications()
    setApplication(apps.find((a) => a.offerId === offer.id) ?? null)
  }
  return (
    <>
    <Card title={offer.name}>
      <p className="text-sm text-slate-600">{offer.description}</p>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-slate-900">{offerPayoutPlain(offer)}</p>
      {isSmartlink(offer) && (
        <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <span className="font-semibold text-sky-900">{SMARTLINK_LINE}</span>
        </div>
      )}
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">How you earn: </span>
        Share your tracking link. When a visitor buys or registers through it, the sale counts as yours and shows in your reports. You get paid in USDT (TRC20) once your approved balance reaches $50, Net-30.
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Category</dt><dd>{offer.vertical ?? '—'}</dd></div>
        <div><dt className="text-slate-500">What earns you money</dt><dd>{resultNoun(offer.conversionType) === 'result' ? 'A completed action' : `A ${resultNoun(offer.conversionType)}`}</dd></div>
        <div><dt className="text-slate-500">How it pays</dt><dd>{offerCommissionLabel(offer)}</dd></div>
        <div><dt className="text-slate-500">Countries</dt><dd>{!offer.countries || offer.countries.length === 0 || offer.countries.includes('ALL') ? 'All countries' : offer.countries.join(', ')}</dd></div>
        <div><dt className="text-slate-500">Devices</dt><dd>{(offer.devices ?? []).join(', ') || 'All devices'}</dd></div>
        <div><dt className="text-slate-500">Where you can promote it</dt><dd>{(offer.trafficSources ?? []).join(', ') || 'Anywhere — ask the team if unsure'}</dd></div>
        <div><dt className="text-slate-500">Limits</dt><dd>{offer.capDaily != null ? `At most ${offer.capDaily} results a day` : 'No daily limit'}{offer.capTotal != null ? `, ${offer.capTotal} in total` : ''}.</dd></div>
        <div><dt className="text-slate-500">Do you need approval first?</dt><dd>{offer.approvalRequired ? 'Yes — apply below and the advertiser reviews it.' : 'No — you can start right away.'}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd>{offer.status === 'active' ? 'Open' : offer.status === 'paused' ? 'Paused' : offer.status}</dd></div>
      </dl>
      {application
        ? <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{application.status === 'approved' ? 'You are approved to run this offer.' : application.status === 'pending' ? 'Application submitted. You will be notified when the advertiser reviews it.' : `Application status: ${application.status}.`}</p>
        : !isMember && <button className={`${btnCls} mt-4`} onClick={apply} disabled={applying}>{applying ? 'Submitting…' : offer.approvalRequired ? 'Apply for this offer' : 'Join this offer'}</button>}
      {applyError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{applyError}</p>}
      <div className="mt-4 rounded-lg bg-amber-50 px-3 py-3">
        <p className="text-sm font-semibold text-slate-900">Get your tracking link</p>
        <p className="mt-1 text-sm text-slate-600">Your tracking link sends people there — and counts them as yours. Pick this offer, copy your link, and share it anywhere you promote.</p>
        <Link to={`/app/affiliate/tracking-links?offer=${offer.id}`} className={`${btnCls} mt-3 inline-block`}>Get your tracking link →</Link>
      </div>
    </Card>
    {offer.status === 'active' && <AffiliatePromoKit offer={offer} />}
    </>
  )
}

export function AffiliateMyCampaigns() {
  const { data: offers } = useLoad(getOffers, [] as Offer[])
  const { data: applications } = useLoad(getMyOfferApplications, [] as OfferApplication[])
  // Only offers this affiliate actually joined or applied for — listing
  // every active offer here told a new affiliate these were theirs.
  const mine = applications.map((a) => ({ app: a, offer: offers.find((o) => o.id === a.offerId) })).filter((x): x is { app: OfferApplication; offer: Offer } => !!x.offer)
  return (
    <Card title="My campaigns">
      <p className="mb-3 text-sm text-slate-500">Offers you have joined or applied for — and where each application stands.</p>
      {mine.length === 0 ? <Empty text="You haven't joined any offer yet." /> : mine.map(({ app, offer }) => (
        <div key={offer.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
          <span>{offer.name} — {offerPayoutPlain(offer)} <span className="text-slate-500">· {app.status === 'approved' ? 'Approved — you can run it' : app.status === 'pending' ? 'Waiting for review' : `Application: ${app.status}`}</span></span>
          <Link to={`/app/affiliate/offers/${offer.id}`} className="font-semibold text-amber-700">View</Link>
        </div>
      ))}
      {mine.length === 0 && <p className="mt-2 text-center text-sm"><Link to="/app/affiliate/offers" className="font-semibold text-amber-700">Browse offers →</Link></p>}
    </Card>
  )
}

export function AffiliateTrackingLinks() {
  const { user } = useAuth()
  const { data: offers } = useLoad(getOffers, [] as Offer[])
  const [searchParams] = useSearchParams()
  const [offerId, setOfferId] = useState(searchParams.get('offer') ?? '')
  const [subs, setSubs] = useState({ sub1: '', sub2: '', sub3: '', sub4: '', sub5: '' })
  // A team member's links carry the team head's code, not their own
  // (their own code does not work while they are on a team).
  const isMember = !!user?.teamContext
  const code = user?.teamContext?.parentCode ?? user?.affiliateCode ?? ''
  const url = useMemo(
    () => (offerId && code ? trackingLink(code, offerId, subs) : ''),
    [offerId, code, subs],
  )
  const [copied, setCopied] = useState(false)
  // PostHog tracking_link_generated (27 Nov 2026): the copy click is
  // the moment a link actually goes out into the world — a link built
  // but never copied is never used. Offer id + name only.
  const copyLink = () => {
    navigator.clipboard?.writeText(url).catch(() => undefined)
    setCopied(true)
    const o = offers.find((x) => x.id === offerId)
    trackEvent('tracking_link_generated', { offer_id: offerId, offer_name: o?.name ?? offerId })
  }
  return (
    <Card title="Tracking link generator">
      <p className="mb-4 text-sm text-slate-500">Your tracking link is your own web address for one offer. Anyone who clicks it is counted as yours — if they buy or sign up, you earn the commission.</p>
      {isMember && <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">This link uses your team head's code — clicks and earnings go to the team.</p>}
      <div className="space-y-3">
        <div><label className="mb-1 block text-sm font-medium" htmlFor="tlg-offer">Offer</label>
          <select id="tlg-offer" className={`${inputCls} w-full`} value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            <option value="">Select an offer…</option>
            {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {!offerId && <p className="text-sm text-slate-500">Pick an offer above to make your link.</p>}
        <div>
          <p className="mb-1 text-sm font-medium">Tags (optional)</p>
          <p className="mb-2 text-xs text-slate-500">Tags let you tell clicks apart — for example, Tag 1 could be the post or ad where you shared the link. Leave them empty if you do not need them.</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {(Object.keys(subs) as (keyof typeof subs)[]).map((k, i) => (
              <input key={k} className={inputCls} placeholder={`Tag ${i + 1}`} aria-label={`Tag ${i + 1} (optional)`} value={subs[k]} onChange={(e) => setSubs((s) => ({ ...s, [k]: e.target.value }))} />
            ))}
          </div>
        </div>
        {offerId && !code && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your affiliate code is not available on this account yet, so a working link cannot be generated. Please contact support@affilayer.com.</p>
        )}
        {url && (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="break-all text-sm font-mono">{url}</p>
            <button className={`${btnCls} mt-3`} onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
            <p className="mt-3 text-xs text-slate-500">Share this link anywhere you promote the offer. Clicks and results appear in Reports.</p>
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
      <select className={inputCls} aria-label="Filter by offer" value={filters.offerId ?? ''} onChange={(e) => setFilters({ ...filters, offerId: e.target.value || undefined })}>
        <option value="">All offers</option>
        {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select className={inputCls} aria-label="Filter by country" value={filters.country ?? ''} onChange={(e) => setFilters({ ...filters, country: e.target.value || undefined })}>
        <option value="">All countries</option>{['US', 'GB', 'CA', 'DE', 'FR'].map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className={inputCls} aria-label="Filter by device" value={filters.device ?? ''} onChange={(e) => setFilters({ ...filters, device: e.target.value || undefined })}>
        <option value="">All devices</option>{['desktop', 'mobile', 'tablet'].map((d) => <option key={d}>{d}</option>)}
      </select>
      <select className={inputCls} aria-label="Filter by source" value={filters.source ?? ''} onChange={(e) => setFilters({ ...filters, source: e.target.value || undefined })}>
        <option value="">All sources</option>{([['SEO', 'Search'], ['Social', 'Social media'], ['Email', 'Email'], ['PPC', 'Paid ads'], ['Content', 'Content']] as const).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </div>
  )
}

export function AffiliateReports() {
  const { user } = useAuth()
  const isMember = !!user?.teamContext
  const [filters, setFilters] = useState<ReportFilters>({ affiliateCode: user?.affiliateCode })
  const [clicks, setClicks] = useState<Click[]>([])
  const [convs, setConvs] = useState<Conversion[]>([])
  const [ledger, setLedger] = useState<CommissionLedgerEntry[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  useEffect(() => {
    getClicks(filters).then(setClicks)
    getConversions(filters).then(setConvs)
    getLedgerEntries(filters).then(setLedger)
    getOffers().then(setOffers)
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
        {isMember && <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">Team totals — these are your whole team's numbers, not just yours.</p>}
        <ReportFiltersForm filters={filters} setFilters={setFilters} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Clicks" value={String(clicks.length)} sub="People who clicked your links" icon="chart" />
          <Stat label="Results" value={String(convs.length)} sub="Clicks that turned into a sale, sign-up or install" icon="check" />
          {/* M-05: approved revenue is ledger commission, not the sum of
              conversion payouts — for CPS the payout is the sale value. */}
          <Stat label="Approved revenue" value={`$${sumCommissions(convs.filter((c) => c.status === 'approved'), ledger, offers).toFixed(2)}`} sub="Only approved results count — waiting ones pay nothing yet" icon="wallet" />
        </div>
      </Card>
      <Card title="By offer">
        {byOffer.length === 0 ? <><Empty text="No clicks or results yet for these filters." /><p className="text-center text-sm"><Link to="/app/affiliate/tracking-links" className="font-semibold text-amber-700">Make your first tracking link →</Link></p></> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Offer</th><th>Clicks</th><th>Results</th></tr></thead>
            {/* Walk audit 20 Nov 2026: show the offer name, not the bare UUID. */}
            <tbody>{byOffer.map(([id, v]) => <tr key={id} className="border-t border-slate-100"><td className="py-2">{offers.find((o) => o.id === id)?.name ?? id}</td><td>{v.clicks}</td><td>{v.convs}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
      <Card title="Clicks"><BarChart data={last7DaysSeries(clicks)} /></Card>
    </div>
  )
}

export function AffiliatePostbacks() {
  const { user } = useAuth()
  const [configs, setConfigs] = useState<PostbackConfig[]>([])
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { getMyPostbackConfigs().then(setConfigs) }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    let parsed: URL
    try { parsed = new URL(url.trim()) } catch { setError('Enter a valid URL starting with http:// or https://.'); return }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') { setError('Postback URL must start with http:// or https://.'); return }
    const r = await savePostbackConfig(url.trim())
    if (r.error) { setError(r.error); return }
    setUrl('')
    setError('')
    setSaved(true)
    getMyPostbackConfigs().then(setConfigs)
  }
  // Team members have no postbacks of their own — a member's
  // conversions sit under the team head, so a postback of theirs could
  // never fire. The page is hidden from member navigation; a direct
  // URL opens the dashboard with a plain message instead.
  if (user?.teamContext) return <Navigate to="/app/affiliate" replace state={{ notice: 'Postbacks are handled by your team head.' }} />
  return (
    <Card title="Postbacks">
      <p className="mb-3 text-sm text-slate-500">A postback is an automatic message our system sends to your own website or tracker the moment you earn a commission. Most affiliates never need this — only set it up if you run your own tracking.</p>
      <p className="mb-3 text-sm text-slate-500">Your postback address can include these placeholders, which we fill in for each result: {'{click_id}'} is the click that earned, {'{conversion_id}'} is the result itself, {'{payout}'} is the commission in dollars, {'{currency}'} is the currency, {'{status}'} is approved or pending, and {'{sub1}'} is your Tag 1 from the tracking link.</p>
      <form onSubmit={submit} className="flex gap-2">
        <input className={`${inputCls} flex-1`} type="url" required placeholder="https://example.com/postback?click_id={click_id}&payout={payout}" aria-label="Postback URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className={btnCls}>Save</button>
      </form>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Postback saved.</p>}
      {configs.length === 0 ? <p className="mt-4 text-sm text-slate-500">No postbacks set up. That is fine — this is optional, and everything works without one.</p> : configs.map((u) => <p key={u.id} className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm font-mono">{u.url}</p>)}
    </Card>
  )
}

export function AffiliateEarnings() {
  const { user } = useAuth()
  const isMember = !!user?.teamContext
  const { data: convs } = useLoad(() => getConversions(), [] as Conversion[])
  const { data: ledger } = useLoad(() => getLedgerEntries(), [] as CommissionLedgerEntry[])
  const { data: offers } = useLoad(() => getOffers(), [] as Offer[])
  const approved = convs.filter((c) => c.status === 'approved')
  const pending = convs.filter((c) => c.status === 'pending')
  return (
    <div className="space-y-4">
      {isMember && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">Team totals — these are your whole team's numbers, not just yours.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* M-05: earnings are ledger commission, not conversion payout sums. */}
        <Stat label="Approved earnings" icon="wallet" value={`$${sumCommissions(approved, ledger, offers).toFixed(2)}`} sub="Money from approved results — this is what you can withdraw" />
        <Stat label="Waiting for approval" value={`$${sumCommissions(pending, ledger, offers).toFixed(2)}`} sub="Results not confirmed yet — they pay nothing until approved" icon="clock" />
        <Stat label="Not paid" value={String(convs.filter((c) => c.status === 'rejected' || c.status === 'reversed').length)} sub="Results the advertiser did not approve" icon="alert" />
      </div>
      <Card title="Results">
        {convs.length === 0 ? <><Empty text="No results yet." /><p className="text-center text-sm"><Link to="/app/affiliate/tracking-links" className="font-semibold text-amber-700">Make a tracking link for an offer, share it, and your sales and sign-ups will show up here →</Link></p></> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Offer</th><th>Commission</th><th>Status</th></tr></thead>
            {/* Walk audit 26 Nov 2026: show the offer name, not the bare UUID. */}
            <tbody>{convs.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2">{c.createdAt.slice(0, 10)}</td><td>{offers.find((o) => o.id === c.offerId)?.name ?? 'Unknown offer'}</td><td>${conversionCommission(c, ledger, offers).toFixed(2)} {c.currency}</td><td>{c.status}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}

export function AffiliatePayouts() {
  const { user } = useAuth()
  const [live, setLive] = useState<{ payouts: PayoutRequest[]; conversions: Conversion[]; method: string; wallet?: PayoutWallet; npPayouts: NpPayout[] } | null>(null)
  const [amount, setAmount] = useState('')
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [walletSaved, setWalletSaved] = useState(false)
  const [walletError, setWalletError] = useState('')
  const [walletBusy, setWalletBusy] = useState(false)
  const { data: ledger } = useLoad(() => getLedgerEntries(), [] as CommissionLedgerEntry[])
  const { data: offers } = useLoad(() => getOffers(), [] as Offer[])
  // There is no network-settings table yet, so the published terms live
  // in lib/network-settings.ts as constants.
  const settings = NETWORK_SETTINGS
  useEffect(() => {
    Promise.all([getPayouts(), getConversions(), getMyAffiliateProfile(), getNpPayouts()]).then(([payouts, conversions, ap, npPayouts]) => {
      setLive({ payouts, conversions, method: ap.paymentMethod ?? 'USDT (TRC20)', wallet: ap.payoutWallet, npPayouts })
      if (ap.payoutWallet?.address) setWalletAddress(ap.payoutWallet.address)
    })
  }, [])
  const payouts = live?.payouts ?? []
  const conversions = live?.conversions ?? []
  // Match rows by owner id (the affiliate code is a display/tracking
  // identifier, not the row owner).
  const mine = payouts.filter((p) => p.affiliateId === user?.id)
  // M-05: the payoutable balance is ledger commission — summing
  // conversion payout would let a CPS affiliate request up to 10x
  // their real balance (sale value instead of commission).
  const approvedBalance = sumCommissions(
    conversions.filter((c) => c.affiliateId === user?.id && c.status === 'approved'),
    ledger, offers)
  const method = live?.method ?? 'USDT (TRC20)'
  const request = async (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError('Enter an amount greater than 0.'); return }
    if (value < settings.minPayout) { setError(`Minimum payout is $${settings.minPayout.toFixed(2)} ${settings.defaultCurrency}.`); return }
    if (value > approvedBalance) { setError(`Amount exceeds your approved balance of $${approvedBalance.toFixed(2)}.`); return }
    const r = await requestPayout(value, settings.defaultCurrency, method)
    if (r.error) { setError(r.error); return }
    trackEvent('payout_requested', { amount: value, currency: settings.defaultCurrency })
    const fresh = await getPayouts()
    setLive((prev) => (prev ? { ...prev, payouts: fresh } : prev))
    setAmount('')
    setError('')
    setRequested(true)
  }
  const saveWallet = async (e: FormEvent) => {
    e.preventDefault()
    const address = walletAddress.trim()
    if (!looksLikeTrc20(address)) { setWalletError('Enter a valid USDT TRC20 address (starts with T, 34 characters).'); return }
    setWalletBusy(true)
    setWalletError('')
    const v = await validatePayoutAddress(address, 'usdttrc20')
    if (v.error || v.valid === false) { setWalletBusy(false); setWalletError(v.error ?? 'NOWPayments rejected this address.'); return }
    const r = await savePayoutWallet({ currency: 'usdttrc20', address })
    setWalletBusy(false)
    if (r.error) { setWalletError(r.error); return }
    // PostHog wallet_added (27 Nov 2026): no address or value — the
    // wallet address itself must never leave the app in analytics.
    trackEvent('wallet_added')
    setLive((prev) => (prev ? { ...prev, wallet: { currency: 'usdttrc20', address } } : prev))
    setWalletSaved(true)
  }
  const npByRequest = new Map((live?.npPayouts ?? []).map((n) => [n.payoutRequestId, n]))
  // Payouts are handled by the team head: a member has no payout
  // wallet step and no payout of their own to request. The page is
  // hidden from member navigation; a direct URL opens the dashboard
  // with a plain message instead.
  if (user?.teamContext) return <Navigate to="/app/affiliate" replace state={{ notice: 'Payouts are handled by your team head.' }} />
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">How you get paid: in USDT on TRON (TRC20), to the wallet below. Minimum payout ${settings.minPayout.toFixed(2)}. Approved money becomes payable 30 days after the end of the month it was approved.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Approved balance" icon="banknote" value={`$${approvedBalance.toFixed(2)}`} sub="Money from approved results — this is what you can withdraw" />
        <Stat label="Minimum payout" icon="banknote" value={`$${settings.minPayout.toFixed(2)} ${settings.defaultCurrency}`} sub="You can withdraw once your approved balance reaches this" />
      </div>
      {(
        <Card title="Payout wallet (crypto)">
          <form onSubmit={saveWallet} className="flex gap-2">
            <input className={inputCls} type="text" placeholder="USDT TRC20 address (starts with T)" aria-label="USDT TRC20 address" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} />
            <button className={btnCls} disabled={walletBusy}>{walletBusy ? 'Checking…' : 'Save wallet'}</button>
          </form>
          {walletError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{walletError}</p>}
          {walletSaved && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Wallet saved and verified with NOWPayments.</p>}
          <p className="mt-3 text-xs text-slate-400">Payouts are sent in USDT on TRON (TRC20) to this address. The address is checked with NOWPayments before it is saved — a wrong address means the payout cannot be sent. {live?.wallet?.address ? `Saved: ${live.wallet.address}` : 'No wallet saved yet — add one before requesting a payout.'}</p>
        </Card>
      )}
      <Card title="Request a payout">
        <form onSubmit={request} className="flex gap-2">
          <input className={inputCls} type="number" min="0" step="0.01" placeholder={`Amount (${settings.defaultCurrency})`} aria-label={`Amount (${settings.defaultCurrency})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className={btnCls}>Request payout</button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {requested && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Payout request submitted for review.</p>}
        <p className="mt-3 text-xs text-slate-400">Payouts are calculated from approved commissions in the ledger and paid in USDT (TRC20). Approved commissions become payable Net-30 — 30 days after the end of the month in which they were approved. Requests are reviewed by the network admin.</p>
      </Card>
      <Card title="Payout history">
        {mine.length === 0 ? <><Empty text="No payouts yet." /><p className="text-center text-sm text-slate-500">Once your approved balance reaches ${settings.minPayout.toFixed(2)} and your wallet above is saved, you can request your first payout.</p></> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Payment status</th></tr></thead>
            <tbody>{mine.map((p) => { const np = npByRequest.get(p.id); return (
              <tr key={p.id} className="border-t border-slate-100"><td className="py-2">{p.createdAt.slice(0, 10)}</td><td>${p.amount.toFixed(2)} {p.currency}</td><td>{p.method ?? '—'}</td><td>{p.status}</td><td>{np ? `${np.currency} · ${np.status}` : '—'}</td></tr>
            ) })}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}

export function AffiliateProfile() {
  const { user } = useAuth()
  const isMember = !!user?.teamContext
  const statusPlain = user?.status === 'approved' ? 'Approved' : user?.status === 'pending' ? 'Waiting for review' : user?.status === 'rejected' ? 'Not approved' : user?.status ?? '—'
  return (
    <Card title="Profile">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Name</dt><dd>{user?.fullName ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Email</dt><dd>{user?.email}</dd></div>
        <div><dt className="text-slate-500">Account type</dt><dd>{user?.role === 'affiliate' ? 'Affiliate' : user?.role === 'advertiser' ? 'Advertiser' : user?.role ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Approval status</dt><dd>{statusPlain}</dd></div>
        {isMember
          // A member's own code does not work while they are on a team,
          // so it is not shown — only the team head's code, which is
          // inside every tracking link the member makes.
          ? <div><dt className="text-slate-500">Your team code</dt><dd className="font-mono">{user?.teamContext?.parentCode ?? '—'}</dd></div>
          : <div><dt className="text-slate-500">Your affiliate code</dt><dd className="font-mono">{user?.affiliateCode ?? '—'}</dd></div>}
      </dl>
      <p className="mt-3 text-xs text-slate-500">{isMember ? 'This code is inside every tracking link you make.' : 'This code is inside every tracking link you make — it is how clicks and results are counted as yours.'}</p>
      <Link to="/onboarding" className="mt-4 inline-block font-semibold text-amber-700 text-sm">Edit onboarding details →</Link>
    </Card>
  )
}

export function AffiliateTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { getTickets().then(setTickets) }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await createTicket(subject.trim(), message.trim())
    if (r.error) { setError(r.error); return }
    setSent(true)
    setSubject('')
    setMessage('')
    getTickets().then(setTickets)
  }
  return (
    <div className="space-y-4">
      <Card title="Message the team">
        <form onSubmit={submit} className="space-y-3">
          <input className={`${inputCls} w-full`} placeholder="Subject" aria-label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className={`${inputCls} w-full`} rows={4} placeholder="Describe the issue…" aria-label="Describe the issue" required value={message} onChange={(e) => setMessage(e.target.value)} />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className={btnCls}>Submit ticket</button>
        </form>
        {sent && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Ticket submitted.</p>}
      </Card>
      <Card title="My tickets">
        {tickets.length === 0 ? <Empty text="No messages yet. If something is unclear or broken, send us a message — we reply by email." /> : tickets.map((t) => (
          <div key={t.id} className="border-b border-slate-100 py-2 text-sm last:border-0">
            <p className="font-medium">{t.subject} <span className="ml-2 text-slate-500">· {t.status}</span></p>
            <p className="text-slate-600">{t.message}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}

/** Team sub-panel (design 2026-11-26 §6). Two views, one route:
 *  - Parent (no team context): invite by email, members table with
 *    Remove, pending invites table with Cancel invite.
 *  - Member (has a team context): read-only banner + Leave team.
 *  No demo data: every row comes from the team_invites /
 *  affiliate_profiles reads in lib/data.ts, which fail closed (empty)
 *  until migration 030 is applied. */
export function AffiliateTeam() {
  const { user, refreshTeamContext } = useAuth()
  const navigate = useNavigate()
  const isMember = !!user?.teamContext
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteNote, setInviteNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const load = () => {
    Promise.all([getMyTeamMembers().then(setMembers), getMyTeamInvites().then(setInvites)])
      .then(() => setLoaded(true))
  }
  useEffect(load, [])
  const pending = invites.filter((i) => i.status === 'pending')
  // The copyable link for the last invite sent — the one just sent
  // this visit, else the newest invite still waiting for a reply.
  const lastInviteUrl = inviteUrl || pending[0]?.inviteUrl || ''

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy(true)
    setError('')
    setInviteNote('')
    const r = await inviteTeamMember(address)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    if (r.inviteUrl) setInviteUrl(r.inviteUrl)
    if (r.emailSent === false) setInviteNote(r.emailNote ?? 'Email not sent — share the invite link directly.')
    setEmail('')
    setCopied(false)
    load()
  }

  const remove = async (m: TeamMember) => {
    const r = await removeTeamMember(m.id)
    if (r.error) { setError(r.error); return }
    load()
  }

  const cancel = async (inv: TeamInvite) => {
    const r = await cancelTeamInvite(inv.id)
    if (r.error) { setError(r.error); return }
    load()
  }

  const leave = async () => {
    setLeaving(true)
    setError('')
    const r = await leaveTeam()
    setLeaving(false)
    if (r.error) { setError(r.error); return }
    await refreshTeamContext()
    navigate('/pending')
  }

  if (isMember && user?.teamContext) {
    return (
      <Card title="Your team">
        <p className="text-sm text-slate-600">You're on {user.teamContext.parentEmail}'s team. Your links earn for the team — payouts go to your team head.</p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You'll lose access to the team's dashboard until an admin approves your own account.</p>
        <button className={`${btnCls} mt-4`} onClick={leave} disabled={leaving}>{leaving ? 'Leaving…' : 'Leave team'}</button>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card title="Your team">
        <p className="text-sm text-slate-600">People on your team use your tracking links. Every click and every payout stays with you — your team members cannot see or change your payout wallet.</p>
        <form onSubmit={sendInvite} className="mt-4 flex gap-2">
          <input className={`${inputCls} flex-1`} type="email" required placeholder="Email address" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className={btnCls} disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {lastInviteUrl && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-medium">Invite link (share it anywhere):</p>
            <p className="break-all text-sm font-mono">{lastInviteUrl}</p>
            <button className={`${btnCls} mt-3`} onClick={() => { navigator.clipboard?.writeText(lastInviteUrl).catch(() => undefined); setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button>
            {inviteNote && <p className="mt-2 text-xs text-slate-500">{inviteNote}</p>}
          </div>
        )}
      </Card>
      <Card title={`Team members (${loaded ? members.length : '…'})`}>
        {!loaded ? <p className="text-sm text-slate-500">Loading team…</p> : members.length === 0 ? <Empty text="No team members yet. Invite someone above — they join with one click." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Email</th><th>Date added</th><th /></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{m.email}{m.fullName ? <span className="ml-2 text-slate-500">· {m.fullName}</span> : ''}</td>
                <td>{m.dateAdded || '—'}</td>
                <td className="text-right"><button className="font-semibold text-red-700" onClick={() => remove(m)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Card title={`Waiting for a reply (${loaded ? pending.length : '…'})`}>
        {!loaded ? <p className="text-sm text-slate-500">Loading team…</p> : pending.length === 0 ? <Empty text="No invites waiting for a reply." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2">Email</th><th>Sent</th><th /></tr></thead>
            <tbody>{pending.map((inv) => (
              <tr key={inv.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{inv.email}</td>
                <td>{inv.createdAt.slice(0, 10)}</td>
                <td className="text-right"><button className="font-semibold text-red-700" onClick={() => cancel(inv)}>Cancel invite</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}
