// Auth context — Supabase email/password when configured, otherwise a
// clearly-labeled DEMO role-picker (local only, no backend). Demo sessions
// are stored in localStorage under affilayer-demo-session.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { checkDemoCredentials, isDemoUsername } from '@affilayer/shared'
import { supabase, isSupabaseConfigured } from './supabase'
import { demoProfiles } from './demo-data'
import { logAudit, updateDemo } from './demo-store'
import type { Profile, Role } from './types'

export interface AuthUser {
  id: string
  email: string
  role: Role
  fullName?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  affiliateCode?: string
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, role: Role, meta?: Record<string, string>) => Promise<{ error?: string }>
  /** Sends a password-reset email. The link lands on /reset-password,
   *  where the recovery session lets the user set a new password.
   *  Supabase must allow https://affilayer.com/reset-password as a
   *  redirect URL or the link will not land on the app. */
  requestPasswordReset: (email: string) => Promise<{ error?: string }>
  /** Sets a new password for the current (recovery) session. */
  updatePassword: (password: string) => Promise<{ error?: string }>
  signInDemo: (profileId: string) => void
  /** Public demo login (demo-publisher / demo-advertiser + 1234). Demo-mode
   *  only: never calls Supabase auth, never creates a real account. */
  signInDemoCredentials: (username: string, password: string) => { error?: string; role?: Role }
  signOut: () => Promise<void>
  setOnboarding: (p: Partial<Profile>) => void
}

const Ctx = createContext<AuthCtx | null>(null)
const DEMO_KEY = 'affilayer-demo-session'

function demoToUser(p: Profile): AuthUser {
  return { id: p.id, email: p.email, role: p.role, fullName: p.fullName, status: p.status, affiliateCode: p.affiliateCode }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  /** Shared by the role-picker and the public demo login: store the demo
   *  profile as the session (localStorage only, never a backend call). */
  const doSignInDemo = (profileId: string): boolean => {
    const p = demoProfiles.find((d) => d.id === profileId)
    if (!p) return false
    const u = demoToUser(p)
    localStorage.setItem(DEMO_KEY, JSON.stringify(u))
    setUser(u)
    return true
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      try {
        const raw = localStorage.getItem(DEMO_KEY)
        if (raw) setUser(JSON.parse(raw) as AuthUser)
      } catch {
        /* ignore corrupt demo session */
      }
      setLoading(false)
      return
    }
    const client = supabase
    client.auth.getSession().then(async ({ data }) => {
      const s = data.session
      if (!s?.user) return setLoading(false)
      const { data: prof } = await client.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
      const p = prof as Profile | null
      setUser({
        id: s.user.id,
        email: s.user.email ?? '',
        role: (p?.role ?? 'affiliate') as Role,
        fullName: p?.fullName,
        status: p?.status ?? 'pending',
        affiliateCode: p?.affiliateCode,
      })
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) setUser(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      isDemo: !isSupabaseConfigured,
      signIn: async (email, password) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured — use the demo role-picker below.' }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { error: error.message }
        window.location.href = '/app'
        return {}
      },
      signUp: async (email, password, role, meta) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured — use the demo role-picker below.' }
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { role, ...(meta ?? {}) } } })
        if (error) return { error: error.message }
        return {}
      },
      requestPasswordReset: async (email) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured — password reset is not available in demo mode.' }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) return { error: error.message }
        return {}
      },
      updatePassword: async (password) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured — password reset is not available in demo mode.' }
        const { error } = await supabase.auth.updateUser({ password })
        if (error) return { error: error.message }
        return {}
      },
      signInDemo: (profileId) => {
        doSignInDemo(profileId)
      },
      signInDemoCredentials: (username, password) => {
        // Guardrail: the public demo login exists only while the app runs
        // in demo mode. Once Supabase is configured it is refused outright
        // — demo usernames must never reach Supabase auth or create a user.
        if (isSupabaseConfigured) return { error: 'Demo login is only available in demo mode.' }
        if (!isDemoUsername(username)) return { error: 'Unknown demo username.' }
        const r = checkDemoCredentials(username, password)
        if ('error' in r) return { error: r.error }
        if (!doSignInDemo(r.profileId)) return { error: 'Demo profile not found.' }
        return { role: r.role }
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
        localStorage.removeItem(DEMO_KEY)
        setUser(null)
      },
      setOnboarding: (p) => {
        if (!user) return
        const next = { ...user, ...p, status: p.status ?? 'pending' } as AuthUser
        localStorage.setItem(DEMO_KEY, JSON.stringify(next))
        setUser(next)
        // Demo mode: persist the application so it shows up in the admin
        // Compliance (KYC) queue. In Supabase mode the profile row is
        // created by the database trigger / admin flow instead.
        if (!isSupabaseConfigured) {
          updateDemo((s) => {
            const existing = s.profiles.find((pr) => pr.id === user.id)
            const profile: Profile = {
              id: user.id,
              email: user.email,
              role: (p.role as Role) ?? user.role,
              fullName: p.fullName ?? next.fullName,
              status: 'pending',
              affiliateCode: p.affiliateCode ?? user.affiliateCode,
              trafficSource: p.trafficSource,
              vertical: p.vertical,
              geo: p.geo,
              volume: p.volume,
              paymentMethod: p.paymentMethod,
              paymentDetails: p.paymentDetails,
              company: p.company,
              createdAt: new Date().toISOString(),
            }
            if (existing) Object.assign(existing, profile)
            else s.profiles.unshift(profile)
          })
          logAudit(user.email, 'application.submit', 'profile', user.id, `Onboarding application submitted (${next.role}).`)
        }
      },
    }),
    [user, loading],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function roleHome(role: Role): string {
  if (role === 'affiliate') return '/app/affiliate'
  if (role === 'advertiser') return '/app/advertiser'
  return '/app/admin'
}
