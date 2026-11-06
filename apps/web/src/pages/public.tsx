import { Link } from 'react-router-dom'
import { PublicLayout } from '../components/layout'

function Hero() {
  return (
    <section className="py-14 text-center">
      <h1 className="text-4xl font-bold text-white md:text-5xl">Affiliate marketing, tracked properly.</h1>
      <p className="mx-auto mt-4 max-w-2xl text-slate-300">
        AffiLayer connects advertisers with affiliates through transparent click tracking,
        clear reporting, and a commission ledger both sides can audit.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/register" className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Create an account</Link>
        <Link to="/how-it-works" className="rounded-lg border border-slate-600 px-5 py-3 text-white">How it works</Link>
      </div>
    </section>
  )
}

function FeatureGrid() {
  const items = [
    { t: 'Click tracking', d: 'Every click gets a unique click ID, with country, device and source recorded at the point of the redirect.' },
    { t: 'Conversion attribution', d: 'Conversions are linked to the original click and stored with an idempotency key, so the same event is never counted twice.' },
    { t: 'Commission ledger', d: 'Approved, pending and reversed commissions are recorded in an append-only ledger. Payouts are calculated from the ledger, not from a dashboard estimate.' },
    { t: 'Postbacks', d: 'Affiliates can register postback URLs with macros for click ID, payout, currency and status.' },
    { t: 'Fraud signals', d: 'Simple rule-based signals flag duplicate clicks and unusual bursts for review. Nothing is auto-rejected.' },
    { t: 'SmartLinks', d: 'One link can route to the best-matching eligible offer for a visitor\u2019s country and device, using a deterministic rule.' },
  ]
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((i) => (
        <div key={i.t} className="rounded-xl bg-white p-5 text-slate-900">
          <h3 className="font-semibold">{i.t}</h3>
          <p className="mt-2 text-sm text-slate-600">{i.d}</p>
        </div>
      ))}
    </div>
  )
}

export function Home() {
  return (
    <PublicLayout>
      <Hero />
      <FeatureGrid />
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6 text-slate-900">
          <h2 className="text-lg font-semibold">For advertisers</h2>
          <p className="mt-2 text-sm text-slate-600">Publish offers with a defined payout model, caps and traffic rules, and review the affiliates who apply to run them.</p>
          <Link to="/advertisers" className="mt-3 inline-block font-semibold text-blue-700">Advertiser overview →</Link>
        </div>
        <div className="rounded-xl bg-white p-6 text-slate-900">
          <h2 className="text-lg font-semibold">For affiliates</h2>
          <p className="mt-2 text-sm text-slate-600">Browse offers, generate tracking links with sub-parameters, and follow clicks, conversions and earnings in one place.</p>
          <Link to="/affiliates" className="mt-3 inline-block font-semibold text-blue-700">Affiliate overview →</Link>
        </div>
      </section>
    </PublicLayout>
  )
}

export function About() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">About AffiLayer</h1>
      <div className="mt-6 rounded-xl bg-white p-6 text-slate-700">
        <p>AffiLayer is a global CPA affiliate marketing network. Advertisers publish offers with a clear payout model and conversion definition; affiliates promote those offers and earn commission on attributed conversions.</p>
        <p className="mt-3">The network is built around three principles: tracking that can be audited, a ledger that cannot be silently rewritten, and approval flows that keep both sides in control. Affiliates apply to offers, advertisers approve them, and conversions move through pending, approved, rejected or reversed states with a record of each change.</p>
        <p className="mt-3">AffiLayer is operated as a marketplace platform. It does not run traffic itself and does not promise results to either side — performance depends on the offer, the audience and the traffic.</p>
      </div>
    </PublicLayout>
  )
}

