import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicLayout } from '../components/layout'
import { useAuth } from '../lib/auth'
import { isDemoMode } from '../lib/data'
import { demoProfiles } from '../lib/demo-data'
import type { Role } from '../lib/types'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900'
const labelCls = 'mb-1 block text-sm font-medium text-slate-700'
const btnCls = 'w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white'

export function Login() {
  const { signIn, signInDemo } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await signIn(email, password)
    if (r.error) setError(r.error)
    else navigate('/app')
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Log in</h1>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><label className={labelCls}>Email</label><input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className={labelCls}>Password</label><input className={inputCls} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button className={btnCls}>Log in</button>
        </form>
        <p className="mt-3 text-sm text-slate-500">No account yet? <Link to="/register" className="text-blue-700 font-semibold">Register</Link></p>
        {isDemoMode && (
          <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Demo mode — pick a role to sign in (no password, fake data)</p>
            <div className="mt-3 space-y-2">
              {demoProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { signInDemo(p.id); navigate('/app') }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {p.full_name} — {p.role} ({p.status})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  )
}

export function Register() {
  const { signUp, signInDemo } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('affiliate')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await signUp(email, password, role)
    if (r.error) setError(r.error)
    else setDone(true)
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Create an account</h1>
        {done ? (
          <div className="mt-4">
            <p className="text-sm text-slate-600">Account created. Complete onboarding to submit your application for approval.</p>
            <button onClick={() => navigate('/onboarding')} className={`${btnCls} mt-4`}>Continue to onboarding</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div><label className={labelCls}>Email</label><input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className={labelCls}>Password</label><input className={inputCls} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div>
              <label className={labelCls}>I am registering as</label>
              <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="affiliate">Affiliate</option>
                <option value="advertiser">Advertiser</option>
              </select>
            </div>
            <button className={btnCls}>Create account</button>
            {isDemoMode && (
              <p className="text-xs text-slate-500">Demo mode: Supabase is not configured, so registration is simulated — use the demo role-picker on the <Link to="/login" className="text-blue-700">login page</Link> instead, or continue to onboarding after picking a demo role.</p>
            )}
            <button type="button" onClick={() => { signInDemo('demo-aff-1'); navigate('/onboarding') }} className="w-full text-sm text-blue-700 underline">Demo: continue as Demo Affiliate</button>
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
    paymentMethod: 'Bank transfer',
    paymentDetails: '',
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setOnboarding({
      full_name: form.fullName,
      role: form.role as Role,
      company: form.company,
      traffic_source: form.trafficSource,
      vertical: form.vertical,
      geo: form.geo,
      volume: form.volume,
      payment_method: form.paymentMethod,
      payment_details: form.paymentDetails,
      status: 'pending',
    })
    navigate('/pending')
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Onboarding</h1>
        <p className="mt-1 text-sm text-slate-500">Tell us about your profile. Your application is reviewed before you can run offers.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><label className={labelCls}>Full name</label><input className={inputCls} required value={form.fullName} onChange={set('fullName')} /></div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={inputCls} value={form.role} onChange={set('role')}>
              <option value="affiliate">Affiliate</option>
              <option value="advertiser">Advertiser</option>
            </select>
          </div>
          <div><label className={labelCls}>Company (optional)</label><input className={inputCls} value={form.company} onChange={set('company')} /></div>
          <div><label className={labelCls}>Traffic source</label><input className={inputCls} required placeholder="e.g. SEO, PPC, Social, Email, Content" value={form.trafficSource} onChange={set('trafficSource')} /></div>
          <div><label className={labelCls}>Vertical</label><input className={inputCls} required placeholder="e.g. Finance, E-commerce, SaaS" value={form.vertical} onChange={set('vertical')} /></div>
          <div><label className={labelCls}>GEO (countries)</label><input className={inputCls} required placeholder="e.g. US, GB, CA" value={form.geo} onChange={set('geo')} /></div>
          <div>
            <label className={labelCls}>Monthly volume</label>
            <select className={inputCls} value={form.volume} onChange={set('volume')}>
              <option value="">Select…</option>
              <option>Under 1,000 clicks/mo</option>
              <option>1,000–5,000 clicks/mo</option>
              <option>5,000–25,000 clicks/mo</option>
              <option>Over 25,000 clicks/mo</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Payment profile — method</label>
            <select className={inputCls} value={form.paymentMethod} onChange={set('paymentMethod')}>
              <option>Bank transfer</option>
              <option>PayPal</option>
              <option>Wire transfer</option>
            </select>
          </div>
          <div><label className={labelCls}>Payment details</label><input className={inputCls} placeholder="Account / wallet reference" value={form.paymentDetails} onChange={set('paymentDetails')} /></div>
          <button className={btnCls}>Submit application</button>
        </form>
      </div>
    </PublicLayout>
  )
}

export function Pending() {
  const { user } = useAuth()
  return (
    <PublicLayout>
      <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-slate-900">
        <h1 className="text-xl font-bold">Approval status</h1>
        <p className="mt-3 text-sm text-slate-600">
          {user ? (
            <>Account <strong>{user.email}</strong> is currently <strong>{user.status}</strong>.</>
          ) : (
            <>No account is signed in. Log in to check your approval status.</>
          )}
        </p>
        {user?.status === 'pending' && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Your application is under review. You will be able to use the app once it is approved.</p>
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
