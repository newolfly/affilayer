// DEMO DATA ONLY — explicitly fake/sample data for running the UI without a
// backend. Every app page shows a "Demo data — not real" banner when this is
// in use. Never present these numbers as real-world results.
import type { Campaign, Click, Conversion, Offer, PayoutRequest, Profile, SupportTicket } from './types'

export const DEMO_AFFILIATE_CODE = 'AFF-DEMO-001'

export const demoProfiles: Profile[] = [
  { id: 'demo-aff-1', email: 'affiliate@demo.affilayer', role: 'affiliate', full_name: 'Demo Affiliate', status: 'approved', affiliate_code: DEMO_AFFILIATE_CODE, traffic_source: 'Content / SEO', vertical: 'Finance', geo: 'US, GB', volume: '1,000–5,000 clicks/mo', payment_method: 'Bank transfer' },
  { id: 'demo-adv-1', email: 'advertiser@demo.affilayer', role: 'advertiser', full_name: 'Demo Advertiser', status: 'approved', company: 'Demo Retail Co' },
  { id: 'demo-admin-1', email: 'admin@demo.affilayer', role: 'super_admin', full_name: 'Demo Admin', status: 'approved' },
  { id: 'demo-pend-1', email: 'pending@demo.affilayer', role: 'affiliate', full_name: 'Pending Applicant', status: 'pending', affiliate_code: 'AFF-DEMO-002' },
]

export const demoOffers: Offer[] = [
  { id: 'demo-offer-1', name: 'Demo Finance — Credit Card Signup', description: 'Approved credit-card application. Traffic from content and search only; no incentivised traffic.', vertical: 'Finance', countries: ['US', 'GB'], devices: ['desktop', 'mobile'], traffic_sources: ['SEO', 'Content', 'Email'], conversion_type: 'Signup', payout_model: 'CPA', payout: 45, currency: 'USD', cap_daily: 100, cap_total: 3000, landing_url: 'https://example.com/finance-card', creatives: ['https://example.com/banners/300x250.png'], approval_required: true, status: 'active' },
  { id: 'demo-offer-2', name: 'Demo E-commerce — First Order', description: 'First completed order over $25 on a demo retail store.', vertical: 'E-commerce', countries: ['US', 'CA', 'GB'], devices: ['desktop', 'mobile', 'tablet'], traffic_sources: ['SEO', 'Social', 'PPC'], conversion_type: 'Purchase', payout_model: 'CPS', payout: 12, currency: 'USD', cap_daily: 500, cap_total: null, landing_url: 'https://example.com/shop', creatives: [], approval_required: false, status: 'active' },
  { id: 'demo-offer-3', name: 'Demo SaaS — Free Trial Signup', description: 'Trial account created with a verified work email.', vertical: 'SaaS', countries: ['US', 'DE', 'FR'], devices: ['desktop'], traffic_sources: ['Content', 'Email'], conversion_type: 'Lead', payout_model: 'CPL', payout: 8.5, currency: 'USD', cap_daily: 200, cap_total: null, landing_url: 'https://example.com/saas-trial', creatives: [], approval_required: true, status: 'paused' },
]

export const demoCampaigns: Campaign[] = [
  { id: 'demo-camp-1', name: 'Demo Finance Q4', description: 'Credit-card signup campaign', status: 'active', budget: 5000, currency: 'USD', created_at: '2026-10-01T00:00:00Z' },
  { id: 'demo-camp-2', name: 'Demo Retail Launch', description: 'First-order campaign', status: 'active', budget: 3000, currency: 'USD', created_at: '2026-10-15T00:00:00Z' },
]

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

export const demoClicks: Click[] = Array.from({ length: 28 }, (_, i) => ({
  id: `demo-click-${i + 1}`,
  click_id: `clk_demo${String(i + 1).padStart(4, '0')}`,
  offer_id: demoOffers[i % 3].id,
  affiliate_code: DEMO_AFFILIATE_CODE,
  country: ['US', 'GB', 'CA', 'DE'][i % 4],
  device: ['desktop', 'mobile', 'mobile', 'tablet'][i % 4],
  source: ['SEO', 'Social', 'Email', 'PPC'][i % 4],
  sub1: `sub-${(i % 5) + 1}`,
  created_at: daysAgo(Math.floor(i / 4)),
}))

export const demoConversions: Conversion[] = [
  { id: 'demo-conv-1', click_id: 'clk_demo0001', offer_id: 'demo-offer-1', affiliate_code: DEMO_AFFILIATE_CODE, payout: 45, currency: 'USD', status: 'approved', sub1: 'sub-1', created_at: daysAgo(1) },
  { id: 'demo-conv-2', click_id: 'clk_demo0002', offer_id: 'demo-offer-2', affiliate_code: DEMO_AFFILIATE_CODE, payout: 12, currency: 'USD', status: 'approved', sub1: 'sub-2', created_at: daysAgo(2) },
  { id: 'demo-conv-3', click_id: 'clk_demo0005', offer_id: 'demo-offer-1', affiliate_code: DEMO_AFFILIATE_CODE, payout: 45, currency: 'USD', status: 'pending', sub1: 'sub-1', created_at: daysAgo(0) },
  { id: 'demo-conv-4', click_id: 'clk_demo0008', offer_id: 'demo-offer-3', affiliate_code: DEMO_AFFILIATE_CODE, payout: 8.5, currency: 'USD', status: 'rejected', sub1: 'sub-3', created_at: daysAgo(3) },
  { id: 'demo-conv-5', click_id: 'clk_demo0011', offer_id: 'demo-offer-2', affiliate_code: DEMO_AFFILIATE_CODE, payout: 12, currency: 'USD', status: 'approved', sub1: 'sub-2', created_at: daysAgo(4) },
]

export const demoPayouts: PayoutRequest[] = [
  { id: 'demo-pay-1', affiliate_code: DEMO_AFFILIATE_CODE, amount: 102, currency: 'USD', method: 'Bank transfer', status: 'paid', created_at: daysAgo(10) },
  { id: 'demo-pay-2', affiliate_code: DEMO_AFFILIATE_CODE, amount: 57, currency: 'USD', method: 'Bank transfer', status: 'pending', created_at: daysAgo(1) },
]

export const demoTickets: SupportTicket[] = [
  { id: 'demo-ticket-1', subject: 'Demo: tracking link question', message: 'How do sub-parameters work on my tracking links?', status: 'open', created_at: daysAgo(1) },
  { id: 'demo-ticket-2', subject: 'Demo: payout schedule', message: 'When are payouts processed each month?', status: 'closed', created_at: daysAgo(6) },
]

/** Daily series for charts (demo only). */
export const demoDailySeries = [
  { label: 'Mon', clicks: 42, conversions: 3 },
  { label: 'Tue', clicks: 58, conversions: 4 },
  { label: 'Wed', clicks: 51, conversions: 2 },
  { label: 'Thu', clicks: 73, conversions: 5 },
  { label: 'Fri', clicks: 66, conversions: 4 },
  { label: 'Sat', clicks: 39, conversions: 2 },
  { label: 'Sun', clicks: 47, conversions: 3 },
]
