// Public demo login — DEMO MODE ONLY.
//
// Two public usernames that sign a visitor into the localStorage demo store
// (affilayer-demo-v1) as a demo profile. No Supabase auth is ever called for
// these, no real account is created, and no real session exists. The
// credentials are published openly on the login page, so the password is
// not a secret — it is a gate that keeps casual form submissions out while
// letting anyone try the product.
//
// This module is pure (no I/O) so it is unit-tested in test/demo-login.test.ts.
// The web app enforces the demo-mode-only rule in lib/auth.tsx: when
// Supabase is configured, demo credentials are refused before this module
// is even consulted.
import type { Role } from './index'

/** The one public demo password, shown openly on the login page. */
export const DEMO_PASSWORD = '1234'

export interface DemoCredential {
  /** Lowercase username as typed by the visitor (matched case-insensitively). */
  username: string
  password: string
  /** Demo profile id in the web app's demo-data (demo-aff-1 / demo-adv-1). */
  profileId: string
  role: Role
}

export const DEMO_CREDENTIALS: DemoCredential[] = [
  { username: 'demo-publisher', password: DEMO_PASSWORD, profileId: 'demo-aff-1', role: 'affiliate' },
  { username: 'demo-advertiser', password: DEMO_PASSWORD, profileId: 'demo-adv-1', role: 'advertiser' },
]

/** True when the identifier is one of the public demo usernames. */
export function isDemoUsername(value: string): boolean {
  const id = value.trim().toLowerCase()
  return DEMO_CREDENTIALS.some((c) => c.username === id)
}

/**
 * Check a demo username + password pair.
 * Returns the demo profile to sign into, or a plain error that reveals
 * nothing beyond the failure itself.
 */
export function checkDemoCredentials(
  username: string,
  password: string,
): { profileId: string; role: Role } | { error: string } {
  const id = username.trim().toLowerCase()
  const cred = DEMO_CREDENTIALS.find((c) => c.username === id)
  if (!cred) return { error: 'Unknown demo username.' }
  if (password.trim() !== cred.password) return { error: 'Incorrect demo password.' }
  return { profileId: cred.profileId, role: cred.role }
}
