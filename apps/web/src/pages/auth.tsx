import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PublicLayout } from '../components/layout'
import { Icon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { acceptTeamInvite, declineTeamInvite, getMyPendingInvites, saveMyFullName } from '../lib/data'
import type { TeamInvite } from '../lib/data'
import { trackEvent } from '../lib/analytics'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900'
const labelCls = 'mb-1 block text-sm font-medium text-slate-700'
const btnCls = 'w-full rounded-lg bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-[#0B1220]'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [product, setProduct] = useState<'cpa' | 'smartlink'>('cpa')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await signIn(identifier, password)
    if (r.error) setError(r.error)
    else navigate('/app')
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Log in</h1>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setProduct('cpa')}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${product === 'cpa' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
          >CPA offers</button>
          <button
            type="button"
            onClick={() => setProduct('smartlink')}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${product === 'smartlink' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
          >SmartLink</button>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {product === 'cpa'
            ? 'Sign in to browse offers, generate tracking links and follow your earnings.'
            : 'Sign in to manage your SmartLink and see which offer each click was routed to.'}
          {' '}One account unlocks both products.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><label className={labelCls} htmlFor="login-identifier">Email</label><input id="login-identifier" className={inputCls} type="text" autoComplete="username" placeholder="you@example.com" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>
          <div><label className={labelCls} htmlFor="login-password">Password</label><input id="login-password" className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button className={btnCls}>Log in</button>
        </form>
        <p className="mt-3 text-sm text-slate-500"><Link to="/forgot-password" className="text-amber-700 font-semibold">Forgot password?</Link></p>
        <p className="mt-3 text-sm text-slate-500">No account yet? <Link to="/register" className="text-amber-700 font-semibold">Register</Link></p>
      </div>
    </PublicLayout>
  )
}

