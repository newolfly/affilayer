import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { PageArt, PageHighlights } from '../components/illustrations'
import { Icon } from '../components/icons'
import type { IconName } from '../components/icons'
import { FAQ_GROUPS } from '../lib/faq-data'
import { useLocale, useT, localizePath } from '../lib/i18n'
import { isDemoMode } from '../lib/data'
import { COUNTRIES } from '../lib/geo-data'

const VERTICALS = ['Dating', 'Finance', 'Gaming', 'Sweepstakes', 'Nutra', 'iGaming']

/** Hero illustration: the layered AffiLayer "A" as a hub, with offer nodes
 *  (CPA / CPL / CPS / SmartLink) connected by a flowing tracking path.
 *  Original SVG drawn for this page — node labels are payout models only,
 *  never amounts. Parallax layers drift with the pointer (fine pointers
 *  only; disabled under prefers-reduced-motion and on touch). */
function HeroIllustration() {
  const ref = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setOffset({
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    })
  }
  const layer = (depth: number): React.CSSProperties => ({
    transform: `translate3d(${(offset.x * depth).toFixed(1)}px, ${(offset.y * depth).toFixed(1)}px, 0)`,
  })
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
      className="relative mx-auto mt-10 max-w-3xl"
      role="img"
      aria-label="Illustration: the AffiLayer network hub connecting CPA, CPL, CPS and SmartLink offers through one tracked path"
    >
      <svg viewBox="0 0 640 250" className="w-full" fill="none">
        <defs>
          <linearGradient id="hero-grad" x1="0" y1="0" x2="640" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D97706" />
            <stop offset="1" stopColor="#FBBF24" />
          </linearGradient>
        </defs>
        <g className="hero-layer" style={layer(5)} opacity="0.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <circle key={i} cx={40 + i * 70} cy={i % 2 === 0 ? 28 : 222} r="2" fill="#475569" />
          ))}
        </g>
        <g className="hero-layer" style={layer(9)} stroke="#1E2A3F" strokeWidth="1.5">
          <line x1="118" y1="72" x2="272" y2="112" />
          <line x1="118" y1="182" x2="272" y2="140" />
          <line x1="522" y1="72" x2="368" y2="112" />
          <line x1="522" y1="182" x2="368" y2="140" />
        </g>
        <g className="hero-layer" style={layer(9)}>
          <path className="hero-path" d="M118 127 H 522" stroke="url(#hero-grad)" strokeWidth="2" />
        </g>
        <g className="hero-layer" style={layer(15)} fontFamily="inherit" fontSize="13" fontWeight="700" fill="#e2e8f0" textAnchor="middle">
          <g>
            <rect x="48" y="48" width="140" height="48" rx="12" fill="#111C30" stroke="#1E2A3F" />
            <text x="118" y="77">CPA offer</text>
          </g>
          <g>
            <rect x="48" y="158" width="140" height="48" rx="12" fill="#111C30" stroke="#1E2A3F" />
            <text x="118" y="187">CPL offer</text>
          </g>
          <g>
            <rect x="452" y="48" width="140" height="48" rx="12" fill="#111C30" stroke="#1E2A3F" />
            <text x="522" y="77">CPS offer</text>
          </g>
          <g>
            <rect x="452" y="158" width="140" height="48" rx="12" fill="#111C30" stroke="#1E2A3F" />
            <text x="522" y="187">SmartLink</text>
          </g>
        </g>
        <g className="hero-layer" style={layer(22)}>
          <circle cx="320" cy="126" r="52" fill="#111C30" stroke="url(#hero-grad)" strokeWidth="2.5" />
          <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" fill="none">
            <path d="M320 96 302 152" stroke="#D97706" />
            <path d="M320 96 338 152" stroke="#f59e0b" />
            <path d="M309 133h22" stroke="#FBBF24" />
          </g>
          <text x="320" y="200" textAnchor="middle" fontFamily="inherit" fontSize="12" fontWeight="600" fill="#94a3b8">one tracked path</text>
        </g>
      </svg>
    </div>
  )
}

export const SUPPORT_EMAIL = 'support@affilayer.com'

