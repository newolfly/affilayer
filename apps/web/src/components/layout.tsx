import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/data'
import { Icon } from './icons'
import type { IconName } from './icons'

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

/** Light fade/slide on every route change. Keyed by pathname so the
 *  animation replays when the route changes; disabled under
 *  prefers-reduced-motion (see index.css). */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="page-in">
      {children}
    </div>
  )
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-bold text-lg text-white">
      <img src="/logo-mark.svg" alt="AffiLayer" className="h-8 w-8" width={32} height={32} />
      AffiLayer
    </Link>
  )
}

const publicLinks = [
  { to: '/about', label: 'About' },
  { to: '/advantages', label: 'Advantages' },
  { to: '/advertisers', label: 'Advertisers' },
  { to: '/affiliates', label: 'Affiliates' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/blog', label: 'Blog' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
]

/** Trust signals shown in the footer. Every item is a true, verifiable
 *  statement about how the network operates — no testimonials, no client
 *  logos, no numbers that are not real. */
export const TRUST_ITEMS: { icon: IconName; text: string }[] = [
  { icon: 'building', text: 'Operated by MarketSync Global LLC, New Mexico, USA' },
  { icon: 'clock', text: 'Applications reviewed by our team, typically within 2 business days' },
  { icon: 'banknote', text: 'Payouts manual and admin-approved, Net30 by default' },
  { icon: 'file', text: 'Every commission written to an auditable ledger' },
]

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-200">
      <header className={`sticky top-0 z-40 border-b border-slate-800 bg-[#0B1220]/90 backdrop-blur transition-shadow ${scrolled ? 'shadow-lg shadow-black/30' : ''}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <nav className="hidden gap-6 lg:flex" aria-label="Main">
            {publicLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `text-sm transition-colors ${isActive ? 'font-semibold text-white' : 'text-slate-300 hover:text-white'}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className="pill-btn !px-4 !py-2 !text-sm">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-slate-400 sm:inline-block">Log in</Link>
                <Link to="/register" className="pill-btn !px-4 !py-2 !text-sm">Register</Link>
              </>
            )}
            <button
              type="button"
              className="rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} className="h-5 w-5" />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-slate-800 px-4 py-3 lg:hidden" aria-label="Mobile">
            <div className="grid gap-1">
              {publicLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-800 font-semibold text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                >
                  {l.label}
                </NavLink>
              ))}
              {!user && (
                <Link to="/login" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800/60">
                  Log in
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-4 pt-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_ITEMS.map((t) => (
              <div key={t.text} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <span className="rounded-lg bg-orange-500/15 p-2 text-orange-400">
                  <Icon name={t.icon} className="h-5 w-5" />
                </span>
                <p className="text-sm leading-snug text-slate-300">{t.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-slate-400">
            How we keep it honest:{' '}
            <Link to="/how-it-works" className="font-semibold text-orange-400 hover:text-orange-300">see how tracking and payouts work</Link>
            {' '}·{' '}
            <Link to="/faq" className="font-semibold text-orange-400 hover:text-orange-300">read the FAQ</Link>
            {' '}·{' '}
            <a href="mailto:support@affilayer.com" className="font-semibold text-orange-400 hover:text-orange-300">support@affilayer.com</a>
          </p>
        </div>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-slate-400 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3">A CPA affiliate network. Direct offers and SmartLink, with tracking and a ledger you can audit.</p>
            <Link to="/register" className="pill-btn mt-4">Join AffiLayer</Link>
          </div>
          <div>
            <p className="font-semibold text-white">Company</p>
            <ul className="mt-3 space-y-2">
              <li><Link to="/about" className="hover:text-white">About</Link></li>
              <li><Link to="/advantages" className="hover:text-white">Advantages</Link></li>
              <li><Link to="/faq" className="hover:text-white">FAQ</Link></li>
              <li><Link to="/blog" className="hover:text-white">Blog</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Product</p>
            <ul className="mt-3 space-y-2">
              <li><Link to="/affiliates" className="hover:text-white">For affiliates</Link></li>
              <li><Link to="/advertisers" className="hover:text-white">For advertisers</Link></li>
              <li><Link to="/how-it-works" className="hover:text-white">How it works</Link></li>
              <li><Link to="/login" className="hover:text-white">Log in</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Info</p>
            <ul className="mt-3 space-y-2">
              <li><Link to="/terms" className="hover:text-white">Terms</Link></li>
              <li><Link to="/privacy" className="hover:text-white">Privacy</Link></li>
              <li><Link to="/contact" className="hover:text-white">Contact</Link></li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">Operated by MarketSync Global LLC, New Mexico, USA.</p>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-4 justify-between px-4 py-4 text-xs text-slate-500">
            <span>© 2026 AffiLayer. All rights reserved.</span>
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
    <section className={`rounded-xl bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
          {icon && <span className="text-orange-600"><Icon name={icon} className="h-5 w-5" /></span>}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: IconName }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 to-yellow-400" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-500">{label}</p>
        {icon && (
          <span className="rounded-lg bg-orange-500/10 p-1.5 text-orange-600">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
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
      <header className="sticky top-0 z-40 bg-[#0B1220] text-white shadow-md shadow-black/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 md:hidden"
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
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-yellow-400 text-sm font-bold text-white" aria-hidden>
                {initial}
              </span>
              <span className="text-slate-300">{user?.email}</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold capitalize text-orange-300">{user?.role.replace('_', ' ')}</span>
            </span>
            <button
              onClick={async () => { await signOut(); navigate('/login') }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 hover:bg-slate-800"
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
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-800 font-semibold text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
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
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-orange-50 font-semibold text-orange-700' : 'text-slate-700 hover:bg-slate-100'}`}>
                <Icon name={n.icon} className="h-4 w-4 shrink-0" />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
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
    <Card title="First steps" icon="compass" className="border-orange-500/30">
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
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 text-transparent hover:border-orange-400'}`}
              >
                <Icon name="check" className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{i + 1}. {s.label}</p>
                <p className="text-xs text-slate-500">{s.desc}</p>
              </div>
              <Link to={s.to} className="shrink-0 text-sm font-semibold text-orange-600 hover:text-orange-700">
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
