import { Link } from 'react-router-dom'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { PageHighlights } from '../components/illustrations'
import { Icon } from '../components/icons'
import type { IconName } from '../components/icons'
import { NetworkActivityStrip } from '../components/network-stats'

/**
 * /trust — the audit showcase. Every number on this page comes from a
 * published forensic audit report or from the production ledger, and
 * the page names the open items as plainly as the passed ones. That is
 * the brand: radical transparency is the moat, so this page never
 * rounds a claim up. English at launch (same as /advantages and
 * /partner); ES/PT localization is a follow-up.
 */

const AUDIT_TRAIL: { date: string; round: string; verdict: string; counts: string; headline: string }[] = [
  {
    date: '9 November 2026',
    round: 'Forensic audit v1',
    verdict: 'NO-GO',
    counts: '8 High · 18 Medium · 23 Low',
    headline:
      'The baseline audit. A tenant-isolation hole and a pending-affiliates-can-earn hole were found in our own code — both fixed and re-proven live within the week.',
  },
  {
    date: '10 November 2026',
    round: 'Forensic audit v2 (two passes, one day)',
    verdict: 'NO-GO',
    counts: '1 Critical in the morning pass · 0 Critical by the evening pass',
    headline:
      'The morning pass caught a payment-settlement defect that would have blocked deposit credits. It was fixed and re-proven the same day — before any real deposit had ever been taken.',
  },
  {
    date: '11 November 2026',
    round: 'Forensic audit v3',
    verdict: 'NO-GO on a single item',
    counts: '0 Critical · 1 High · 80+ checks passed',
    headline:
      'Every code-level blocker was closed. The one remaining item was not a bug: the money loop had not yet moved real money, and an audit cannot mark assumed as proven.',
  },
  {
    date: '13 November 2026',
    round: 'Forensic audit v4',
    verdict: 'GO — production grade (platform)',
    counts: '0 Critical · 0 High · 90+ checks passed',
    headline:
      'Full re-audit of the frontend, the tracking Worker, the database and the payments plumbing, with every fixable finding fixed in the same pass. The money-loop proof stays named as open below — we do not grade our own homework on that one.',
  },
]

const SECURITY_FACTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'lock',
    title: 'Row-level security on every table',
    text: 'All 25 database tables run with row-level security enabled (58 policies). Affiliates see their own rows; advertisers see their own offers and conversions; nobody sees across tenants.',
  },
  {
    icon: 'shield',
    title: 'Anonymous probes fail closed',
    text: 'Every audit replays anonymous API calls against the money-moving functions. All of them are rejected — the write paths require a signed worker proof, not just the public API key.',
  },
  {
    icon: 'check',
    title: 'Only approved affiliates can earn',
    text: 'The approval gate lives in the database functions that record clicks and conversions, not in the web app. A pending or suspended account cannot record a payable conversion.',
  },
  {
    icon: 'tag',
    title: 'Caps enforced in the database',
    text: 'Daily and monthly offer caps are checked inside the recording functions themselves. When a capped offer fills, SmartLink falls through to the next eligible offer instead of erroring.',
  },
  {
    icon: 'file',
    title: 'A ledger that cannot be rewritten',
    text: 'A database trigger blocks UPDATE and DELETE on commission ledger rows. Corrections are new reversing rows, so the history an auditor sees is the history that happened.',
  },
  {
    icon: 'eye',
    title: 'Payments verified, never trusted',
    text: 'Payment notifications are never taken at face value: the Worker re-fetches every payment\u2019s status from the provider\u2019s API before a balance moves, and payouts run against a currency allowlist.',
  },
]