/** Rotating vertical word in the hero headline. Crossfades: the outgoing
 *  word fades out while the incoming word fades in over the same 0.45s,
 *  so a word is always painted — there is never a fully-empty instant.
 *  The {' '} between the two spans is deliberate: both words sit in the
 *  H1 during the crossfade (and in the prerendered HTML), so without a
 *  space crawlers read them as one joined word (e.g. "SweepstakesNutra"). */
function RotatingVertical() {
  const [[i, prev], setPair] = useState<[number, number | null]>([0, null])
  useEffect(() => {
    const t = setInterval(() => setPair(([cur]) => [(cur + 1) % VERTICALS.length, cur]), 3500)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="rotator-stack">
      {prev !== null && (
        <span key={`out-${VERTICALS[prev]}`} className="rotator-word rotator-out grad-text" aria-hidden="true">
          {VERTICALS[prev]}
        </span>
      )}
      {' '}
      <span key={`in-${VERTICALS[i]}`} className="rotator-word rotator-in grad-text">
        {VERTICALS[i]}
      </span>
    </span>
  )
}

function Hero() {
  const t = useT()
  return (
    <section className="relative overflow-hidden py-16 text-center md:py-20">
      <div className="hero-lines pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-glow" aria-hidden />
      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">{t('home.eyebrow')}</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight text-white md:text-6xl">
          {t('home.titleBefore')} <RotatingVertical /> {t('home.titleAfter')}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-slate-300">
          {t('home.sub')}
        </p>
        <Slogan className="mx-auto mt-5 max-w-2xl text-center">{t('home.slogan')}</Slogan>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="pill-btn">{t('home.ctaAffiliate')}</Link>
          <Link to="/register" className="pill-btn-outline">{t('home.ctaAdvertiser')}</Link>
        </div>
        <p className="mt-4 text-sm">
          <Link to="/login" className="font-semibold text-amber-400 hover:text-amber-300">{t('home.demoTry')} →</Link>
          {' '}<span className="text-[#8A97A8]">{t('home.demoNote')}</span>
        </p>
        <p className="mt-4 text-xs text-[#8A97A8]">
          {t('home.note')}
        </p>
        <Reveal delay={120}>
          <HeroIllustration />
        </Reveal>
      </div>
    </section>
  )
}

/** Country grid on the home page — the GEO-search entry point. */
function BrowseByCountry() {
  const t = useT()
  const locale = useLocale()
  return (
    <section className="mt-14">
      <h2 className="text-center text-3xl font-bold text-white">{t('browse.title')}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">{t('browse.sub')}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COUNTRIES.map((c, i) => (
          <Reveal key={c.code} delay={(i % 4) * 80}>
            <Link
              to={localizePath(`/geo/${c.code}`, locale)}
              className="lift flex items-center justify-between rounded-2xl border border-slate-800 bg-[#111C30]/60 px-5 py-4"
            >
              <span className="flex items-center gap-3 font-semibold text-white">
                <span className="text-amber-400"><Icon name="globe" className="h-5 w-5" /></span>
                {c.name[locale]}
              </span>
              <Icon name="arrow-right" className="h-4 w-4 text-amber-400" />
            </Link>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-center">
        <Link to={localizePath('/geo', locale)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300">
          {t('browse.all')} <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </p>
    </section>
  )
}

function ProductCards() {
  const t = useT()
  const locale = useLocale()
  return (
    <section className="mt-4 grid gap-4 md:grid-cols-2">
      <Reveal>
      <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">{t('home.cardOffers.kicker')}</p>
        <h2 className="mt-2 text-2xl font-bold text-white">{t('home.cardOffers.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {t('home.cardOffers.body')}
        </p>
        <Link to={localizePath('/affiliates', locale)} className="pill-btn mt-5">{t('home.cardOffers.cta')} <Icon name="arrow-right" className="inline h-4 w-4" /></Link>
      </div>
      </Reveal>
      <Reveal delay={100}>
      <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">{t('home.cardSmart.kicker')}</p>
        <h2 className="mt-2 text-2xl font-bold text-white">{t('home.cardSmart.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {t('home.cardSmart.body')}
        </p>
        <Link to={localizePath('/how-it-works', locale)} className="pill-btn mt-5">{t('home.cardSmart.cta')} <Icon name="arrow-right" className="inline h-4 w-4" /></Link>
      </div>
      </Reveal>
    </section>
  )
}

const BENEFIT_ICONS: IconName[] = ['tag', 'sparkle', 'link', 'shield', 'globe', 'ticket', 'chart']

export function BenefitsSection() {
  const t = useT()
  const benefits = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    t: t(`benefit.${n}.t` as `benefit.${1 | 2 | 3 | 4 | 5 | 6 | 7}.t`),
    d: t(`benefit.${n}.d` as `benefit.${1 | 2 | 3 | 4 | 5 | 6 | 7}.d`),
    icon: BENEFIT_ICONS[n - 1],
  }))
  return (
    <section className="mt-14">
      <h2 className="text-center text-3xl font-bold text-white">
        {t('home.why.titleA')} <span className="grad-text">AffiLayer</span>
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-300">
        {t('home.why.sub')}
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {benefits.map((b, i) => (
          <Reveal key={b.t} delay={(i % 3) * 80}>
          <div className="lift h-full rounded-xl bg-white p-5 text-slate-900">
            <span className="inline-flex rounded-lg bg-amber-500/10 p-2 text-amber-700">
              <Icon name={b.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-3 font-semibold">{b.t}</h3>
            <p className="mt-2 text-sm text-slate-600">{b.d}</p>
          </div>
          </Reveal>
        ))}
        <Reveal delay={160}>
        <div className="lift flex h-full flex-col justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div>
            <h3 className="font-semibold text-white">{t('home.ready.title')}</h3>
            <p className="mt-2 text-sm text-slate-300">{t('home.ready.body')}</p>
          </div>
          <Link to="/register" className="pill-btn mt-4 self-start">{t('home.ready.cta')}</Link>
        </div>
        </Reveal>
      </div>
    </section>
  )
}

export function ContactForm() {
  const t = useT()
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
    <Reveal className="mt-14">
      <h2 className="text-center text-3xl font-bold text-white">
        {t('contact.titleA')} <span className="grad-text">{t('contact.titleB')}</span>
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-slate-300">
        {t('contact.sub')}
      </p>
      {sent ? (
        <div className="mx-auto mt-8 max-w-lg rounded-xl border border-green-500/40 bg-green-500/10 p-6 text-center">
          <p className="font-semibold text-white">{t('contact.sent.title')}</p>
          <p className="mt-2 text-sm text-slate-300">
            {t('contact.sent.body', { email: form.email })}
          </p>
          {isDemoMode && (
            <p className="mt-2 text-sm text-amber-400">Demo mode — your message was saved in this browser only and was not sent. Email support@affilayer.com to reach us.</p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto mt-8 max-w-lg space-y-3">
          <div>
            <label htmlFor="contact-name" className="mb-1 block text-sm font-semibold text-white">{t('contact.ph.name')}</label>
            <input id="contact-name" className="dark-field" placeholder={t('contact.ph.name')} required value={form.name} onChange={set('name')} />
          </div>
          <div>
            <label htmlFor="contact-email" className="mb-1 block text-sm font-semibold text-white">{t('contact.ph.email')}</label>
            <input id="contact-email" className="dark-field" type="email" placeholder={t('contact.ph.email')} required value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label htmlFor="contact-subject" className="mb-1 block text-sm font-semibold text-white">{t('contact.ph.subject')}</label>
            <input id="contact-subject" className="dark-field" placeholder={t('contact.ph.subject')} required value={form.subject} onChange={set('subject')} />
          </div>
          <div>
            <label htmlFor="contact-message" className="mb-1 block text-sm font-semibold text-white">{t('contact.ph.message')}</label>
            <textarea id="contact-message" className="dark-field" placeholder={t('contact.ph.message')} rows={5} required value={form.message} onChange={set('message')} />
          </div>
          {isDemoMode && (
            <p className="text-sm text-amber-400">Demo mode — this form saves your message in this browser only. Nothing is sent to us; email support@affilayer.com to reach a real person.</p>
          )}
          <button className="pill-btn w-full">{t('contact.send')}</button>
        </form>
      )}
    </Reveal>
  )
}

export function Home() {
  return (
    <PublicLayout>
      <Hero />
      <ProductCards />
      <BenefitsSection />
      <BrowseByCountry />
      <ContactForm />
    </PublicLayout>
  )
}

export function Advantages() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-center text-3xl font-bold text-white md:text-4xl">
        What AffiLayer does <span className="grad-text">differently</span>
      </h1>
      <Slogan className="mx-auto mt-4 max-w-2xl text-center">{t('advantages.slogan')}</Slogan>
      <p className="mx-auto mt-4 max-w-2xl text-center text-slate-300">
        Most networks ask you to trust their numbers. We built AffiLayer so you can
        check them: auditable tracking, an append-only commission ledger, and
        approval flows on both sides.
      </p>
      <PageArt
        variant="advantages"
        label="Illustration: the AffiLayer hub connecting auditable tracking, the commission ledger and approval flows"
        nodes={['Auditable tracking', 'Ledger', 'Approval flows', 'Open records']}
        caption="what we do differently"
      />
      <PageHighlights
        items={[
          { icon: 'eye', text: 'Check our work — the numbers you see are the numbers in the ledger.' },
          { icon: 'users', text: 'Approval on both sides — affiliates apply, advertisers approve, nobody runs blind.' },
          { icon: 'shield', text: 'No promised results — we promise open records, not earnings.' },
        ]}
      />
      <BenefitsSection />
      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <Reveal>
        <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
          <h2 className="text-xl font-bold text-white">For affiliates</h2>
          <p className="mt-2 text-sm text-slate-300">
            Direct offers and one SmartLink for everything else. Track every click,
            see every conversion, and get paid from a ledger — not a dashboard estimate.
          </p>
          <Link to="/register" className="pill-btn mt-4">Join as an affiliate</Link>
        </div>
        </Reveal>
        <Reveal delay={100}>
        <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
          <h2 className="text-xl font-bold text-white">For advertisers</h2>
          <p className="mt-2 text-sm text-slate-300">
            Publish offers with your own caps and traffic rules, approve the
            affiliates who run them, and review attributed conversions before they
            become payable.
          </p>
          <Link to="/register" className="pill-btn mt-4">Join as an advertiser</Link>
        </div>
        </Reveal>
      </section>
    </PublicLayout>
  )
}

export function About() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        About <span className="grad-text">AffiLayer</span>
      </h1>
      <Slogan className="mt-4">{t('about.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        AffiLayer is a new global CPA affiliate network. We are deliberately small
        right now: a focused offer catalogue, a tracking engine we can explain, and
        a team that reviews applications and conversions by hand.
      </p>
      <PageArt
        variant="about"
        label="Illustration: the AffiLayer hub connecting open books, manual review and the auditable ledger"
        nodes={['Open books', 'Manual review', 'Auditable ledger', 'Small by choice']}
        caption="three principles"
      />
      <PageHighlights
        items={[
          { icon: 'building', text: 'Operated by MarketSync Global LLC, a registered company in New Mexico, USA.' },
          { icon: 'search', text: 'Tracking you can audit — every click has a unique click ID linked to its conversion.' },
          { icon: 'file', text: 'A ledger that cannot be silently rewritten — every change is recorded.' },
        ]}
      />
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
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        {t('adv.h1a')} <span className="grad-text">{t('adv.h1b')}</span>
      </h1>
      <Slogan className="mt-4">{t('adv.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        {t('adv.intro')}
      </p>
      <PageArt
        variant="advertisers"
        label="Illustration: the AffiLayer hub connecting publishing offers, approving affiliates, attributed conversions and spend control"
        nodes={[t('adv.card.1.t'), t('adv.card.2.t'), t('adv.card.3.t'), t('adv.card.4.t')]}
        caption="for advertisers"
      />
      <PageHighlights
        items={[
          { icon: 'tag', text: t('adv.hl.1') },
          { icon: 'users', text: t('adv.hl.2') },
          { icon: 'check', text: t('adv.hl.3') },
        ]}
      />
      <div className="mt-6 space-y-4">
        {[1, 2, 3, 4].map((n) => (
          <Reveal key={n}><div className="lift rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t(`adv.card.${n}.t` as `adv.card.${1 | 2 | 3 | 4}.t`)}</h2><p className="mt-1 text-sm text-slate-600">{t(`adv.card.${n}.d` as `adv.card.${1 | 2 | 3 | 4}.d`)}</p></div></Reveal>
        ))}
      </div>
      <FunnelSteps
        heading={t('adv.funnel.heading')}
        steps={[
          { n: '1', t: t('adv.funnel.1.t'), d: t('adv.funnel.1.d'), to: '/register', cta: t('adv.funnel.1.cta'), icon: 'user' },
          { n: '2', t: t('adv.funnel.2.t'), d: t('adv.funnel.2.d'), to: '/app/advertiser/create-offer', cta: t('adv.funnel.2.cta'), icon: 'plus' },
          { n: '3', t: t('adv.funnel.3.t'), d: t('adv.funnel.3.d'), to: '/app/advertiser/affiliates', cta: t('adv.funnel.3.cta'), icon: 'users' },
          { n: '4', t: t('adv.funnel.4.t'), d: t('adv.funnel.4.d'), to: '/app/advertiser/conversions', cta: t('adv.funnel.4.cta'), icon: 'chart' },
        ]}
      />
      <Link to="/register" className="pill-btn mt-6">{t('adv.register')}</Link>
    </PublicLayout>
  )
}

export function AffiliatesPage() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        {t('aff.h1a')} <span className="grad-text">{t('aff.h1b')}</span>
      </h1>
      <Slogan className="mt-4">{t('aff.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        {t('aff.intro')}
      </p>
      <PageArt
        variant="affiliates"
        label="Illustration: the AffiLayer hub connecting offers, tracking links, SmartLink and payouts from the ledger"
        nodes={[t('aff.card.1.t'), t('aff.card.2.t'), t('aff.card.3.t'), t('aff.card.5.t')]}
        caption="for affiliates"
      />
      <PageHighlights
        items={[
          { icon: 'tag', text: t('aff.hl.1') },
          { icon: 'link', text: t('aff.hl.2') },
          { icon: 'banknote', text: t('aff.hl.3') },
        ]}
      />
      <div className="mt-6 space-y-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <Reveal key={n}><div className="lift rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t(`aff.card.${n}.t` as `aff.card.${1 | 2 | 3 | 4 | 5}.t`)}</h2><p className="mt-1 text-sm text-slate-600">{t(`aff.card.${n}.d` as `aff.card.${1 | 2 | 3 | 4 | 5}.d`)}</p></div></Reveal>
        ))}
      </div>
      <FunnelSteps
        heading={t('aff.funnel.heading')}
        steps={[
          { n: '1', t: t('aff.funnel.1.t'), d: t('aff.funnel.1.d'), to: '/register', cta: t('aff.funnel.1.cta'), icon: 'user' },
          { n: '2', t: t('aff.funnel.2.t'), d: t('aff.funnel.2.d'), to: '/onboarding', cta: t('aff.funnel.2.cta'), icon: 'shield' },
          { n: '3', t: t('aff.funnel.3.t'), d: t('aff.funnel.3.d'), to: '/app/affiliate/offers', cta: t('aff.funnel.3.cta'), icon: 'tag' },
          { n: '4', t: t('aff.funnel.4.t'), d: t('aff.funnel.4.d'), to: '/app/affiliate/tracking-links', cta: t('aff.funnel.4.cta'), icon: 'link' },
          { n: '5', t: t('aff.funnel.5.t'), d: t('aff.funnel.5.d'), to: '/app/affiliate/earnings', cta: t('aff.funnel.5.cta'), icon: 'wallet' },
        ]}
      />
      <Link to="/register" className="pill-btn mt-6">{t('aff.register')}</Link>
    </PublicLayout>
  )
}

/** Numbered funnel path: each step links to the real next page in the app.
 *  Used on the /affiliates, /advertisers and /geo/:country pages. */
export function FunnelSteps({ heading, steps }: {
  heading: string
  steps: { n: string; t: string; d: string; to: string; cta: string; icon: IconName }[]
}) {
  return (
    <section className="mt-14">
      <h2 className="text-center text-3xl font-bold text-white">{heading}</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.t} delay={(i % 3) * 80}>
          <div className="lift relative h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 via-amber-500 to-amber-400 text-sm font-bold text-[#0B1220]" aria-hidden>{s.n}</span>
              <span className="text-amber-400"><Icon name={s.icon} className="h-5 w-5" /></span>
            </div>
            <h3 className="mt-3 text-lg font-bold text-white">{s.t}</h3>
            <p className="mt-1 text-sm text-slate-300">{s.d}</p>
            <Link to={s.to} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300">
              {s.cta} <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function HowItWorks() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        {t('how.h1a')} <span className="grad-text">{t('how.h1b')}</span>
      </h1>
      <Slogan className="mt-4">{t('how.slogan')}</Slogan>
      <PageArt
        variant="how"
        label="Illustration: the AffiLayer hub connecting account creation, approval, offers, clicks, attribution and payout"
        nodes={[t('how.step.1.t'), t('how.step.3.t'), t('how.step.4.t'), t('how.step.6.t')]}
        caption="six steps, nothing hidden"
      />
      <PageHighlights
        items={[
          { icon: 'compass', text: t('how.hl.1') },
          { icon: 'search', text: t('how.hl.2') },
          { icon: 'banknote', text: t('how.hl.3') },
        ]}
      />
      <div className="mt-6 space-y-4">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Reveal key={n}><div className="lift rounded-xl bg-white p-5 text-slate-900"><h2 className="font-semibold">{t(`how.step.${n}.t` as `how.step.${1 | 2 | 3 | 4 | 5 | 6}.t`)}</h2><p className="mt-1 text-sm text-slate-600">{t(`how.step.${n}.d` as `how.step.${1 | 2 | 3 | 4 | 5 | 6}.d`)}</p></div></Reveal>
        ))}
      </div>
      <Link to="/register" className="pill-btn mt-6">{t('how.register')}</Link>
    </PublicLayout>
  )
}

