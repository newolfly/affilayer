/**
 * Network activity — REAL counts from the production database.
 *
 * Pulled READ-ONLY from Supabase (pooler, direct SQL) on STATS_PULLED_AT.
 * These numbers are baked in at build time; they are not fetched live.
 *
 * APPLY RULE (see APPLY.md in the credibility package):
 *   Re-pull every count on the day this file is applied or the site is
 *   rebuilt, and update STATS_PULLED_AT with the new date. The pull
 *   script is ~/workspace/work/affi-stats-pull.py (read-only).
 *
 * HONESTY RULES baked into the labels:
 *   - "Clicks tracked" / "Conversions recorded" are ledger totals — the
 *     same rows the forensic audits reconcile. They include AffiLayer's
 *     own published end-to-end verification traffic from the audit
 *     programme (house + labelled test accounts). ACTIVITY_DISCLOSURE
 *     says so on the page, in print the same size as the claim's fine
 *     print everywhere else on the site. Never relabel these as
 *     customer earnings, sales, or revenue.
 *   - Registered accounts are deliberately NOT published here: the raw
 *     count (8 on 13 Nov 2026) is mostly operator/test accounts plus
 *     one pending organic signup, so any "members" figure would
 *     mislead. Revisit only when external accounts are the majority.
 *   - Countries = country pages live on the site (the sitemap build
 *     asserts exactly 195). Offers = offers in the PUBLIC catalogue
 *     (5). The LosPollos Dating Smartlink stays status 'active' in
 *     the DB for signed-in, approved affiliates, but it is not shown
 *     publicly, so it is not counted here.
 *     Guides = published posts in blog-data.ts (== RSS item count).
 */
export const STATS_PULLED_AT = '25 November 2026'

export interface NetworkStat {
  value: string
  label: string
  sub: string
  icon: 'compass' | 'tag' | 'file' | 'chart' | 'check'
}

export const NETWORK_STATS: NetworkStat[] = [
  { value: '195', label: 'Countries live', sub: 'a country page with local join terms for each', icon: 'compass' },
  { value: '5', label: 'Offers live', sub: 'in the public catalogue right now', icon: 'tag' },
  { value: '25', label: 'Guides published', sub: 'launch notes, guides and announcements', icon: 'file' },
  { value: '77', label: 'Clicks tracked', sub: 'written to the ledger since launch', icon: 'chart' },
  { value: '23', label: 'Conversions recorded', sub: 'each one a ledger row — never edited, never deleted', icon: 'check' },
]

/** Shown under the strip wherever it renders. Do not remove: it is what
 *  keeps the activity counters a transparency claim instead of a
 *  traction claim. */
export const ACTIVITY_DISCLOSURE =
  'Counters are the network\u2019s own ledger totals since launch on 7 November 2026 and include ' +
  'AffiLayer\u2019s published end-to-end verification traffic from its forensic audit programme. ' +
  'We publish them exactly as recorded — the same numbers our auditors reconcile.'
