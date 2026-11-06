import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/data'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold text-lg text-white">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">A</span>
      AffiLayer
    </Link>
  )
}

const publicLinks = [
  { to: '/about', label: 'About' },
  { to: '/advertisers', label: 'Advertisers' },
  { to: '/affiliates', label: 'Affiliates' },
  { to: '/how-it-works', label: 'How it works' },
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
        <div className="mx-auto flex max-w-6xl flex-wrap gap-4 justify-between px-4 py-6 text-sm text-slate-400">
          <span>© 2026 AffiLayer. All rights reserved.</span>
          <span className="flex gap-4">
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
          </span>
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