export function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // A team invite link carries ?team=<token>. It is passed through to
  // signup metadata as team_invite (same pattern as the full_name /
  // fullName keys) so handle_new_user() can link the new account to
  // the inviting team (design §2b). A bad token is ignored server-side
  // and signup still succeeds as a standalone affiliate.
  const teamToken = searchParams.get('team') ?? ''
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<Role>('affiliate')
  const [accountType, setAccountType] = useState('Individual')
  const [country, setCountry] = useState('')
  const [messenger, setMessenger] = useState('')
  const [messengerId, setMessengerId] = useState('')
  const [company, setCompany] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const r = await signUp(email, password, role, {
      fullName: `${firstName} ${lastName}`.trim(),
      // Walk audit 20 Nov 2026: the signup trigger (handle_new_user)
      // reads the snake_case key `full_name` from user metadata — the
      // camelCase `fullName` alone was dropped and profiles.full_name
      // stayed NULL for every registrant. Send both keys.
      full_name: `${firstName} ${lastName}`.trim(),
      accountType,
      country,
      messenger,
      messengerId,
      company,
      website,
      ...(teamToken ? { team_invite: teamToken } : {}),
    })
    if (r.error) setError(r.error)
    else setDone(true)
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">
          {role === 'advertiser'
            ? 'Advertiser registration is shorter — we ask for your company and website so we can verify you.'
            : 'Affiliate registration — tell us who you are and how you run traffic.'}
        </p>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Free to join. Every application is reviewed by a person — complete profiles are usually decided the same day.
          {role === 'affiliate' && ' Affiliates: $50 minimum payout, paid in USDT, Net-30. No website needed — a traffic source we can verify is enough.'}
        </p>
        {done ? (
          <div className="mt-4">
            <p className="text-sm text-slate-600">Account created. Complete onboarding to submit your application for approval.</p>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Important: we have emailed you a confirmation link. Click it to confirm your email address — you will not be able to log in until your email is confirmed, even after your application is approved.</p>
            <button onClick={() => navigate('/onboarding')} className={`${btnCls} mt-4`}>Continue to onboarding</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <p className="text-xs text-slate-500">Fields marked <span className="text-red-500">*</span> are required.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls} htmlFor="reg-first-name">First name<span className="text-red-500"> *</span></label><input id="reg-first-name" className={inputCls} required value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div><label className={labelCls} htmlFor="reg-last-name">Last name<span className="text-red-500"> *</span></label><input id="reg-last-name" className={inputCls} required value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
            <div><label className={labelCls} htmlFor="reg-email">Email<span className="text-red-500"> *</span></label><input id="reg-email" className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls} htmlFor="reg-password">Password<span className="text-red-500"> *</span></label><input id="reg-password" className={inputCls} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div><label className={labelCls} htmlFor="reg-confirm-password">Confirm password<span className="text-red-500"> *</span></label><input id="reg-confirm-password" className={inputCls} type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            <div>
              <label className={labelCls} id="reg-role-label">I am registering as</label>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="reg-role-label">
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === 'affiliate'}
                  onClick={() => setRole('affiliate')}
                  className={`rounded-xl border-2 p-3 text-left transition-colors ${role === 'affiliate' ? 'border-amber-500 bg-amber-100' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="text-amber-700"><Icon name="tag" className="h-5 w-5" /></span>
                  <span className="mt-1 block text-sm font-bold">Affiliate</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Run offers, earn commission</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === 'advertiser'}
                  onClick={() => setRole('advertiser')}
                  className={`rounded-xl border-2 p-3 text-left transition-colors ${role === 'advertiser' ? 'border-amber-500 bg-amber-100' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="text-amber-700"><Icon name="megaphone" className="h-5 w-5" /></span>
                  <span className="mt-1 block text-sm font-bold">Advertiser</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Publish offers, buy traffic</span>
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="reg-account-type">I am</label>
              <select id="reg-account-type" className={inputCls} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                <option>Individual</option>
                <option>Team</option>
                <option>Company</option>
              </select>
            </div>
            {role === 'advertiser' && (
              <>
                <div><label className={labelCls} htmlFor="reg-company">Company<span className="text-red-500"> *</span></label><input id="reg-company" className={inputCls} required value={company} onChange={(e) => setCompany(e.target.value)} /></div>
                <div><label className={labelCls} htmlFor="reg-website">Website<span className="text-red-500"> *</span></label><input id="reg-website" className={inputCls} type="url" placeholder="https://…" required value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
              </>
            )}
            <div><label className={labelCls} htmlFor="reg-country">Country<span className="text-red-500"> *</span></label><input id="reg-country" className={inputCls} required placeholder="e.g. United States" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="reg-messenger">Messenger (optional)</label>
                <select id="reg-messenger" className={inputCls} value={messenger} onChange={(e) => setMessenger(e.target.value)}>
                  <option value="">None</option>
                  <option>Telegram</option>
                  <option>WhatsApp</option>
                  <option>Skype</option>
                </select>
              </div>
              <div><label className={labelCls} htmlFor="reg-messenger-id">Messenger ID (optional)</label><input id="reg-messenger-id" className={inputCls} placeholder="@username" value={messengerId} onChange={(e) => setMessengerId(e.target.value)} /></div>
            </div>
            <button className={btnCls}>Create account</button>
          </form>
        )}
      </div>
    </PublicLayout>
  )
}

