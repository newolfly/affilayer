import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '../components/layout'

const VERTICALS = ['Dating', 'Finance', 'Gaming', 'Sweepstakes', 'Nutra', 'iGaming']

export const SUPPORT_EMAIL = 'support@affilayer.com'

function RotatingVertical() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % VERTICALS.length), 3500)
    return () => clearInterval(t)
  }, [])
  return (
    <span key={VERTICALS[i]} className="rotator-word grad-text">
      {VERTICALS[i]}
    </span>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden py-16 text-center md:py-20">
      <div className="hero-lines pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">A new CPA network — now open</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight text-white md:text-6xl">
          Turn <RotatingVertical /> traffic into commission.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-slate-300">
          AffiLayer connects advertisers who need customers with affiliates who can
          reach them. Pick a direct offer, or send everything through one SmartLink —
          every click tracked, every conversion attributed, every commission written
          to a ledger you can audit.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="pill-btn">Join as an affiliate</Link>
          <Link to="/register" className="pill-btn-outline">Join as an advertiser</Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Free to join. Applications are reviewed by our team, typically within 2 business days.
        </p>
      </div>
    </section>
  )
}

function ProductCards() {
  return (
    <section className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-400">CPA offers</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Direct offers, clear payouts</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Browse offers by vertical, country, device and payout model — CPA, CPL,
          CPS or CPC. Each offer states its caps, traffic rules and conversion
          definition up front, so you know exactly what you are promoting and what
          it pays. Apply where approval is required, then generate your tracking link.
        </p>
        <Link to="/affiliates" className="pill-btn mt-5">Browse offers →</Link>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-400">SmartLink</p>
        <h2 className="mt-2 text-2xl font-bold text-white">One link, every eligible offer</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Send mixed or unsegmented traffic to a single link. SmartLink routes each
          visitor to an eligible offer for their country and device, using clear,
          deterministic rules — no black box, no promised earnings. You see which
          offer each click landed on.
        </p>
        <Link to="/how-it-works" className="pill-btn mt-5">How SmartLink works →</Link>
      </div>
    </section>
  )
}

export const BENEFITS = [
  {
    t: 'Direct offers',
    d: 'Offers come with the payout model, caps and traffic rules stated up front. No hidden terms discovered after the click.',
  },
  {
    t: 'SmartLink routing',
    d: 'One link routes each visitor to an eligible offer for their country and device, using rules you can read — not a black box.',
  },
  {
    t: 'Full-funnel tracking',
    d: 'Every click gets a unique click ID with country, device, referrer and your sub-parameters, and stays linked to its conversion.',
  },
  {
    t: 'Reviewed payouts',
    d: 'Conversions move through pending, approved, rejected or reversed with a record of each change. Payouts are manual and admin-approved — never automatic, never guessed.',
  },
  {
    t: 'Wide GEO range',
    d: 'Offers across many countries, with per-offer GEO targeting so you only promote where the advertiser actually wants traffic.',
  },
  {
    t: 'Dedicated support',
    d: 'A real person answers tickets and reviews applications. New affiliates get help choosing their first offers.',
  },
  {
    t: 'Transparent reporting',
    d: 'Clicks, conversions, EPC and CR broken down by date, offer, country, device and source — the same numbers both sides see.',
  },
]

export function BenefitsSection() {
  return (
    <section className="mt-14">
      <h2 className="text-center text-3xl font-bold text-white">
        Why run traffic on <span className="grad-text">AffiLayer</span>
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
        We are a new network, so we keep our promises small and our records open.
        Here is what we actually do for affiliates and advertisers.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <div key={b.t} className="rounded-xl bg-white p-5 text-slate-900">
            <h3 className="font-semibold">{b.t}</h3>
            <p className="mt-2 text-sm text-slate-600">{b.d}</p>
          </div>
        ))}
        <div className="flex flex-col justify-between rounded-xl border border-orange-500/40 bg-orange-500/10 p-5">
          <div>
            <h3 className="font-semibold text-white">Ready to start?</h3>
            <p className="mt-2 text-sm text-slate-300">Create an account, complete onboarding, and apply to your first offer.</p>
          </div>
          <Link to="/register" className="pill-btn mt-4 self-start">Create an account</Link>
        </div>
      </div>
    </section>
  )
}

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    try {
      const prev = JSON.parse(localStorage.getItem('affilayer-contact') ?? '[]') as unknown[]
      localStorage.setItem('affilayer-contact', JSON.stringify([...prev, { ...form, at: new Date().toISOString() }]))
    } catch {
      /* localStorage unavailable — the confirmation below still applies */
    }
    setSent(true)
  }

  return (
    <section className="mt-14">
      <h2 className="text-center text-3xl font-bold text-white">
        Talk to <span className="grad-text">us</span>
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-slate-300">
        Questions about an offer, a payout, or running traffic here? Send a message
        and our team will reply to the email you give.
      </p>
      {sent ? (
        <div className="mx-auto mt-8 max-w-lg rounded-xl border border-green-500/40 bg-green-500/10 p-6 text-center">
          <p className="font-semibold text-white">Message received — thank you.</p>
          <p className="mt-2 text-sm text-slate-300">
            We will reply to {form.email}. (Demo note: while Supabase is not
            configured, messages are stored in your browser only.)
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto mt-8 max-w-lg space-y-3">
          <input className="dark-field" placeholder="Name" required value={form.name} onChange={set('name')} />
          <input className="dark-field" type="email" placeholder="Email" required value={form.email} onChange={set('email')} />
          <input className="dark-field" placeholder="Subject" required value={form.subject} onChange={set('subject')} />
          <textarea className="dark-field" placeholder="Message" rows={5} required value={form.message} onChange={set('message')} />
          <button className="pill-btn w-full">Send message</button>
        </form>
      )}
    </section>
  )
}