export function AdvertisersPage() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">For advertisers</h1>
      <div className="mt-6 space-y-4">
        {[
          ['Publish offers', 'Define the vertical, countries, devices, allowed traffic sources, conversion type and payout model (CPA, CPL, CPS or CPC), plus daily and total caps.'],
          ['Approve affiliates', 'Review applications and traffic descriptions before an affiliate can generate tracking links for your offer.'],
          ['See attributed conversions', 'Each conversion is linked to the click that produced it, with payout, currency and status.'],
          ['Control spend', 'Caps limit volume per offer. The commission ledger records what is pending, approved and payable.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </div>
      <Link to="/register" className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Register as an advertiser</Link>
    </PublicLayout>
  )
}

export function AffiliatesPage() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">For affiliates</h1>
      <div className="mt-6 space-y-4">
        {[
          ['Browse offers', 'Filter offers by vertical, country, device and payout model. Apply to offers that require approval.'],
          ['Generate tracking links', 'Build links in the format /c/{affiliate_code}/{offer_id} with up to five sub-parameters for your own reporting.'],
          ['Follow your numbers', 'Reports break clicks and conversions down by date, offer, country, device and source.'],
          ['Get paid from the ledger', 'Earnings are calculated from approved conversions in the commission ledger. Request a payout when your balance is payable.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </div>
      <Link to="/register" className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Register as an affiliate</Link>
    </PublicLayout>
  )
}

export function HowItWorks() {
  const steps = [
    ['1. Create an account', 'Register as an advertiser or an affiliate and complete onboarding: profile, traffic source, vertical, GEO, volume and payment profile.'],
    ['2. Get approved', 'Applications are reviewed before an account can run offers. You can check your status on the pending page.'],
    ['3. Offers and links', 'Advertisers publish offers. Affiliates apply where required, then generate a tracking link for the offer.'],
    ['4. Clicks are tracked', 'A visitor clicking a tracking link is redirected to the offer landing page. The click is recorded with a unique click ID.'],
    ['5. Conversions are attributed', 'When a conversion happens, it is linked to the original click ID and recorded as pending.'],
    ['6. Review and payout', 'Conversions are approved, rejected or reversed. Approved commissions enter the ledger and become payable.'],
  ]
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">How it works</h1>
      <div className="mt-6 space-y-4">
        {steps.map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </div>
    </PublicLayout>
  )
}

export function Contact() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Contact</h1>
      <div className="mt-6 rounded-xl bg-white p-6 text-slate-700">
        <p>For support, use the ticket system inside your account once you are registered. For general enquiries about AffiLayer, email <span className="font-semibold text-slate-900">support@affilayer.example</span>.</p>
        <p className="mt-3 text-sm text-slate-500">Response times depend on the enquiry. Include your account email and, for tracking questions, the click ID from your link.</p>
      </div>
    </PublicLayout>
  )
}

export function Terms() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-sm text-slate-700">
        <p><strong>1. The service.</strong> AffiLayer provides tracking, reporting and payout administration for affiliate marketing offers. It does not guarantee traffic, conversions or earnings.</p>
        <p><strong>2. Accounts.</strong> You are responsible for keeping your credentials secure and for activity under your account. Accounts may be suspended for fraud, misleading traffic or breach of these terms.</p>
        <p><strong>3. Offers and approval.</strong> Advertisers define offer terms. Affiliates must follow the stated traffic rules, countries and devices. Offers requiring approval may not be promoted until approved.</p>
        <p><strong>4. Commissions.</strong> Commission is earned only on conversions that are approved and not reversed, as recorded in the commission ledger. Payouts are made according to the payout schedule in your account.</p>
        <p><strong>5. Prohibited traffic.</strong> Incentivised, misleading, bot or otherwise fraudulent traffic is prohibited. Fraud signals may lead to review, rejection of conversions, or account suspension.</p>
        <p><strong>6. Changes.</strong> These terms may be updated; the current version on this page applies.</p>
      </div>
    </PublicLayout>
  )
}

export function Privacy() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-sm text-slate-700">
        <p><strong>1. Data we collect.</strong> Account details you provide (email, name, payment profile), and tracking data needed to operate the network: click IDs, offer IDs, country, device, source and sub-parameters.</p>
        <p><strong>2. How we use it.</strong> To operate tracking and attribution, calculate commissions, process payouts, prevent fraud, and provide support.</p>
        <p><strong>3. Sharing.</strong> Aggregated or attributed performance data is shared with the advertiser or affiliate involved in a given click or conversion. We do not sell personal data.</p>
        <p><strong>4. Retention.</strong> Tracking and ledger records are kept for accounting and audit purposes. You may request deletion of your account data, subject to legal retention requirements.</p>
        <p><strong>5. Contact.</strong> For privacy questions, email support@affilayer.example.</p>
      </div>
    </PublicLayout>
  )
}
