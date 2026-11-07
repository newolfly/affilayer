// DEMO DATA ONLY — explicitly fake/sample data for running the UI without a
// backend. Every app page shows a "Demo data — not real" banner when this is
// in use. Never present these numbers as real-world results.
import type { Campaign, Click, Conversion, Offer, PayoutRequest, Profile, SupportTicket } from './types'

export const DEMO_AFFILIATE_CODE = 'AFF-DEMO-001'

export const demoProfiles: Profile[] = [
  { id: 'demo-aff-1', email: 'affiliate@demo.affilayer', role: 'affiliate', fullName: 'Demo Affiliate', status: 'approved', affiliateCode: DEMO_AFFILIATE_CODE, trafficSource: 'Content / SEO', vertical: 'Finance', geo: 'US, GB', volume: '1,000–5,000 clicks/mo', paymentMethod: 'Bank transfer' },
  { id: 'demo-adv-1', email: 'advertiser@demo.affilayer', role: 'advertiser', fullName: 'Demo Advertiser', status: 'approved', company: 'Demo Retail Co' },
  { id: 'demo-admin-1', email: 'admin@demo.affilayer', role: 'super_admin', fullName: 'Demo Admin', status: 'approved' },
  { id: 'demo-pend-1', email: 'pending@demo.affilayer', role: 'affiliate', fullName: 'Pending Applicant', status: 'pending', affiliateCode: 'AFF-DEMO-002' },
]

export const demoOffers: Offer[] = [
  { id: 'demo-offer-1', name: 'Demo Finance — Credit Card Signup', description: 'Approved credit-card application. Traffic from content and search only; no incentivised traffic.', vertical: 'Finance', countries: ['US', 'GB'], devices: ['desktop', 'mobile'], trafficSources: ['SEO', 'Content', 'Email'], conversionType: 'Signup', payoutModel: 'CPA', payout: 45, currency: 'USD', capDaily: 100, capTotal: 3000, landingUrl: 'https://example.com/finance-card', creatives: ['https://example.com/banners/300x250.png'], approvalRequired: true, status: 'active' },
  { id: 'demo-offer-2', name: 'Demo E-commerce — First Order', description: 'First completed order over $25 on a demo retail store.', vertical: 'E-commerce', countries: ['US', 'CA', 'GB'], devices: ['desktop', 'mobile', 'tablet'], trafficSources: ['SEO', 'Social', 'PPC'], conversionType: 'Purchase', payoutModel: 'CPS', payout: 12, rateBps: 1000, currency: 'USD', capDaily: 500, capTotal: null, landingUrl: 'https://example.com/shop', creatives: [], approvalRequired: false, status: 'active' },
  { id: 'demo-offer-3', name: 'Demo SaaS — Free Trial Signup', description: 'Trial account created with a verified work email.', vertical: 'SaaS', countries: ['US', 'DE', 'FR'], devices: ['desktop'], trafficSources: ['Content', 'Email'], conversionType: 'Lead', payoutModel: 'CPL', payout: 8.5, currency: 'USD', capDaily: 200, capTotal: null, landingUrl: 'https://example.com/saas-trial', creatives: [], approvalRequired: true, status: 'paused' },
]

export const demoCampaigns: Campaign[] = [
  { id: 'demo-camp-1', advertiserId: 'demo-adv-1', name: 'Demo Finance Q4', description: 'Credit-card signup campaign', status: 'active', budget: 5000, currency: 'USD', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'demo-camp-2', advertiserId: 'demo-adv-1', name: 'Demo Retail Launch', description: 'First-order campaign', status: 'active', budget: 3000, currency: 'USD', createdAt: '2026-10-15T00:00:00Z' },
]

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

export const demoClicks: Click[] = Array.from({ length: 28 }, (_, i) => ({
  id: `demo-click-${i + 1}`,
  clickId: `clk_demo${String(i + 1).padStart(4, '0')}`,
  offerId: demoOffers[i % 3].id,
  affiliateCode: DEMO_AFFILIATE_CODE,
  country: ['US', 'GB', 'CA', 'DE'][i % 4],
  device: ['desktop', 'mobile', 'mobile', 'tablet'][i % 4],
  source: ['SEO', 'Social', 'Email', 'PPC'][i % 4],
  sub1: `sub-${(i % 5) + 1}`,
  createdAt: daysAgo(Math.floor(i / 4)),
}))

export const demoConversions: Conversion[] = [
  { id: 'demo-conv-1', idempotencyKey: 'demo-key-1', clickId: 'clk_demo0001', offerId: 'demo-offer-1', affiliateCode: DEMO_AFFILIATE_CODE, payout: 45, currency: 'USD', status: 'approved', sub1: 'sub-1', createdAt: daysAgo(1) },
  { id: 'demo-conv-2', idempotencyKey: 'demo-key-2', clickId: 'clk_demo0002', offerId: 'demo-offer-2', affiliateCode: DEMO_AFFILIATE_CODE, payout: 12, currency: 'USD', status: 'approved', sub1: 'sub-2', createdAt: daysAgo(2) },
  { id: 'demo-conv-3', idempotencyKey: 'demo-key-3', clickId: 'clk_demo0005', offerId: 'demo-offer-1', affiliateCode: DEMO_AFFILIATE_CODE, payout: 45, currency: 'USD', status: 'pending', sub1: 'sub-1', createdAt: daysAgo(0) },
  { id: 'demo-conv-4', idempotencyKey: 'demo-key-4', clickId: 'clk_demo0008', offerId: 'demo-offer-3', affiliateCode: DEMO_AFFILIATE_CODE, payout: 8.5, currency: 'USD', status: 'rejected', sub1: 'sub-3', createdAt: daysAgo(3) },
  { id: 'demo-conv-5', idempotencyKey: 'demo-key-5', clickId: 'clk_demo0011', offerId: 'demo-offer-2', affiliateCode: DEMO_AFFILIATE_CODE, payout: 12, currency: 'USD', status: 'approved', sub1: 'sub-2', createdAt: daysAgo(4) },
]

export const demoPayouts: PayoutRequest[] = [
  { id: 'demo-pay-1', affiliateCode: DEMO_AFFILIATE_CODE, amount: 102, currency: 'USD', method: 'Bank transfer', status: 'paid', createdAt: daysAgo(10) },
  { id: 'demo-pay-2', affiliateCode: DEMO_AFFILIATE_CODE, amount: 57, currency: 'USD', method: 'Bank transfer', status: 'requested', createdAt: daysAgo(1) },
]

export const demoTickets: SupportTicket[] = [
  { id: 'demo-ticket-1', subject: 'Demo: tracking link question', message: 'How do sub-parameters work on my tracking links?', status: 'open', createdAt: daysAgo(1) },
  { id: 'demo-ticket-2', subject: 'Demo: payout schedule', message: 'When are payouts processed each month?', status: 'closed', createdAt: daysAgo(6) },
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
