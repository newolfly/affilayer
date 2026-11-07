// Tracking-service URL helpers (web-only: reads Vite env).
export const TRACKING_URL =
  (import.meta.env.VITE_TRACKING_URL as string | undefined) || 'http://localhost:3001'

export function trackingLink(affiliateCode: string, offerId: string, subs: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(subs)) if (v) q.set(k, v)
  const qs = q.toString()
  return `${TRACKING_URL.replace(/\/$/, '')}/c/${encodeURIComponent(affiliateCode)}/${encodeURIComponent(offerId)}${qs ? `?${qs}` : ''}`
}

export function smartLink(affiliateCode: string, code: string, subs: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  // The Worker route is /s/{smartlinkCode}; the affiliate rides along as a
  // query param (the Worker reads affiliate_code from the query string).
  q.set('affiliate_code', affiliateCode)
  for (const [k, v] of Object.entries(subs)) if (v) q.set(k, v)
  const qs = q.toString()
  return `${TRACKING_URL.replace(/\/$/, '')}/s/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`
}