export function Trust() {
  return (
    <PublicLayout>
      <h1 className="text-center text-3xl font-bold text-white md:text-4xl">
        The CPA network you can <span className="grad-text">audit</span>
      </h1>
      <Slogan className="mx-auto mt-4 max-w-2xl text-center">
        Most networks ask you to trust their numbers. AffiLayer publishes the audits, the
        ledger rules and the reconciliation — including the parts that are not finished yet.
      </Slogan>
      <p className="mx-auto mt-4 max-w-3xl text-center text-slate-300">
        AffiLayer is a global CPA affiliate network operated by{' '}
        <strong className="text-slate-100">MarketSync Global LLC</strong>, a registered company in
        New Mexico, USA. It has been under independent-style forensic audit since before launch:
        four full audits in its first week, every report kept, every critical finding fixed and
        re-proven live. This page is the summary we hold ourselves to.
      </p>

      <NetworkActivityStrip />

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white md:text-3xl">
          Latest audit — <span className="grad-text">v4, 13 November 2026</span>
        </h2>
        <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
          <p>
            <strong>Result: 0 Critical · 0 High · 6 Medium · 11 Low · 90+ checks passed.</strong>{' '}
            Verdict: production grade for the platform. The audit covered the public site, the
            tracking Worker, the Supabase database, the payments plumbing and the live offer
            catalogue, and reconciled the commission ledger against payout records to the cent.
          </p>
          <p>
            Two of the v4 fixes are worth naming because they are the kind of thing audits are
            for. Outbound affiliate postbacks turned out to be stored where they could never
            fire from — they are now recorded through proof-gated database functions. And one
            offer\u2019s payout had drifted from its feed rate (the network was effectively
            keeping about 47% instead of the intended 25%); the rate was corrected to $0.59
            and feed-vs-catalogue drift is now a checked item in every audit.
          </p>
          <p>
            The full trail is below. We publish the NO-GO rounds as well as the GO — a network
            that only shows you its best report is asking for the same blind trust as one that
            shows you none.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white md:text-3xl">The audit trail</h2>
        <div className="mt-6 space-y-4">
          {AUDIT_TRAIL.map((a, i) => (
            <Reveal key={a.round} delay={(i % 2) * 80}>
              <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-white">{a.round}</h3>
                  <span className="text-sm font-semibold text-amber-400">{a.date}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-200">
                  Verdict: {a.verdict} <span className="font-normal text-slate-400">· {a.counts}</span>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{a.headline}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white md:text-3xl">How the commission ledger works</h2>
        <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
          <p>
            Every conversion that counts writes a row to an{' '}
            <strong>append-only commission ledger</strong>. Rows are never edited and never
            deleted — a database trigger rejects both. If a conversion is later rejected or a
            payment is reversed, the correction is a new row that reverses the old one, so the
            full history stays visible to anyone reconciling the books.
          </p>
          <p>
            Conversions move through named states — <strong>pending → approved → payable →
            paid</strong>, with rejected and reversed as first-class states, not quiet edits. A
            payout request must match approved ledger rows exactly, row by row; the reservation
            system locks those rows while a payout is in flight so the same commission can
            never be paid twice.
          </p>
          <p>
            Affiliates are paid on the published terms — Net-30, in USDT — and advertisers pay
            only for conversions they have reviewed. The split on feed offers is published per
            offer, in the catalogue, before you run traffic to it.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white md:text-3xl">
          The $12.02 we publish instead of hiding
        </h2>
        <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
          <p>
            Every audit reconciles the ledger against payout transactions. The current books
            show <strong>$24.09</strong> marked paid in the ledger against{' '}
            <strong>$12.07</strong> in payout transactions — a gap of exactly{' '}
            <strong>$12.02</strong>, unchanged across the last three audits.
          </p>
          <p>
            The cause is known and documented: during launch testing on 8 November 2026, three
            completed test payouts had their payout-request and transaction rows deleted in a
            cleanup, while their ledger rows — immutable by design — stayed marked paid. No
            affiliate lost money; the gap is test data, and it cannot grow: the reservation
            system and a standing process rule (completed payout records are never deleted)
            closed the path that created it.
          </p>
          <p>
            We keep the figure on this page because a network that publishes its unexplained
            $12.02 is a network whose explained numbers you can check too.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white md:text-3xl">Security, in checkable facts</h2>
        <PageHighlights
          items={[
            { icon: 'search', text: 'Four forensic audits in the first week of operation — reports kept, findings fixed, fixes re-proven live.' },
            { icon: 'file', text: 'Append-only ledger: the database itself refuses edits and deletions to commission rows.' },
            { icon: 'shield', text: 'Approval on both sides — affiliates are approved before they can earn; advertisers approve conversions before they pay.' },
          ]}
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SECURITY_FACTS.map((f, i) => (
            <Reveal key={f.title} delay={(i % 2) * 80}>
              <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-lg font-bold text-white">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white md:text-3xl">What is still open — stated plainly</h2>
        <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
          <p>
            <strong>The money loop has not yet moved real money.</strong> The deposit and
            payout paths are built, reviewed and hardened, and every component around them has
            been proven with labelled test data — but no real advertiser deposit has been paid
            in and no real affiliate payout has been executed yet. The first payout cycle is in
            progress, and when the first real payout settles we will say so here, with the
            proof. Until then, any network — including us — asking you to treat its payouts as
            proven before its first cycle is asking for faith, not showing you evidence.
          </p>
          <p>
            <strong>Partner approvals are in flight.</strong> The live catalogue runs on a
            CPAlead feed whose publisher approval was under review at the time of the v4 audit;
            a second catalogue agreement (MyLead) is with the network\u2019s affiliate manager.
            Catalogue depth is the thing we are growing next, in the open.
          </p>
        </div>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <Reveal>
          <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
            <h2 className="text-xl font-bold text-white">The group behind AffiLayer</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              AffiLayer is operated by MarketSync Global LLC (New Mexico, USA), part of the
              MarketSync Global holding group founded in 2025. The group\u2019s other products
              include DropShop, a commerce platform serving 2,600+ sellers, and Fredeem, a
              gift-card marketplace that runs its partner programme through AffiLayer.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Those seller and product numbers belong to the sister products, not to
              AffiLayer — we label them because a network that audits itself should attribute
              its own family\u2019s numbers too.
            </p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
            <h2 className="text-xl font-bold text-white">Terms that say what they mean</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Our Terms of Service are published in full, including section 13,{' '}
              <em>\u201CChanges we may make\u201D</em> — the clause that lets us update offers,
              payouts and the terms themselves, effective when posted. Commissions already
              approved stay governed by the payout and ledger sections (4 and 8). No silent
              rewrites, in the terms or in the ledger.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/terms" className="pill-btn">Read the terms</Link>
              <Link to="/blog/affilayer-fully-operational" className="pill-btn-outline">
                The launch announcement
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mt-14 text-center">
        <h2 className="text-2xl font-bold text-white md:text-3xl">
          Run traffic on records you can <span className="grad-text">check</span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Joining is free for affiliates and advertisers. Applications are reviewed by a
          person, offers state their payout and caps up front, and every conversion you earn
          lands in the ledger this page describes.
        </p>
        <Link to="/register" className="pill-btn mt-6">Create your free account</Link>
      </section>
    </PublicLayout>
  )
}