export function Faq() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        Frequently asked <span className="grad-text">questions</span>
      </h1>
      <Slogan className="mt-4">{t('faq.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        Straight answers about joining, running traffic, and getting paid. If your
        question is not here, use the contact form on the home page.
      </p>
      <PageArt
        variant="faq"
        label="Illustration: the AffiLayer hub connecting the three questions every new user asks — joining, running traffic, getting paid"
        nodes={['Joining', 'Running traffic', 'Getting paid', 'Straight answers']}
        caption="straight answers, before you ask"
      />
      <PageHighlights
        items={[
          { icon: 'user', text: 'Joining — free to join; applications reviewed by our team, typically within 2 business days.' },
          { icon: 'link', text: 'Running traffic — direct offers or one SmartLink, every click tracked with a unique click ID.' },
          { icon: 'banknote', text: 'Getting paid — manual, admin-approved payouts, Net30 by default.' },
        ]}
      />
      {FAQ_GROUPS.map((g) => (
        <section key={g.group} className="mt-10">
          <h2 className="text-xl font-bold text-white">{g.group}</h2>
          <div className="mt-4 space-y-3">
            {g.items.map((item) => (
              <Reveal key={item.q}>
              <details className="lift rounded-xl bg-white p-5 text-slate-900">
                <summary className="cursor-pointer font-semibold">{item.q}</summary>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </details>
              </Reveal>
            ))}
          </div>
        </section>
      ))}
    </PublicLayout>
  )
}

