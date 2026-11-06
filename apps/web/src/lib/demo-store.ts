// Demo-mode store — the single source of truth when Supabase is NOT
// configured. All demo-mode writes (offer create, applications, payout
// requests, tickets, admin actions) go through here, are persisted to
// localStorage, and are recorded in the audit log. Nothing leaves the
// browser; every page labels this data as demo data.
//
// In Supabase mode this store is unused except for the audit log of
// local demo actions — real data comes from the database instead.
import { useSyncExternalStore } from 'react'
import type {
  Campaign,
  Click,
  Conversion,
  Offer,
  PayoutRequest,
  Profile,
  SupportTicket,
} from '@affilayer/shared'
import {
  demoCampaigns,
  demoClicks,
  demoConversions,
  demoOffers,
  demoPayouts,
  demoProfiles,
  demoTickets,
} from './demo-data'

export interface OfferApplication {
  id: string
  offerId: string
  affiliateCode: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface PostbackConfig {
  id: string
  affiliateCode: string
  url: string
  createdAt: string
}

export interface AuditEntry {
  id: string
  timestamp: string
  actor: string
  action: string
  entityType: string
  entityId: string
  detail: string
}

export interface NetworkSettings {
  networkName: string
  supportEmail: string
  defaultCurrency: string
  minPayout: number
  payoutDay: number
  payoutSchedule: string
  requireApproval: boolean
}

export const DEFAULT_SETTINGS: NetworkSettings = {
  networkName: 'AffiLayer',
  supportEmail: 'support@affilayer.com',
  defaultCurrency: 'USD',
  minPayout: 50,
  payoutDay: 15,
  payoutSchedule: 'Monthly, on approved balance',
  requireApproval: true,
}

export interface DemoState {
  profiles: Profile[]
  offers: Offer[]
  campaigns: Campaign[]
  clicks: Click[]
  conversions: Conversion[]
  payouts: PayoutRequest[]
  tickets: SupportTicket[]
  applications: OfferApplication[]
  postbacks: PostbackConfig[]
  auditLog: AuditEntry[]
  settings: NetworkSettings
}

const STORAGE_KEY = 'affilayer-demo-v1'

function seed(): DemoState {
  return {
    profiles: demoProfiles.map((p) => ({ ...p })),
    offers: demoOffers.map((o) => ({ ...o })),
    campaigns: demoCampaigns.map((c) => ({ ...c })),
    clicks: demoClicks.map((c) => ({ ...c })),
    conversions: demoConversions.map((c) => ({ ...c })),
    payouts: demoPayouts.map((p) => ({ ...p })),
    tickets: demoTickets.map((t) => ({ ...t })),
    applications: [],
    postbacks: [],
    auditLog: [
      {
        id: 'audit-seed',
        timestamp: new Date().toISOString(),
        actor: 'system',
        action: 'demo.seed',
        entityType: 'demo',
        entityId: 'seed',
        detail: 'Demo data loaded (sample data, not real).',
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
  }
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as Partial<DemoState>
    const base = seed()
    return { ...base, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } }
  } catch {
    return seed()
  }
}

let state: DemoState = load()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage full or unavailable — keep in-memory state */
  }
  // Replace the snapshot so useSyncExternalStore sees a changed reference
  // and re-renders subscribers. (Mutations above happen in place; without
  // this, React would bail out and admin actions would not update the UI.)
  state = { ...state }
  listeners.forEach((l) => l())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot(): DemoState {
  return state
}

/** Apply a mutation to the demo state and persist it. */
export function updateDemo(mutator: (s: DemoState) => void): void {
  mutator(state)
  emit()
}

/** Record an admin/demo action in the audit log. */
export function logAudit(
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
): void {
  updateDemo((s) => {
    s.auditLog.unshift({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      entityType,
      entityId,
      detail,
    })
  })
}

/** React hook: re-renders when demo state changes. */
export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Synchronous read (for the data layer). */
export function getDemoState(): DemoState {
  return state
}

/** Wipe local demo changes and re-seed from the built-in sample data. */
export function resetDemo(): void {
  state = seed()
  emit()
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