export function Onboarding() {
  const { user, setOnboarding } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    role: user?.role ?? 'affiliate',
    company: '',
    trafficSource: '',
    vertical: '',
    geo: '',
    volume: '',
    // M-5 (walk audit 17 Nov 2026): payouts are USDT (TRC20) only.
    // The old Bank transfer / PayPal / Wire options promised rails
    // that do not exist, so there is no choice to offer here.
    paymentMethod: 'USDT (TRC20)',
    paymentDetails: '',
  })
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // Walk audit 20 Nov 2026: the name was collected at registration
    // and here at onboarding and saved nowhere. Registration now
    // stores it via the signup trigger (full_name in user metadata);
    // save it here too when the user is signed in, so existing
    // accounts can set it from this form as well. A user fresh from
    // registration has no session yet (email not confirmed) — the
    // registration save already covers them, so the save is skipped
    // then instead of blocking the submit.
    const name = form.fullName.trim()
    if (name && user) {
      const r = await saveMyFullName(name)
      if (r.error) {
        setError(r.error)
        return
      }
    }
    setOnboarding({
      fullName: form.fullName,
      role: form.role as Role,
      company: form.company,
      trafficSource: form.trafficSource,
      vertical: form.vertical,
      geo: form.geo,
      volume: form.volume,
      paymentMethod: form.paymentMethod,
      paymentDetails: form.paymentDetails,
      status: 'pending',
    })
    // A team member stays status='pending' by design, but the
    // RequireAuth carve-out admits them — so they go to the dashboard,
    // not the approval-waiting page. Everyone else waits for approval.
    trackEvent('profile_completed', { role: form.role })
    navigate(user?.teamContext ? '/app' : '/pending')
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Onboarding</h1>
        <p className="mt-1 text-sm text-slate-500">Tell us about your profile. Your application is reviewed before you can run offers.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">Fields marked <span className="text-red-500">*</span> are required. Messenger details help us reach you faster during review — they are optional.</p>
          <div><label className={labelCls} htmlFor="onb-full-name">Full name<span className="text-red-500"> *</span></label><input id="onb-full-name" className={inputCls} required value={form.fullName} onChange={set('fullName')} /></div>
          <div>
            <label className={labelCls} htmlFor="onb-role">Role</label>
            <select id="onb-role" className={inputCls} value={form.role} onChange={set('role')}>
              <option value="affiliate">Affiliate</option>
              <option value="advertiser">Advertiser</option>
            </select>
          </div>
          <div><label className={labelCls} htmlFor="onb-company">Company (optional)</label><input id="onb-company" className={inputCls} value={form.company} onChange={set('company')} /></div>
          <div><label className={labelCls} htmlFor="onb-traffic-source">Traffic source<span className="text-red-500"> *</span></label><input id="onb-traffic-source" className={inputCls} required placeholder="e.g. SEO, PPC, Social, Email, Content" value={form.trafficSource} onChange={set('trafficSource')} /></div>
          <div><label className={labelCls} htmlFor="onb-vertical">Category<span className="text-red-500"> *</span></label><input id="onb-vertical" className={inputCls} required placeholder="e.g. Finance, E-commerce, SaaS" value={form.vertical} onChange={set('vertical')} /></div>
          <div><label className={labelCls} htmlFor="onb-geo">Countries you promote in<span className="text-red-500"> *</span></label><input id="onb-geo" className={inputCls} required placeholder="e.g. US, GB, CA" value={form.geo} onChange={set('geo')} /></div>
          <div>
            <label className={labelCls} htmlFor="onb-volume">How many clicks per month (optional)</label>
            <select id="onb-volume" className={inputCls} value={form.volume} onChange={set('volume')}>
              <option value="">Select…</option>
              <option>Under 1,000 clicks/mo</option>
              <option>1,000–5,000 clicks/mo</option>
              <option>5,000–25,000 clicks/mo</option>
              <option>Over 25,000 clicks/mo</option>
            </select>
          </div>
          <div>
            <p className="text-sm text-slate-700"><span className="font-medium">Payout method: USDT (TRC20).</span> AffiLayer pays affiliates in USDT on TRON (TRC20) only — there is no bank transfer, PayPal or wire option. Minimum payout $50, Net-30 on approved balance.</p>
          </div>
          <div><label className={labelCls} htmlFor="onb-payment-details">Your USDT wallet address (optional)</label><input id="onb-payment-details" className={inputCls} placeholder="USDT TRC20 wallet address (starts with T)" value={form.paymentDetails} onChange={set('paymentDetails')} /><p className="mt-1 text-xs text-slate-500">You can add or change this later on the Payouts page.</p></div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">After you submit, your application goes to review. One step is easy to miss: click the confirmation link in the email we sent when you registered. Without a confirmed email you cannot log in, even after approval.</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className={btnCls}>Submit application</button>
        </form>
      </div>
    </PublicLayout>
  )
}

