// Data layer — Supabase when configured, DEMO MODE otherwise (CONTRACT.md).
// In Supabase mode we only SELECT user-visible tables with the anon key;
// clicks / conversions / commission_ledger writes are service-role only
// (see 002_rls.sql) and never happen from this browser code.
import { supabase, isSupabaseConfigured } from './supabase'
import { demoCampaigns, demoClicks, demoConversions, demoOffers, demoPayouts, demoProfiles, demoTickets } from './demo-data'
import type { Campaign, Click, Conversion, Offer, PayoutRequest, Profile, Stats, SupportTicket } from './types'

export { isSupabaseConfigured }
export const isDemoMode = !isSupabaseConfigured

export interface ReportFilters {
  from?: string
  to?: string
  offerId?: string
  country?: string
  device?: string
  source?: string
  affiliateCode?: string
}

function inRange(iso: string, f: ReportFilters): boolean {
  if (f.from && iso.slice(0, 10) < f.from) return false
  if (f.to && iso.slice(0, 10) > f.to) return false
  return true
}

export async function getOffers(): Promise<Offer[]> {
  if (!isSupabaseConfigured || !supabase) return demoOffers
  const { data, error } = await supabase.from('offers').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data as Offer[]
}

export async function getOffer(id: string): Promise<Offer | undefined> {
  const offers = await getOffers()
  return offers.find((o) => o.id === id)
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (!isSupabaseConfigured || !supabase) return demoCampaigns
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data as Campaign[]
}

export async function getClicks(filters: ReportFilters = {}): Promise<Click[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demoClicks.filter(
      (c) =>
        inRange(c.created_at, filters) &&
        (!filters.offerId || c.offer_id === filters.offerId) &&
        (!filters.country || c.country === filters.country) &&
        (!filters.device || c.device === filters.device) &&
        (!filters.source || c.source === filters.source) &&
        (!filters.affiliateCode || c.affiliate_code === filters.affiliateCode),
    )
  }
  let q = supabase.from('clicks').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  if (filters.country) q = q.eq('country', filters.country)
  if (filters.device) q = q.eq('device', filters.device)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Click[]).filter((c) => inRange(c.created_at, filters))
}

export async function getConversions(filters: ReportFilters = {}): Promise<Conversion[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demoConversions.filter(
      (c) =>
        inRange(c.created_at, filters) &&
        (!filters.offerId || c.offer_id === filters.offerId) &&
        (!filters.affiliateCode || c.affiliate_code === filters.affiliateCode),
    )
  }
  let q = supabase.from('conversions').select('*').order('created_at', { ascending: false }).limit(500)
  if (filters.offerId) q = q.eq('offer_id', filters.offerId)
  const { data, error } = await q
  if (error || !data) return []
  return (data as Conversion[]).filter((c) => inRange(c.created_at, filters))
}

export async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return demoProfiles
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data as Profile[]
}

export async function getPayouts(): Promise<PayoutRequest[]> {
  if (!isSupabaseConfigured || !supabase) return demoPayouts
  const { data, error } = await supabase.from('payout_requests').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data as PayoutRequest[]
}

export async function getTickets(): Promise<SupportTicket[]> {
  if (!isSupabaseConfigured || !supabase) return demoTickets
  const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
  if (error || !data) return []
  return data as SupportTicket[]
}

export function computeStats(clicks: Click[], conversions: Conversion[]): Stats {
  const approved = conversions.filter((c) => c.status === 'approved')
  const revenue = approved.reduce((s, c) => s + c.payout, 0)
  return {
    clicks: clicks.length,
    unique_clicks: new Set(clicks.map((c) => c.click_id)).size,
    conversions: conversions.length,
    approved: approved.length,
    rejected: conversions.filter((c) => c.status === 'rejected').length,
    pending: conversions.filter((c) => c.status === 'pending').length,
    revenue,
    commission: revenue,
    epc: clicks.length ? revenue / clicks.length : 0,
    cr: clicks.length ? conversions.length / clicks.length : 0,
  }
}

/** Stats: prefer the tracking service /api/stats when reachable, else compute locally. */
export async function getStats(filters: ReportFilters = {}): Promise<Stats> {
  const clicks = await getClicks(filters)
  const conversions = await getConversions(filters)
  return computeStats(clicks, conversions)
}