export function Home() {
  return (
    <PublicLayout>
      <Hero />
      <ProductCards />
      <BenefitsSection />
      <ContactForm />
    </PublicLayout>
  )
}

export function Advantages() {
  return (
    <PublicLayout>
      <h1 className="text-center text-3xl font-bold text-white md:text-4xl">
        What AffiLayer does <span className="grad-text">differently</span>
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-center text-slate-300">
        Most networks ask you to trust their numbers. We built AffiLayer so you can
        check them: auditable tracking, an append-only commission ledger, and
        approval flows on both sides.
      </p>
      <BenefitsSection />
      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-xl font-bold text-white">For affiliates</h2>
          <p className="mt-2 text-sm text-slate-300">
            Direct offers and one SmartLink for everything else. Track every click,
            see every conversion, and get paid from a ledger — not a dashboard estimate.
          </p>
          <Link to="/register" className="pill-btn mt-4">Join as an affiliate</Link>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-xl font-bold text-white">For advertisers</h2>
          <p className="mt-2 text-sm text-slate-300">
            Publish offers with your own caps and traffic rules, approve the
            affiliates who run them, and review attributed conversions before they
            become payable.
          </p>
          <Link to="/register" className="pill-btn mt-4">Join as an advertiser</Link>
        </div>
      </section>
    </PublicLayout>
  )
}

export function About() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        About <span className="grad-text">AffiLayer</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        AffiLayer is a new global CPA affiliate network. We are deliberately small
        right now: a focused offer catalogue, a tracking engine we can explain, and
        a team that reviews applications and conversions by hand.
      </p>
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
        <p>
          AffiLayer is operated by <strong>MarketSync Global LLC</strong>, a registered
          company in New Mexico, USA. Advertisers publish offers with a clear payout
          model and conversion definition; affiliates promote those offers and earn
          commission on attributed conversions.
        </p>
        <p>
          The network is built around three principles: tracking that can be audited,
          a ledger that cannot be silently rewritten, and approval flows that keep
          both sides in control. Affiliates apply to offers, advertisers approve
          them, and conversions move through pending, approved, rejected or reversed
          states with a record of each change.
        </p>
        <p>
          We do not run traffic ourselves, we do not buy traffic on your behalf, and
          we do not promise results to either side — performance depends on the offer,
          the audience and the traffic. What we promise is that the numbers you see
          are the numbers in the ledger, and that payouts are reviewed by a person
          before money moves.
        </p>
        <p>
          As a new network we are growing our offer catalogue and our advertiser base
          offer by offer. If you want to work with us early, that is exactly the
          right time to join.
        </p>
      </div>
    </PublicLayout>
  )
}

