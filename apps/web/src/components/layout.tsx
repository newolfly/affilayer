import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/data'

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

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-200">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <nav className="hidden gap-6 md:flex">
            {publicLinks.map((l) => (
              <Link key={l.to} to={l.to} className="text-sm text-slate-300 hover:text-white">{l.label}</Link>
            ))}
          </nav>
          <div className="flex gap-2">
            {user ? (
              <Link to="/app" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-white">Log in</Link>
                <Link to="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      <footer className="border-t border-slate-800">
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

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export function AppLayout({ nav, title }: { nav: { to: string; label: string }[]; title: string }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-[#0B1220] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-slate-300">{user?.email} · {user?.role}</span>
            <button
              onClick={async () => { await signOut(); navigate('/login') }}
              className="rounded-lg border border-slate-600 px-3 py-1.5 hover:bg-slate-800"
            >Log out</button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="space-y-1 rounded-xl bg-white p-3 shadow-sm">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-100'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <h1 className="mb-4 text-2xl font-bold">{title}</h1>
          <DemoBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{text}</p>
}
