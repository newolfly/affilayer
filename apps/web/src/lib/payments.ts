// NOWPayments client (web) — calls the tracking Worker (migration 010).
// The browser never holds the NOWPayments API key: every call goes to
// go.affilayer.com with the user's Supabase JWT, and the Worker enforces
// ownership / admin rights before touching NOWPayments or the database.
// In demo mode (no Supabase) every call fails closed with a plain error.
import { supabase, isSupabaseConfigured } from './supabase'
import { TRACKING_URL } from './tracking'

export interface WorkerResult {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

async function workerCall(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<WorkerResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Payments are not available in demo mode.' };
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: 'You are not signed in.' };
  let res: Response;
  try {
    res = await fetch(`${TRACKING_URL.replace(/\/$/, '')}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    return { error: 'Could not reach the payments service. Try again.' };
  }
  let data: WorkerResult = {};
  try {
    data = (await res.json()) as WorkerResult;
  } catch {
    data = {};
  }
  if (!res.ok) return { error: data.error ?? `Payments service returned ${res.status}.` };
  return data;
}

/** Create an advertiser deposit invoice. Returns the NOWPayments invoice URL. */
export async function createDeposit(amountUsd: number): Promise<WorkerResult> {
  return workerCall('/api/payments/deposits', {
    method: 'POST',
    body: { amount_usd: amountUsd },
  });
}

/** Admin: pay an approved payout request via NOWPayments. */
export async function executePayout(payoutRequestId: string): Promise<WorkerResult> {
  return workerCall('/api/payouts/execute', {
    method: 'POST',
    body: { payout_request_id: payoutRequestId },
  });
}

/** Admin: verify a payout batch with a pasted 2FA code. */
export async function verifyPayout(batchId: string, code: string): Promise<WorkerResult> {
  return workerCall(`/api/payouts/${encodeURIComponent(batchId)}/verify`, {
    method: 'POST',
    body: { code },
  });
}

/** Admin: re-fetch a payout batch status (settles the ledger on FINISHED). */
export async function refreshPayoutStatus(batchId: string): Promise<WorkerResult> {
  return workerCall(`/api/payouts/${encodeURIComponent(batchId)}/status`);
}

/** Admin: NOWPayments custody balances. */
export async function getCustodyBalance(): Promise<WorkerResult> {
  return workerCall('/api/payments/balance');
}

/** Validate a payout wallet address with NOWPayments (via the Worker). */
export async function validatePayoutAddress(
  address: string,
  currency: string,
): Promise<WorkerResult> {
  return workerCall('/api/payments/validate-address', {
    method: 'POST',
    body: { address, currency },
  });
}

/** Payout currencies the network pays out in (USDT TRC20 is the default). */
export const PAYOUT_CURRENCIES = ['usdttrc20'] as const;

/** Basic USDT TRC20 address shape check (T + 33 base58 chars).
 *  NOWPayments validate-address is the authority; this only catches typos. */
export function looksLikeTrc20(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());
}
