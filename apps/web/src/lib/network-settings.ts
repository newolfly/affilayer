/** Live network constants. There is no settings table yet, so these are
 *  the network's published terms as constants — the same values the
 *  pricing page states publicly (free to join, $50 minimum payout,
 *  Net-30). If a settings table lands, read from there instead.
 *  (This replaces the old demo store's DEFAULT_SETTINGS — demo mode was
 *  removed entirely on 20 Nov 2026.) */
export const NETWORK_SETTINGS = {
  networkName: 'AffiLayer',
  supportEmail: 'support@affilayer.com',
  defaultCurrency: 'USD',
  minPayout: 50,
  payoutSchedule: 'Monthly, on approved balance (Net-30)',
  requireApproval: true,
} as const
