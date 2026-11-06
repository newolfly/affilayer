// Auth context — Supabase email/password when configured, otherwise a
// clearly-labeled DEMO role-picker (local only, no backend). Demo sessions
// are stored in localStorage under affilayer-demo-session.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { demoProfiles } from './demo-data'
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
  signUp: (email: string, password: string, role: Role) => Promise<{ error?: string }>
  signInDemo: (profileId: string) => void
  signOut: () => Promise<void>
  setOnboarding: (p: Partial<Profile>) => void
}

const Ctx = createContext<AuthCtx | null>(null)
const DEMO_KEY = 'affilayer-demo-session'

function demoToUser(p: Profile): AuthUser {
  return { id: p.id, email: p.email, role: p.role, fullName: p.full_name, status: p.status, affiliateCode: p.affiliate_code }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

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
        fullName: p?.full_name,
        status: p?.status ?? 'pending',
        affiliateCode: p?.affiliate_code,
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
      signUp: async (email, password, role) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Supabase is not configured — use the demo role-picker below.' }
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { role } } })
        if (error) return { error: error.message }
        return {}
      },
      signInDemo: (profileId) => {
        const p = demoProfiles.find((d) => d.id === profileId)
        if (!p) return
        const u = demoToUser(p)
        localStorage.setItem(DEMO_KEY, JSON.stringify(u))
        setUser(u)
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