export function Contact() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        Contact <span className="grad-text">us</span>
      </h1>
      <Slogan className="mt-4">{t('contact.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        For support, use the ticket system inside your account once you are
        registered. For general enquiries, email{' '}
        <span className="font-semibold text-white">{SUPPORT_EMAIL}</span> or use
        the form below.
      </p>
      <PageArt
        variant="contact"
        label="Illustration: the AffiLayer hub connecting email, in-app tickets and a reply from a real person"
        nodes={['support@affilayer.com', 'In-app tickets', 'A real reply', 'Include your click ID']}
        caption="a real person answers"
      />
      <PageHighlights
        items={[
          { icon: 'mail', text: 'Email us — support@affilayer.com. Include your account email so we can find you.' },
          { icon: 'ticket', text: 'In-app tickets — registered users can raise a ticket from the dashboard.' },
          { icon: 'search', text: 'Tracking questions — include the click ID from your link so we can look it up.' },
        ]}
      />
      <ContactForm />
      <p className="mt-8 text-center text-sm text-[#8A97A8]">
        Include your account email and, for tracking questions, the click ID from your link.
      </p>
    </PublicLayout>
  )
}

export function Terms() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
      <Slogan className="mt-4">{t('terms.slogan')}</Slogan>
      <p className="mt-2 text-sm text-slate-400">
        Operated by MarketSync Global LLC, New Mexico, USA. Last updated: November 2026.
      </p>
      <PageArt
        variant="terms"
        label="Illustration: the AffiLayer hub connecting the service, commissions and traffic rules"
        nodes={['The service', 'Commissions', 'Traffic rules', 'Plain words']}
        caption="the rules, in plain words"
      />
      <PageHighlights
        items={[
          { icon: 'file', text: 'No guaranteed earnings — the network tracks and administers payouts; it does not promise results.' },
          { icon: 'banknote', text: 'Commissions on approved conversions only — recorded in the ledger; payouts manual, Net30 by default.' },
          { icon: 'alert', text: 'Prohibited traffic — incentivised, misleading or bot traffic is not accepted.' },
        ]}
      />
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
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
      <Slogan className="mt-4">{t('privacy.slogan')}</Slogan>
      <p className="mt-2 text-sm text-slate-400">
        Operated by MarketSync Global LLC, New Mexico, USA. Last updated: November 2026.
      </p>
      <PageArt
        variant="privacy"
        label="Illustration: the AffiLayer hub connecting account data, tracking data and the promise never to sell personal data"
        nodes={['Account data', 'Tracking data', 'No sale', 'Your data']}
        caption="your data stays yours"
      />
      <PageHighlights
        items={[
          { icon: 'user', text: 'What we collect — account details, and the tracking data needed to run the network.' },
          { icon: 'eye', text: 'How we use it — tracking, attribution, payouts, fraud prevention and support.' },
          { icon: 'lock', text: 'No selling — we do not sell personal data.' },
        ]}
      />
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