export function Pending() {
  const { user, loading, refreshTeamContext, refreshEmailConfirmed } = useAuth()
  const navigate = useNavigate()
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [inviteError, setInviteError] = useState('')
  // Live verified state: re-read the session user's confirmation flag
  // on mount (landing straight from the confirmation link) and
  // whenever the tab regains focus (confirmed in another tab) — the
  // page flips to the green verified box without a manual reload.
  // The auth-state subscription in AuthProvider covers the same
  // events; this is the belt-and-braces re-fetch.
  useEffect(() => {
    refreshEmailConfirmed()
    const onFocus = () => { void refreshEmailConfirmed() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshEmailConfirmed])
  // A pending invite for this email is the only screen an existing
  // account can reach before accepting (design §2c) — show the
  // accept / decline banner here too, not just on the dashboard.
  useEffect(() => {
    if (!user) return
    getMyPendingInvites().then(setInvites)
  }, [user?.id])
  const respondInvite = async (invite: TeamInvite, accept: boolean) => {
    const r = accept ? await acceptTeamInvite(invite.id) : await declineTeamInvite(invite.id)
    if (r.error) { setInviteError(r.error); return }
    setInvites((list) => list.filter((i) => i.id !== invite.id))
    if (accept) {
      await refreshTeamContext()
      navigate('/app')
    }
  }
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Approval status</h1>
        {invites.map((inv) => (
          <div key={inv.id} className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <p className="font-semibold">{inv.inviterEmail ?? 'Someone'} invited you to join their team</p>
            {user?.status === 'approved' && <p className="mt-1">Joining means your own tracking links stop earning — your team's links earn for the team instead.</p>}
            <div className="mt-2 flex gap-2">
              <button className={btnCls} onClick={() => respondInvite(inv, true)}>Accept</button>
              <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => respondInvite(inv, false)}>Decline</button>
            </div>
          </div>
        ))}
        {inviteError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{inviteError}</p>}
        <p className="mt-3 text-sm text-slate-600">
          {loading ? (
            <>Checking your account…</>
          ) : user ? (
            <>Account <strong>{user.email}</strong> is currently <strong>{user.status}</strong>.</>
          ) : (
            <>No account is signed in. Log in to check your approval status.</>
          )}
        </p>
        {user?.status === 'pending' && user?.teamContext && (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">You're on {user.teamContext.parentEmail}'s team — you can use the app now, no approval wait. <button className="font-semibold underline" onClick={() => navigate('/app')}>Go to dashboard</button></p>
        )}
        {user?.status === 'pending' && user?.emailConfirmed && !user?.teamContext && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Email confirmed ✓ — your application is under review. You will be able to use the app once it is approved.</p>
        )}
        {user?.status === 'pending' && !user?.emailConfirmed && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Your application is under review. You will be able to use the app once it is approved. While you wait, make sure your email is confirmed: click the confirmation link we emailed you when you registered. You cannot log in until your email is confirmed, even after approval.</p>
        )}
        {!user && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Just registered and cannot log in? Your email must be confirmed first — check your inbox for the confirmation link we sent, click it, then log in.</p>
        )}
        {user?.status === 'approved' && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Your account is approved. <Link to="/app" className="font-semibold underline">Go to your dashboard</Link>.</p>
        )}
        {user?.status === 'rejected' && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Your application was not approved. Contact support if you think this is a mistake.</p>
        )}
      </div>
    </PublicLayout>
  )
}

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await requestPasswordReset(email)
    if (r.error) setError(r.error)
    else setSent(true)
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Forgot password</h1>
        {sent ? (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            If an account exists for that email, a reset link has been sent. Check your inbox (and spam folder) — the link expires after a short time.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">Enter the email you registered with and we will send you a link to set a new password.</p>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div><label className={labelCls} htmlFor="forgot-email">Email</label><input id="forgot-email" className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <button className={btnCls}>Send reset link</button>
            </form>
          </>
        )}
        <p className="mt-3 text-sm text-slate-500">Remembered it? <Link to="/login" className="text-amber-700 font-semibold">Back to log in</Link></p>
      </div>
    </PublicLayout>
  )
}

export function ResetPassword() {
  const { updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // The reset email links here with #access_token=…&type=recovery. The
  // Supabase client parses that hash on load and establishes a recovery
  // session (PASSWORD_RECOVERY). No session means the link is invalid or
  // expired — never show the password form in that case.
  useEffect(() => {
    let alive = true
    if (!supabase) {
      setChecking(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setHasSession(!!data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(true)
        setChecking(false)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    const r = await updatePassword(password)
    if (r.error) setError(r.error)
    else setDone(true)
  }

  const backToLogin = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Set a new password</h1>
        {checking ? (
          <p className="mt-3 text-sm text-slate-500">Checking your reset link…</p>
        ) : done ? (
          <>
            <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Your password has been updated.</p>
            <button onClick={backToLogin} className={`${btnCls} mt-4`}>Log in with your new password</button>
          </>
        ) : !hasSession ? (
          <>
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This reset link is invalid or has expired.</p>
            <p className="mt-3 text-sm text-slate-500">Request a new one from the <Link to="/forgot-password" className="text-amber-700 font-semibold">forgot password</Link> page.</p>
          </>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div><label className={labelCls} htmlFor="reset-password">New password</label><input id="reset-password" className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div><label className={labelCls} htmlFor="reset-confirm">Confirm new password</label><input id="reset-confirm" className={inputCls} type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            <button className={btnCls}>Set new password</button>
          </form>
        )}
      </div>
    </PublicLayout>
  )
}
