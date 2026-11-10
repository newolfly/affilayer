import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/auth'

// Cloudflare Web Analytics (Q8, 10 Nov 2026): the beacon loads only when a
// site token is configured at build time (VITE_CF_WEB_ANALYTICS_TOKEN).
// The token is public — it ships in page HTML — and is set in the Pages
// environment variables once the Web Analytics site exists in the
// Cloudflare dashboard (the OAuth token has no RUM scope, so the site
// cannot be created via API). No token, no beacon, no third-party request.
const analyticsToken = import.meta.env.VITE_CF_WEB_ANALYTICS_TOKEN as string | undefined
if (analyticsToken && typeof document !== 'undefined') {
  const beacon = document.createElement('script')
  beacon.defer = true
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: analyticsToken }))
  document.head.appendChild(beacon)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