export function AdvertisersPage() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        For <span className="grad-text">advertisers</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        You need customers, not clicks you cannot explain. Publish an offer, set
        the rules, approve who runs it, and pay only for conversions you have
        reviewed.
      </p>
      <div className="mt-6 space-y-4">
        {[
          ['Publish offers', 'Define the vertical, countries, devices, allowed traffic sources, conversion type and payout model (CPA, CPL, CPS or CPC), plus daily and total caps.'],
          ['Approve affiliates', 'Review applications and traffic descriptions before an affiliate can generate tracking links for your offer.'],
          ['See attributed conversions', 'Each conversion is linked to the click that produced it, with payout, currency and status.'],
          ['Control spend', 'Caps limit volume per offer. The commission ledger records what is pending, approved and payable — and nothing becomes payable without review.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </div>
      <Link to="/register" className="pill-btn mt-6">Register as an advertiser</Link>
    </PublicLayout>
  )
}

export function AffiliatesPage() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        For <span className="grad-text">affiliates</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Two ways to earn on AffiLayer: run direct CPA offers you choose, or send
        traffic through one SmartLink and let deterministic routing match each
        visitor to an eligible offer.
      </p>
      <div className="mt-6 space-y-4">
        {[
          ['Browse offers', 'Filter offers by vertical, country, device and payout model. Apply to offers that require approval.'],
          ['Generate tracking links', 'Build links in the format /c/{affiliate_code}/{offer_id} with up to five sub-parameters for your own reporting.'],
          ['Or use one SmartLink', 'A single link routes each visitor to an eligible offer for their country and device. You see which offer each click landed on.'],
          ['Follow your numbers', 'Reports break clicks and conversions down by date, offer, country, device and source.'],
          ['Get paid from the ledger', 'Earnings are calculated from approved conversions in the commission ledger. Request a payout when your balance is payable. Payouts are manual and admin-approved, Net30 by default.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </div>
      <Link to="/register" className="pill-btn mt-6">Register as an affiliate</Link>
    </PublicLayout>
  )
}

export function HowItWorks() {
  const steps = [
    ['1. Create an account', 'Register as an advertiser or an affiliate and complete onboarding: profile, traffic source, vertical, GEO, volume and payment profile.'],
    ['2. Get approved', 'Our team reviews every application, typically within 2 business days. You can check your status on the approval page.'],
    ['3. Offers and links', 'Advertisers publish offers. Affiliates apply where required, then generate a tracking link — or use a SmartLink for mixed traffic.'],
    ['4. Clicks are tracked', 'A visitor clicking a tracking link is redirected to the offer landing page. The click is recorded with a unique click ID.'],
    ['5. Conversions are attributed', 'When a conversion happens, it is linked to the original click ID and recorded as pending.'],
    ['6. Review and payout', 'Conversions are approved, rejected or reversed by review. Approved commissions enter the ledger and become payable; payouts are manual and admin-approved, Net30 by default.'],
  ]
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        How it <span className="grad-text">works</span>
      </h1>
      <div className="mt-6 space-y-4">
        {steps.map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </div>
      <Link to="/register" className="pill-btn mt-6">Create an account</Link>
    </PublicLayout>
  )
}

const FAQ_GROUPS: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: 'General',
    items: [
      {
        q: 'What is AffiLayer?',
        a: 'AffiLayer is a CPA affiliate network. Advertisers publish offers with a defined payout and conversion action; affiliates promote those offers and earn commission on attributed conversions. We also provide SmartLink, a single link that routes each visitor to an eligible offer for their country and device.',
      },
      {
        q: 'Which verticals do you work with?',
        a: 'Our catalogue covers Dating, Finance, Gaming, Sweepstakes, Nutra and iGaming. The exact offers available depend on the advertisers currently on the network — the marketplace in your dashboard always shows the live list.',
      },
      {
        q: 'What is SmartLink?',
        a: 'SmartLink is one tracking link for all of your traffic. Each visitor is routed to an eligible offer based on their country and device, using clear deterministic rules. It does not use AI optimisation and it does not guarantee earnings — it simply matches traffic to offers it is allowed to run.',
      },
      {
        q: 'How do I get access to offers?',
        a: 'Create an account, complete onboarding, and wait for approval. Once approved, you can browse the marketplace. Some offers are open; others require you to apply, and the advertiser approves you before you can generate a tracking link.',
      },
    ],
  },
  {
    group: 'About your account',
    items: [
      {
        q: 'How do I register?',
        a: 'Use the registration form and choose whether you are joining as an affiliate or an advertiser, then complete onboarding with your profile, traffic source, vertical, GEO and payment details.',
      },
      {
        q: 'How long does approval take?',
        a: 'Applications are reviewed by our team, typically within 2 business days. You can check your status on the approval page at any time.',
      },
      {
        q: 'Why was my application declined?',
        a: 'Common reasons are an incomplete profile, a traffic source we cannot verify, or a mismatch with the verticals and GEOs we currently serve. The decision message on your approval page says what to fix, and you can re-apply after updating your profile.',
      },
      {
        q: 'When do my statistics and payments appear?',
        a: 'Clicks appear in your reports as they are recorded. Conversions appear as pending once attributed, and move to approved, rejected or reversed after review. Earnings become payable only from approved conversions in the commission ledger.',
      },
      {
        q: 'How does SmartLink pay out?',
        a: 'SmartLink pays exactly like the offer the visitor was routed to — same payout model, same amount, same review process. There is no separate SmartLink rate.',
      },
      {
        q: 'Are there bonuses or a referral program?',
        a: 'Not yet. We do not run a bonus or referral program at launch. If one is introduced, the terms will be published here first.',
      },
    ],
  },
  {
    group: 'Finance',
    items: [
      {
        q: 'How and when do I get paid?',
        a: 'Payouts are manual and admin-approved. The default schedule is Net30: approved commissions become payable 30 days after the end of the month in which they were approved. You request a payout from your dashboard when your balance is payable, and our team processes it after review.',
      },
      {
        q: 'Which payout methods are available?',
        a: 'The payout methods available to your account are shown in your dashboard payment profile. We do not publish a fixed list here because methods depend on your country and account setup.',
      },
      {
        q: 'Is there a minimum payout?',
        a: 'Minimum payout thresholds are set in your account settings and shown on the payouts page before you request a payout. Balances below the threshold stay in your account until they reach it.',
      },
    ],
  },
  {
    group: 'Traffic rules',
    items: [
      {
        q: 'What traffic is not allowed?',
        a: 'Fraudulent traffic of any kind is prohibited: bots, misleading creatives, forced clicks, and incentivised traffic that misrepresents the offer. Each offer also lists its own allowed traffic sources, countries and devices — those rules apply on top of the network rules.',
      },
      {
        q: 'Can I use chat or incentivised traffic?',
        a: 'No. Chat traffic and incentivised traffic are not accepted on AffiLayer, and conversions from them will be rejected on review.',
      },
      {
        q: 'Are some traffic types restricted per advertiser?',
        a: 'Yes. Advertisers can restrict traffic sources, GEOs and devices per offer. Check the offer details before you promote it — running a restricted source is grounds for conversion rejection.',
      },
    ],
  },
]

