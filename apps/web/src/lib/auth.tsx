// Auth context — Supabase email/password only. There is no demo mode:
// every session is a real Supabase session (production-grade rule,
// 20 Nov 2026 — demo mode was removed entirely on Sojib's order).
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { getMyTeamContext } from './data'
import { identifyUser, trackEvent } from './analytics'
import type { TeamContext } from './data'
import type { Profile, Role } from './types'

export interface AuthUser {
  id: string
  email: string
  role: Role
  fullName?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  affiliateCode?: string
  organizationId?: string
  /** Whether the session user's email is confirmed
   *  (auth.users email_confirmed_at). /pending shows a green
   *  "Email confirmed" state when true and the amber "confirm your
   *  email" warning when false — a pending user who just clicked
   *  their confirmation link must not be told to confirm it again
   *  (27 Nov 2026). */
  emailConfirmed?: boolean
  /** The team head this affiliate belongs to, if any — loaded once at
   *  session start via the my_team_context() RPC (migration 030).
   *  Null = standalone affiliate. Never carries the parent's wallet. */
  teamContext?: TeamContext | null
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, role: Role, meta?: Record<string, string>) => Promise<{ error?: string }>
  /** Sends a password-reset email. The link lands on /reset-password,
   *  where the recovery session lets the user set a new password.
   *  Supabase must allow https://affilayer.com/reset-password as a
   *  redirect URL or the link will not land on the app. */
  requestPasswordReset: (email: string) => Promise<{ error?: string }>
  /** Sets a new password for the current (recovery) session. */
  updatePassword: (password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  setOnboarding: (p: Partial<Profile>) => void
  /** Re-read the team context (after accepting / leaving a team) —
   *  the session-start load above does not re-run on its own. */
  refreshTeamContext: () => Promise<void>
  /** Re-read the session user's email-confirmation flag from the
   *  server and merge it into the app user. /pending calls this on
   *  mount and on window focus so it flips to the verified state
   *  when the user lands straight from the confirmation link or
   *  confirms in another tab — no manual reload. */
  refreshEmailConfirmed: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }
    const client = supabase
    client.auth.getSession().then(async ({ data }) => {
      const s = data.session
      if (!s?.user) return setLoading(false)
      const { data: prof } = await client.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
      const p = prof as Profile | null
      const raw = prof as { full_name?: string; organization_id?: string } | null
      const role = (p?.role ?? 'affiliate') as Role
      // The affiliate code lives in affiliate_profiles, NOT on the profiles
      // row — reading it from profiles always came back empty, and the UI
      // silently fell back to a demo code, breaking every tracking link a
      // real affiliate generated (user-walk audit 17 Nov 2026, C-1).
      let affiliateCode: string | undefined = p?.affiliateCode
      if (role === 'affiliate' && !affiliateCode) {
        const { data: ap } = await client.from('affiliate_profiles').select('affiliate_code').eq('profile_id', s.user.id).maybeSingle()
        affiliateCode = (ap as { affiliate_code?: string } | null)?.affiliate_code ?? undefined
      }
      // Team context (migration 030): a member's own code is inert
      // while they are on a team, so the app needs the parent's code
      // for tracking links. A missing RPC (030 not applied yet) reads
      // as no team — login never blocks on it.
      let teamContext: TeamContext | null = null
      if (role === 'affiliate') {
        teamContext = await getMyTeamContext().catch(() => null)
      }
      setUser({
        id: s.user.id,
        email: s.user.email ?? '',
        role,
        fullName: p?.fullName ?? raw?.full_name,
        status: p?.status ?? 'pending',
        affiliateCode,
        organizationId: raw?.organization_id ?? undefined,
        teamContext,
        emailConfirmed: !!s.user.email_confirmed_at,
      })
      // PostHog identify (27 Nov 2026): profile id + affiliate code
      // only — never email. Runs on every session start, so it covers
      // sign-in, page reload, and confirmation-link sign-in alike.
      identifyUser(s.user.id, affiliateCode)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) { setUser(null); return }
      // Live confirmation state: the confirmation link (SIGNED_IN) and
      // a confirmation completed in another tab both refresh the
      // session user — carry email_confirmed_at into the app user so
      // /pending flips to the verified state without a reload. If no
      // app user is loaded yet, the session-start load above sets the
      // flag when it resolves.
      setUser((prev) => (prev && prev.id === session.user.id ? { ...prev, emailConfirmed: !!session.user.email_confirmed_at } : prev))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Authentication is not available right now. Please try again later.' }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { error: error.message }
        trackEvent('user_signed_in')
        window.location.href = '/app'
        return {}
      },
      signUp: async (email, password, role, meta) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Registration is not available right now. Please try again later.' }
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { role, ...(meta ?? {}) } } })
        if (error) return { error: error.message }
        trackEvent('user_signed_up', { role })
        return {}
      },
      requestPasswordReset: async (email) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Password reset is not available right now. Please try again later.' }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) return { error: error.message }
        return {}
      },
      updatePassword: async (password) => {
        if (!isSupabaseConfigured || !supabase) return { error: 'Password reset is not available right now. Please try again later.' }
        const { error } = await supabase.auth.updateUser({ password })
        if (error) return { error: error.message }
        return {}
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
        setUser(null)
      },
      setOnboarding: (p) => {
        if (!user) return
        // Local state only, except full_name: the profile row itself is
        // created by the database trigger, and the name is persisted
        // from onboarding by saveMyFullName (lib/data.ts) — ordinary
        // self-edits of full_name pass through RLS and the trigger
        // clamps role/status/kyc, so an approved user stays approved.
        const next = { ...user, ...p, status: p.status ?? 'pending' } as AuthUser
        setUser(next)
      },
      refreshTeamContext: async () => {
        if (!supabase) return
        const { data: { user: sUser } } = await supabase.auth.getUser()
        if (!sUser) return
        const teamContext = await getMyTeamContext().catch(() => null)
        setUser((prev) => (prev && prev.id === sUser.id ? { ...prev, teamContext } : prev))
      },
      refreshEmailConfirmed: async () => {
        if (!supabase) return
        const { data: { user: sUser } } = await supabase.auth.getUser()
        if (!sUser) return
        setUser((prev) => (prev && prev.id === sUser.id ? { ...prev, emailConfirmed: !!sUser.email_confirmed_at } : prev))
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
