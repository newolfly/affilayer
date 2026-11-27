// PostHog analytics (27 Nov 2026) — free tier only.
//
// The project key is NOT in this repo: it comes from the build-time env
// var VITE_POSTHOG_KEY (set in the Cloudflare Pages project once the
// key exists). Until then this module is a no-op:
//  - posthog-js is loaded with a dynamic import ONLY when a key is
//    configured, so with no key the library code never loads and zero
//    PostHog network calls are made.
//  - every helper below is safe to call unconditionally — with no key
//    it returns silently and the app runs exactly as before.
//  - analytics must never break the app: an import/init failure is
//    swallowed, never thrown.
//
// Privacy rule: identify by profile id + affiliate code ONLY — never
// email, password, or wallet address. No session recording, no
// autocapture (free tier, and the app must not record what users type).
// $pageview is captured manually on route change (App.tsx
// PageviewTracker) because capture_pageview is off.
import type posthogJs from 'posthog-js'

type Posthog = typeof posthogJs

type PendingEvent = { event: string; props?: Record<string, unknown> }

let ph: Posthog | null = null
let initStarted = false
const pending: PendingEvent[] = []
let pendingIdentify: { id: string; props?: Record<string, unknown> } | null = null

function flush(): void {
  if (!ph) return
  if (pendingIdentify) {
    ph.identify(pendingIdentify.id, pendingIdentify.props)
    pendingIdentify = null
  }
  while (pending.length) {
    const e = pending.shift()
    if (e) ph.capture(e.event, e.props)
  }
}

/** Start PostHog once, at app boot (main.tsx). No key → nothing happens. */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
  if (!key || initStarted || typeof window === 'undefined') return
  initStarted = true
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
      })
      ph = posthog
      flush()
    })
    .catch(() => {
      // Analytics must never break the app.
    })
}

/** Capture an event. No-op when PostHog is not configured; queued while
 *  the library is still loading so early events (e.g. sign-in) are not
 *  lost. */
export function trackEvent(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (ph) {
    ph.capture(event, props)
    return
  }
  if (!initStarted) return
  if (pending.length > 50) pending.shift()
  pending.push({ event, props })
}

/** $pageview, captured on every route change (see PageviewTracker). */
export function trackPageview(): void {
  trackEvent('$pageview')
}

/** Identify the signed-in user by profile id + affiliate code only.
 *  Never pass email, password, or a wallet address here. */
export function identifyUser(profileId: string, affiliateCode?: string): void {
  if (typeof window === 'undefined' || !profileId) return
  const props = affiliateCode ? { affiliate_code: affiliateCode } : undefined
  if (ph) {
    ph.identify(profileId, props)
    return
  }
  if (!initStarted) return
  pendingIdentify = { id: profileId, props }
}