export function Faq() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        Frequently asked <span className="grad-text">questions</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Straight answers about joining, running traffic, and getting paid. If your
        question is not here, use the contact form on the home page.
      </p>
      {FAQ_GROUPS.map((g) => (
        <section key={g.group} className="mt-10">
          <h2 className="text-xl font-bold text-white">{g.group}</h2>
          <div className="mt-4 space-y-3">
            {g.items.map((item) => (
              <details key={item.q} className="rounded-xl bg-white p-5 text-slate-900">
                <summary className="cursor-pointer font-semibold">{item.q}</summary>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </PublicLayout>
  )
}

export function Contact() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        Contact <span className="grad-text">us</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        For support, use the ticket system inside your account once you are
        registered. For general enquiries, email{' '}
        <span className="font-semibold text-white">{SUPPORT_EMAIL}</span> or use
        the form below.
      </p>
      <ContactForm />
      <p className="mt-8 text-center text-sm text-slate-500">
        Include your account email and, for tracking questions, the click ID from your link.
      </p>
    </PublicLayout>
  )
}

export function Terms() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-400">
        Operated by MarketSync Global LLC, New Mexico, USA. Last updated: November 2026.
      </p>
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-sm text-slate-700">
        <p><strong>1. The service.</strong> AffiLayer provides tracking, reporting and payout administration for affiliate marketing offers. It does not guarantee traffic, conversions or earnings.</p>
        <p><strong>2. Accounts.</strong> You are responsible for keeping your credentials secure and for activity under your account. Accounts may be suspended for fraud, misleading traffic or breach of these terms.</p>
        <p><strong>3. Offers and approval.</strong> Advertisers define offer terms. Affiliates must follow the stated traffic rules, countries and devices. Offers requiring approval may not be promoted until approved.</p>
        <p><strong>4. Commissions.</strong> Commission is earned only on conversions that are approved and not reversed, as recorded in the commission ledger. Payouts are manual and admin-approved, on a Net30 schedule by default: approved commissions become payable 30 days after the end of the month in which they were approved. Payout methods and minimum thresholds are shown in your dashboard.</p>
        <p><strong>5. Prohibited traffic.</strong> Incentivised, misleading, bot, chat or otherwise fraudulent traffic is prohibited. Fraud signals may lead to review, rejection of conversions, or account suspension.</p>
        <p><strong>6. Changes.</strong> These terms may be updated; the current version on this page applies.</p>
      </div>
    </PublicLayout>
  )
}

export function Privacy() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-400">
        Operated by MarketSync Global LLC, New Mexico, USA. Last updated: November 2026.
      </p>
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-sm text-slate-700">
        <p><strong>1. Data we collect.</strong> Account details you provide (email, name, payment profile), and tracking data needed to operate the network: click IDs, offer IDs, country, device, source and sub-parameters.</p>
        <p><strong>2. How we use it.</strong> To operate tracking and attribution, calculate commissions, process payouts, prevent fraud, and provide support.</p>
        <p><strong>3. Sharing.</strong> Aggregated or attributed performance data is shared with the advertiser or affiliate involved in a given click or conversion. We do not sell personal data.</p>
        <p><strong>4. Retention.</strong> Tracking and ledger records are kept for accounting and audit purposes. You may request deletion of your account data, subject to legal retention requirements.</p>
        <p><strong>5. Contact.</strong> For privacy questions, email {SUPPORT_EMAIL}.</p>
      </div>
    </PublicLayout>
  )
}
