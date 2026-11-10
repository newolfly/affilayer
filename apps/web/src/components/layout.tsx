import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/data'
import { Icon } from './icons'
import type { IconName } from './icons'
import { useLocale, useT, localizePath, basePath, LOCALES, LOCALIZED_BASE_PATHS } from '../lib/i18n'
import type { Locale } from '../lib/i18n'
import { COUNTRIES } from '../lib/geo-data'

/** Fades + rises its children into view the first time they scroll on screen.
 *  No-op for users with prefers-reduced-motion (see index.css). */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={`reveal${visible ? ' is-visible' : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

/** Branded page switch: fade/slide plus a gold bar that sweeps across the
 *  top of the viewport on every route change. Keyed by pathname so the
 *  animation replays; purely visual, never blocks navigation; disabled
 *  under prefers-reduced-motion (see index.css). */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="page-in">
      <div className="page-switch-bar" aria-hidden="true" />
      {children}
    </div>
  )
}

/** One slogan per public page — brand + page message + audience, in gold.
 *  Slogans are honest by rule: no stats, no invented claims. */
export function Slogan({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`slogan grad-text ${className}`}>{children}</p>
}

/** Branded loading screen: navy + gold "A" mark, a sweeping gold bar and
 *  skeleton lines that mimic a page header. No fake progress percentages.
 *  Used as the Suspense fallback for lazy page chunks and for auth loading
 *  states, so the site never shows a bare "Loading…" line. */
export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[#070D1A] px-4 py-16" role="status" aria-label="Loading AffiLayer">
      <img src="/logo-mark.svg" alt="" className="loader-mark h-12 w-12" width={48} height={48} />
      <p className="mt-4 text-lg font-bold text-white">AffiLayer</p>
      <div className="loader-bar mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-[#1E2A3F]" aria-hidden="true">
        <div className="loader-bar-fill h-full w-1/2 rounded-full" />
      </div>
      <div className="mt-8 w-full max-w-2xl space-y-3" aria-hidden="true">
        <div className="skeleton h-8 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-4/6" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export function Logo() {
  const locale = useLocale()
  return (
    <Link to={localizePath('/', locale)} className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-bold text-lg text-white">
      <img src="/logo-mark.svg" alt="AffiLayer" className="h-8 w-8" width={32} height={32} />
      AffiLayer
    </Link>
  )
}

/** EN / ES / PT switcher. Links to the same page in the other language when
 *  that page exists in that language, otherwise to that language's home. */
export function LanguageSwitcher() {
  const t = useT()
  const locale = useLocale()
  const { pathname } = useLocation()
  const base = basePath(pathname)
  const target = (l: Locale) =>
    LOCALIZED_BASE_PATHS.includes(base) ? localizePath(base, l) : l === 'en' ? base : `/${l}`
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-slate-700 p-1" role="group" aria-label={t('nav.language')}>
      {LOCALES.map((l) => (
        <Link
          key={l.code}
          to={target(l.code)}
          aria-current={l.code === locale ? 'true' : undefined}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            l.code === locale ? 'bg-[#1E2A3F] text-white' : 'text-slate-400 hover:text-amber-300'
          }`}
        >
          {l.short}
        </Link>
      ))}
    </div>
  )
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const t = useT()
  const locale = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Header nav: only localise paths that actually have a localised
  // route (LOCALIZED_BASE_PATHS). Localising anything else builds a
  // link to a page that does not exist (/es/about, /es/faq, ...), which
  // the SPA then bounces back to English — a soft 404.
  const navPath = (base: string) =>
    LOCALIZED_BASE_PATHS.includes(base) ? localizePath(base, locale) : base
  const publicLinks = [
    { to: navPath('/about'), label: t('nav.about') },
    { to: navPath('/advantages'), label: t('nav.advantages') },
    { to: localizePath('/advertisers', locale), label: t('nav.advertisers') },
    { to: localizePath('/affiliates', locale), label: t('nav.affiliates') },
    { to: localizePath('/how-it-works', locale), label: t('nav.how') },
    { to: localizePath('/geo', locale), label: t('nav.countries') },
    { to: navPath('/blog'), label: t('nav.blog') },
    { to: navPath('/faq'), label: t('nav.faq') },
    { to: '/partner', label: t('nav.partner') },
    { to: navPath('/contact'), label: t('nav.contact') },
  ]
  /** Trust signals. Every item is a true, verifiable statement about how
   *  the network operates — no testimonials, no client logos, no numbers
   *  that are not real. */
  const trustItems: { icon: IconName; text: string }[] = [
    { icon: 'building', text: t('trust.operated') },
    { icon: 'clock', text: t('trust.review') },
    { icon: 'banknote', text: t('trust.payouts') },
    { icon: 'file', text: t('trust.ledger') },
  ]
  return (
    <div className="min-h-screen bg-[#070D1A] text-slate-200">
      <header className={`sticky top-0 z-40 border-b border-slate-800 bg-[#070D1A]/90 backdrop-blur transition-shadow ${scrolled ? 'shadow-lg shadow-black/30' : ''}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden shrink-0 gap-6 xl:flex" aria-label="Main">
            {publicLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `nav-link whitespace-nowrap text-sm transition-colors ${isActive ? 'font-semibold text-white' : 'text-slate-300 hover:text-white'}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            {user ? (
              <Link to="/app" className="pill-btn whitespace-nowrap !px-4 !py-2.5 !text-sm">{t('nav.dashboard')}</Link>
            ) : (
              <>
                <Link to="/login" className="hidden whitespace-nowrap rounded-full border border-slate-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-slate-400 sm:inline-block">{t('nav.login')}</Link>
                <Link to="/register" className="pill-btn whitespace-nowrap !px-4 !py-2.5 !text-sm">{t('nav.register')}</Link>
              </>
            )}
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 xl:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} className="h-5 w-5" />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-slate-800 px-4 py-3 xl:hidden" aria-label="Mobile">
            <div className="grid gap-1">
              {publicLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-slate-800 font-semibold text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                >
                  {l.label}
                </NavLink>
              ))}
              {!user && (
                <Link to="/login" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800/60">
                  {t('nav.login')}
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-10">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-4 pt-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustItems.map((item) => (
              <div key={item.text} className="lift flex items-start gap-3 rounded-xl border border-slate-800 bg-[#111C30]/60 p-4">
                <span className="rounded-lg bg-amber-500/15 p-2 text-amber-400">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <p className="text-sm leading-snug text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-slate-400">
            {t('footer.honest')}{' '}
            <Link to={localizePath('/how-it-works', locale)} className="font-semibold text-amber-400 hover:text-amber-300">{t('footer.honest.how')}</Link>
            {' '}·{' '}
            <Link to="/faq" className="font-semibold text-amber-400 hover:text-amber-300">{t('footer.honest.faq')}</Link>
            {' '}·{' '}
            <a href="mailto:support@affilayer.com" className="font-semibold text-amber-400 hover:text-amber-300">support@affilayer.com</a>
          </p>
        </div>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-slate-400 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <Logo />
            <p className="mt-3">{t('footer.tagline')}</p>
            <Link to="/register" className="pill-btn mt-4">{t('footer.join')}</Link>
          </div>
          <div>
            <p className="font-semibold text-white">{t('footer.company')}</p>
            <ul className="mt-3 space-y-2">
              <li><Link to="/about" className="footer-link">{t('nav.about')}</Link></li>
              <li><Link to="/advantages" className="footer-link">{t('nav.advantages')}</Link></li>
              <li><Link to="/partner" className="footer-link">{t('nav.partner')}</Link></li>
              <li><Link to="/white-label" className="footer-link">{t('nav.whitelabel')}</Link></li>
              <li><Link to="/advertise" className="footer-link">{t('nav.advertise')}</Link></li>
              <li><Link to="/faq" className="footer-link">{t('nav.faq')}</Link></li>
              <li><Link to="/blog" className="footer-link">{t('nav.blog')}</Link></li>
              <li><Link to={localizePath('/brand', locale)} className="footer-link">{t('nav.brand')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">{t('footer.product')}</p>
            <ul className="mt-3 space-y-2">
              <li><Link to={localizePath('/affiliates', locale)} className="footer-link">{t('nav.affiliates')}</Link></li>
              <li><Link to={localizePath('/advertisers', locale)} className="footer-link">{t('nav.advertisers')}</Link></li>
              <li><Link to={localizePath('/how-it-works', locale)} className="footer-link">{t('nav.how')}</Link></li>
              <li><Link to="/login" className="footer-link">{t('nav.login')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">{t('footer.countries')}</p>
            <ul className="mt-3 space-y-2">
              {COUNTRIES.slice(0, 4).map((c) => (
                <li key={c.code}>
                  <Link to={localizePath(`/geo/${c.code}`, locale)} className="footer-link">{c.name[locale]}</Link>
                </li>
              ))}
              <li><Link to={localizePath('/geo', locale)} className="font-semibold text-amber-400 hover:text-amber-300">{t('footer.allCountries')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">{t('footer.info')}</p>
            <ul className="mt-3 space-y-2">
              <li><Link to="/terms" className="footer-link">Terms</Link></li>
              <li><Link to="/privacy" className="footer-link">Privacy</Link></li>
              <li><Link to="/contact" className="footer-link">{t('nav.contact')}</Link></li>
            </ul>
            <p className="mt-4 text-xs text-[#8A97A8]">{t('trust.operated')}.</p>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-4 justify-between px-4 py-4 text-xs text-[#8A97A8]">
            <span>{t('footer.rights')}</span>
            <span>support@affilayer.com</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function DemoBanner() {
  if (!isDemoMode) return null
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
      Demo data — not real. This page shows sample data because Supabase is not configured.
    </div>
  )
}

export function Card({ title, icon, children, className = '' }: { title?: string; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <section className={`lift rounded-xl bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
          {icon && <span className="text-amber-700"><Icon name={icon} className="h-5 w-5" /></span>}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: IconName }) {
  return (
    <div className="lift relative overflow-hidden rounded-xl bg-white p-5 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-500">{label}</p>
        {icon && (
          <span className="rounded-lg bg-amber-500/10 p-1.5 text-amber-700">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

export type DashboardNavItem = { to: string; label: string; icon: IconName }

export function AppLayout({ nav, title }: { nav: DashboardNavItem[]; title: string }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = (user?.email ?? 'A').trim().charAt(0).toUpperCase()
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-40 bg-[#070D1A] text-white shadow-md shadow-black/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} className="h-5 w-5" />
            </button>
            <Logo />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 via-amber-500 to-amber-400 text-sm font-bold text-[#0B1220]" aria-hidden>
                {initial}
              </span>
              <span className="text-slate-300">{user?.email}</span>
              {isDemoMode && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-[#0B1220]" title="Demo mode — sample data, nothing is real">Demo</span>
              )}
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold capitalize text-amber-300">{user?.role.replace('_', ' ')}</span>
            </span>
            <button
              onClick={async () => { await signOut(); navigate('/login') }}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800"
            >
              <Icon name="logout" className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-slate-800 px-4 py-3 md:hidden" aria-label="Dashboard">
            <div className="grid gap-1">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-slate-800 font-semibold text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                >
                  <Icon name={n.icon} className="h-4 w-4 shrink-0" />
                  {n.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-[68px] space-y-1 rounded-xl bg-white p-3 shadow-sm" aria-label="Dashboard">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-amber-100 font-semibold text-[#0B1220] shadow-[inset_4px_0_0_#F59E0B]' : 'text-slate-700 hover:bg-slate-100 hover:text-amber-700'}`}>
                <Icon name={n.icon} className="h-4 w-4 shrink-0" />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main id="main-content" className="min-w-0 flex-1">
          <h1 className="mb-4 text-2xl font-bold">{title}</h1>
          <DemoBanner />
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  )
}

/** First-steps checklist for a new affiliate or advertiser.
 *  Step 1 is derived from the account's real approval status; the other
 *  steps are checked off by the user and stored in this browser only.
 *  In demo mode the card says so plainly — progress here is never
 *  presented as network data. */
const FIRST_STEPS: Record<'affiliate' | 'advertiser', { label: string; desc: string; to: string }[]> = {
  affiliate: [
    { label: 'Complete onboarding', desc: 'Profile, traffic source and payment details — then we review your application.', to: '/onboarding' },
    { label: 'Browse offers', desc: 'Filter by vertical, country, device and payout model.', to: '/app/affiliate/offers' },
    { label: 'Generate your first tracking link', desc: 'Pick an offer and build a link with your sub-parameters.', to: '/app/affiliate/tracking-links' },
    { label: 'Share it and watch reports', desc: 'Clicks and conversions show up in Reports, linked by click ID.', to: '/app/affiliate/reports' },
  ],
  advertiser: [
    { label: 'Complete onboarding', desc: 'Company and website details — then we verify your account.', to: '/onboarding' },
    { label: 'Create your first offer', desc: 'Set the payout model, caps, GEOs and traffic rules.', to: '/app/advertiser/create-offer' },
    { label: 'Approve your first affiliate', desc: 'Review applications before affiliates can run your offer.', to: '/app/advertiser/affiliates' },
    { label: 'Review conversions', desc: 'Approve, reject or reverse attributed conversions.', to: '/app/advertiser/conversions' },
  ],
}

export function FirstSteps({ role }: { role: 'affiliate' | 'advertiser' }) {
  const { user } = useAuth()
  const steps = FIRST_STEPS[role]
  const storageKey = `affilayer-first-steps-${role}-${user?.id ?? 'anon'}`
  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<number, boolean>
    } catch {
      return {}
    }
  })
  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = { ...prev, [i]: !prev[i] }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* storage unavailable */ }
      return next
    })
  }
  const doneCount = steps.filter((_, i) => i === 0 ? user?.status === 'approved' : !!checked[i]).length
  return (
    <Card title="First steps" icon="compass" className="border-amber-500/30">
      <p className="text-sm text-slate-600">
        {doneCount} of {steps.length} done — your path to your first {role === 'affiliate' ? 'payout' : 'customer'}.
        {isDemoMode ? ' Demo checklist — progress is stored in this browser only.' : ' Progress is stored in this browser.'}
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const done = i === 0 ? user?.status === 'approved' : !!checked[i]
          return (
            <li key={s.label} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={done}
                aria-label={`Mark "${s.label}" as ${done ? 'not done' : 'done'}`}
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 text-transparent hover:border-amber-400'}`}
              >
                <Icon name="check" className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{i + 1}. {s.label}</p>
                <p className="text-xs text-slate-500">{s.desc}</p>
              </div>
              <Link to={s.to} className="shrink-0 text-sm font-semibold text-amber-700 hover:text-amber-800">
                Go <Icon name="arrow-right" className="inline h-3.5 w-3.5" />
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{text}</p>
}
