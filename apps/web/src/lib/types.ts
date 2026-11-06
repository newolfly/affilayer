// Local copies of the @affilayer/shared types, mirroring CONTRACT.md.
// The package.json also declares "@affilayer/shared": "*" as a workspace dep;
// these local types keep the web build passing while that package is still
// being written in parallel. Keep them in sync with CONTRACT.md.
export type Role = 'super_admin' | 'network_manager' | 'advertiser' | 'affiliate'
export type OfferStatus = 'active' | 'paused' | 'expired'
export type ConversionStatus = 'pending' | 'approved' | 'rejected' | 'reversed'
export type PayoutModel = 'CPA' | 'CPL' | 'CPS' | 'CPC'

export interface Offer {
  id: string
  advertiser_id?: string
  campaign_id?: string
  name: string
  description: string
  vertical: string
  countries: string[]
  devices: string[]
  traffic_sources: string[]
  conversion_type: string
  payout_model: PayoutModel
  payout: number
  currency: string
  cap_daily?: number | null
  cap_total?: number | null
  landing_url: string
  creatives?: string[]
  approval_required: boolean
  status: OfferStatus
  created_at?: string
}

export interface Campaign {
  id: string
  advertiser_id?: string
  name: string
  description?: string
  status: string
  budget?: number | null
  currency?: string
  created_at?: string
}

export interface Click {
  id: string
  click_id: string
  offer_id: string
  affiliate_code: string
  country?: string
  device?: string
  source?: string
  sub1?: string
  ip?: string
  user_agent?: string
  created_at: string
}

export interface Conversion {
  id: string
  click_id?: string
  offer_id: string
  affiliate_code?: string
  payout: number
  currency: string
  status: ConversionStatus
  sub1?: string
  created_at: string
}

export interface CommissionLedgerEntry {
  id: string
  conversion_id: string
  affiliate_code: string
  amount: number
  currency: string
  status: ConversionStatus
  created_at: string
}

export interface PayoutRequest {
  id: string
  affiliate_code: string
  amount: number
  currency: string
  method: string
  status: string
  created_at: string
}

export interface TrackingStep {
  click_id: string
  step: string
  created_at: string
}

export interface SmartLinkRule {
  id: string
  code: string
  offer_ids: string[]
}

export interface FraudSignal {
  type: string
  click_id?: string
  detail: string
}

export interface Profile {
  id: string
  email: string
  role: Role
  full_name?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  affiliate_code?: string
  traffic_source?: string
  vertical?: string
  geo?: string
  volume?: string
  payment_method?: string
  payment_details?: string
  company?: string
}

export interface SupportTicket {
  id: string
  user_id?: string
  subject: string
  message: string
  status: 'open' | 'in_progress' | 'closed'
  created_at: string
}

export interface Stats {
  clicks: number
  unique_clicks: number
  conversions: number
  approved: number
  rejected: number
  pending: number
  revenue: number
  commission: number
  epc: number
  cr: number
}

export const TRACKING_URL =
  (import.meta.env.VITE_TRACKING_URL as string | undefined) || 'http://localhost:3001'

export function trackingLink(affiliateCode: string, offerId: string, subs: Record<string, string> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(subs)) if (v) q.set(k, v)
  const qs = q.toString()
  return `${TRACKING_URL.replace(/\/$/, '')}/c/${encodeURIComponent(affiliateCode)}/${encodeURIComponent(offerId)}${qs ? `?${qs}` : ''}`
}