export function Partner() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        Become an <span className="grad-text">AffiLayer partner</span>
      </h1>
      <Slogan className="mt-4">{t('partner.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        AffiLayer grows through partners: networks, platforms, agencies and
        communities that want to bring their audience — or their advertisers —
        to a network they can audit. Partnership is a working relationship,
        not a badge: we agree what each side brings, and we review every
        application by hand.
      </p>
      <PageArt
        variant="partner"
        label="Illustration: the AffiLayer hub connecting partners, applications and shared growth"
        nodes={['Bring your audience', 'Bring your offers', 'Grow together', 'Reviewed by hand']}
        caption="build with us"
      />
      <PageHighlights
        items={[
          { icon: 'users', text: 'Bring your audience — introduce affiliates or advertisers from your community or platform.' },
          { icon: 'tag', text: 'Bring your offers — advertisers and offer owners can publish through the network with their own caps and rules.' },
          { icon: 'sparkle', text: 'Grow together — we review every partnership application ourselves. Tell us what you have in mind.' },
        ]}
      />
      <h2 className="mt-10 text-2xl font-bold text-white">How partnership starts</h2>
      <div className="mt-4 space-y-4">
        {[
          { n: '1', t: 'Tell us about yourself', d: 'Email partner@affilayer.com or use the contact form — who you are, what you bring, and what you need.' },
          { n: '2', t: 'We talk it through', d: 'A real person replies, usually within 2 business days, and we agree the shape of the partnership.' },
          { n: '3', t: 'Start small, grow', d: 'We start with one offer, one audience, or one integration — and grow what works.' },
        ].map((s) => (
          <Reveal key={s.n}>
            <div className="lift flex h-full items-start gap-3 rounded-xl bg-white p-5 text-slate-900">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 via-amber-500 to-amber-400 text-sm font-bold text-[#0B1220]" aria-hidden>{s.n}</span>
              <div>
                <h3 className="font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-400">
        There is no public partner directory yet — partnerships are agreed one by one.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="mailto:partner@affilayer.com" className="pill-btn">Email partner@affilayer.com</a>
        <Link to="/contact" className="pill-btn-outline">Use the contact form</Link>
      </div>
    </PublicLayout>
  )
}

export function WhiteLabel() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        White label <span className="grad-text">AffiLayer</span>
      </h1>
      <Slogan className="mt-4">{t('whitelabel.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        Run your own affiliate network under your own brand, powered by
        AffiLayer&apos;s tracking, ledger and payout administration. Your
        affiliates see your name; the tracking, attribution and commission
        ledger run on our engine.
      </p>
      <PageArt
        variant="whitelabel"
        label="Illustration: the AffiLayer hub connecting your brand, our tracking engine and a managed setup"
        nodes={['Your brand', 'Our engine', 'Managed setup', 'Your affiliates']}
        caption="your network, your name"
      />
      <PageHighlights
        items={[
          { icon: 'layers', text: 'Your brand, your domain — your network carries your name and your look. Your affiliates never see AffiLayer.' },
          { icon: 'search', text: 'Our tracking and ledger — full-funnel click tracking, attributed conversions and an append-only commission ledger.' },
          { icon: 'users', text: 'Managed setup — we set the network up with you and review applications and payouts the same way we do our own.' },
        ]}
      />
      <h2 className="mt-10 text-2xl font-bold text-white">What it includes</h2>
      <div className="mt-4 space-y-4">
        {[
          { t: 'Tracking links and SmartLink', d: 'Every click gets a unique click ID; mixed traffic routes through one SmartLink with deterministic rules.' },
          { t: 'Offer and affiliate approval', d: 'Advertisers publish offers with caps and traffic rules; affiliates apply and are approved before they can run them.' },
          { t: 'Conversion review', d: 'Conversions move through pending, approved, rejected or reversed, with a record of each change.' },
          { t: 'Manual, admin-approved payouts', d: 'Approved commissions enter the ledger and become payable on a Net30 schedule by default.' },
          { t: 'Reporting both sides see', d: 'Clicks, conversions, EPC and CR broken down by date, offer, country, device and source.' },
        ].map((s) => (
          <Reveal key={s.t}>
            <div className="lift flex h-full items-start gap-3 rounded-xl bg-white p-5 text-slate-900">
              <span className="rounded-lg bg-amber-500/10 p-2 text-amber-700"><Icon name="check" className="h-5 w-5" /></span>
              <div>
                <h3 className="font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-400">
        White-label setups are arranged one by one — there is no self-serve
        white-label plan yet. Pricing is agreed per setup; write to us to
        discuss yours.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="mailto:partner@affilayer.com" className="pill-btn">Discuss a white-label setup</a>
        <Link to="/contact" className="pill-btn-outline">Use the contact form</Link>
      </div>
    </PublicLayout>
  )
}

export function Advertise() {
  const t = useT()
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        Advertise with <span className="grad-text">AffiLayer</span>
      </h1>
      <Slogan className="mt-4">{t('advertise.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        AffiLayer puts your offer in front of affiliates who run traffic
        across many countries and verticals. You set the payout, the caps and
        the traffic rules — and you approve the affiliates. Conversions are
        reviewed by the network before anything becomes payable.
      </p>
      <PageArt
        variant="advertise"
        label="Illustration: the AffiLayer hub connecting campaigns, audiences and attributed conversions"
        nodes={['Your campaign', 'Your audience', 'Attribution', 'Reviewed payout']}
        caption="advertise with AffiLayer"
      />
      <PageHighlights
        items={[
          { icon: 'settings', text: 'Your rules, your caps — payout model, countries, devices, traffic sources, daily and total caps, all set by you.' },
          { icon: 'users', text: 'Approve who runs it — review affiliate applications before anyone can generate a tracking link.' },
          { icon: 'check', text: 'Pay for reviewed conversions — conversions move through pending, approved, rejected or reversed.' },
        ]}
      />
      <FunnelSteps
        heading="How a campaign works"
        steps={[
          { n: '1', t: 'Create an account', d: 'Register as an advertiser and complete onboarding.', to: '/register', cta: 'Register', icon: 'user' },
          { n: '2', t: 'Publish your offer', d: 'Set the payout model, caps, GEOs and traffic rules.', to: '/app/advertiser/create-offer', cta: 'Create offer', icon: 'plus' },
          { n: '3', t: 'Approve affiliates', d: 'Review applications before affiliates can run your offer.', to: '/app/advertiser/affiliates', cta: 'Review affiliates', icon: 'users' },
          { n: '4', t: 'Review conversions', d: 'Approve, reject or reverse attributed conversions.', to: '/app/advertiser/conversions', cta: 'See conversions', icon: 'chart' },
        ]}
      />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/register" className="pill-btn">Register as an advertiser</Link>
        <a href="mailto:support@affilayer.com" className="pill-btn-outline">Questions? support@affilayer.com</a>
      </div>
    </PublicLayout>
  )
}

export function NotFound() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">404</p>
        <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">Page not found</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">
          This page does not exist on affilayer.com. The link may be mistyped,
          or the page may have moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="pill-btn">Back to home</Link>
          <Link to="/contact" className="pill-btn-outline">Contact support</Link>
        </div>
      </div>
    </PublicLayout>
  )
}
