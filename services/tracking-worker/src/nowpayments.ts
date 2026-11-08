/**
 * NOWPayments client — AffiLayer all-rounder (migration 010).
 *
 * Two directions on one connection:
 *  - Inbound:  advertiser deposits via hosted invoices (POST /v1/invoice).
 *  - Outbound: affiliate payouts via mass payouts (POST /v1/payout).
 *
 * Verification rule (see docs in ~/workspace/work/affilayer-nowpayments-brief.md):
 * IPN bodies are NEVER trusted — the account IPN secret is shared with
 * InboxNumber. Every IPN is treated as a wake-up call; the Worker re-fetches
 * the payment/payout status from the NOWPayments API with the API key and
 * only that response drives DB writes.
 *
 * Payout auth: payouts need a Bearer JWT from POST /v1/auth (dashboard
 * email + password, valid 5 minutes) in addition to the x-api-key header.
 * Payout 2FA: created payouts must be verified within 1 hour or they are
 * auto-rejected. If NOWPAYMENTS_TOTP_SECRET is set, the Worker generates
 * the RFC 6238 code and verifies immediately; otherwise the payout waits
 * for a manual verification (dashboard, or the admin UI code entry).
 *
 * No network calls happen at import time. The client takes an injectable
 * fetch (tests pass a mock) and reads no process env — the Worker passes
 * its env in.
 */

export const NP_PROD_BASE = 'https://api.nowpayments.io/v1';
export const NP_SANDBOX_BASE = 'https://api-sandbox.nowpayments.io/v1';

/** Default payout currency: USDT on TRON (stablecoin, lowest-fee rail). */
export const DEFAULT_PAYOUT_CURRENCY = 'usdttrc20';

/** Minimum advertiser deposit, USD (NOWPayments per-coin minimums are ~$10). */
export const MIN_DEPOSIT_USD = 10;

/** Sanity cap on a single deposit, USD. */
export const MAX_DEPOSIT_USD = 100000;

/** IPN callback for AffiLayer — per-payment / per-payout, never the
 *  account-level webhook (that belongs to InboxNumber). */
export const NP_IPN_CALLBACK_URL = 'https://go.affilayer.com/api/ipn/nowpayments';

export interface NpConfig {
  /** 'production' | 'sandbox'. Unset = payments module disabled. */
  env?: string;
  apiKey?: string;
  /** Dashboard login — only used to mint the 5-minute payout JWT. */
  email?: string;
  password?: string;
  /** Optional app-based 2FA seed (Base32) for automatic payout verify. */
  totpSecret?: string;
  /** Worker proof secret, shared with the DB (worker_secrets.np_ipn_proof). */
  workerProof?: string;
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export class NpError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'NpError';
  }
}

export interface NpInvoice {
  id: string;
  invoice_url: string;
  payment_id?: string;
  order_id?: string;
}

export interface NpPayment {
  payment_id: string | number;
  payment_status: string;
  pay_address?: string;
  price_amount?: number;
  price_currency?: string;
  pay_amount?: number;
  pay_currency?: string;
  actually_paid?: number;
  order_id?: string;
  order_description?: string;
  purchase_id?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NpPayoutWithdrawal {
  id?: string;
  address: string;
  currency: string;
  amount: number;
  status?: string;
}

export interface NpPayoutBatch {
  id: string | number;
  status?: string;
  withdrawals?: NpPayoutWithdrawal[];
}

export interface NpBalance {
  [currency: string]: { amount: number; pendingAmount?: number };
}

/** NOWPayments payment statuses that are terminal (no further IPN coming). */
export const NP_TERMINAL_PAYMENT_STATUSES = new Set([
  'finished',
  'failed',
  'expired',
  'refunded',
  'partially_paid',
]);

/** NOWPayments payout batch statuses. */
export const NP_PAYOUT_STATUSES = new Set([
  'NEW',
  'CREATING',
  'WAITING',
  'PROCESSING',
  'FINISHED',
  'REJECTED',
  'REJECTED_NOT_CHECKED',
]);

// ---------------------------------------------------------------------------
// TOTP (RFC 6238, SHA-1, 30s step) — pure WebCrypto, no dependencies.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('base32: invalid character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Generate the 6-digit TOTP for `secret` (Base32) at `nowMs`. */
export async function totp(secret: string, nowMs = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const counter = Math.floor(nowMs / 1000 / 30);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 0x100000000));
  msg.setUint32(4, counter >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

/** hex(HMAC-SHA256(subject, secret)) — the worker proof for 010 RPCs. */
export async function workerProof(subject: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(subject));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// IPN parsing — the body is UNTRUSTED input; this only extracts identifiers.
// The caller must re-fetch the status from the API before acting on it.
// ---------------------------------------------------------------------------

export type NpIpnKind = 'payment' | 'payout' | 'unknown';

export interface NpIpnParsed {
  kind: NpIpnKind;
  /** NOWPayments payment id (payment IPNs). */
  paymentId?: string;
  /** NOWPayments payout batch id (payout IPNs). */
  batchId?: string;
  /** order_id the merchant set at creation (payment IPNs). */
  orderId?: string;
  /** Claimed status from the body — never trusted, for logging only. */
  claimedStatus?: string;
}

export function parseIpn(body: unknown): NpIpnParsed {
  if (!body || typeof body !== 'object') return { kind: 'unknown' };
  const b = body as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v !== '' ? v : undefined;

  // Payout IPN: carries a batch withdrawal id and/or a withdrawals array.
  const firstWithdrawal = (Array.isArray(b.withdrawals) ? b.withdrawals[0] : undefined) as
    | Record<string, unknown>
    | undefined;
  const batchId =
    str(b.batch_withdrawal_id) ??
    str(b.batch_id) ??
    str(b.payout_id) ??
    str(firstWithdrawal?.batch_id) ??
    str(firstWithdrawal?.batch_withdrawal_id);
  if (batchId || Array.isArray(b.withdrawals)) {
    return {
      kind: 'payout',
      batchId,
      claimedStatus: str(b.status) ?? str(b.payout_status),
    };
  }

  // Payment IPN: payment_id + payment_status (+ order_id we set).
  const paymentId = b.payment_id !== undefined ? String(b.payment_id) : undefined;
  if (paymentId) {
    return {
      kind: 'payment',
      paymentId,
      orderId: str(b.order_id),
      claimedStatus: str(b.payment_status),
    };
  }

  return { kind: 'unknown' };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class NowPaymentsClient {
  private jwt: string | null = null;
  private jwtExpiresAt = 0;

  constructor(private cfg: NpConfig) {}

  get baseUrl(): string {
    return this.cfg.env === 'sandbox' ? NP_SANDBOX_BASE : NP_PROD_BASE;
  }

  get enabled(): boolean {
    return !!this.cfg.env && !!this.cfg.apiKey;
  }

  get hasTotp(): boolean {
    return !!this.cfg.totpSecret;
  }

  private fetchFn(): typeof fetch {
    return this.cfg.fetchFn ?? fetch;
  }

  private async req<T>(
    method: string,
    path: string,
    opts: { body?: unknown; jwt?: boolean } = {},
  ): Promise<T> {
    if (!this.cfg.apiKey) throw new NpError('NOWPayments API key not configured', 500);
    const headers: Record<string, string> = {
      'x-api-key': this.cfg.apiKey,
      'Content-Type': 'application/json',
    };
    if (opts.jwt) headers.Authorization = `Bearer ${await this.getJwt()}`;
    const res = await this.fetchFn()(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text().catch(() => '');
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        (data as Record<string, unknown> | null)?.message ??
        (typeof data === 'string' ? data : undefined) ??
        `NOWPayments ${method} ${path} failed: ${res.status}`;
      throw new NpError(String(msg), res.status, data);
    }
    return data as T;
  }

  /** Mint (and cache) the 5-minute payout JWT. */
  async getJwt(): Promise<string> {
    if (this.jwt && Date.now() < this.jwtExpiresAt) return this.jwt;
    if (!this.cfg.email || !this.cfg.password) {
      throw new NpError('NOWPayments dashboard login not configured (needed for payouts)', 500);
    }
    const res = await this.req<{ token: string }>('POST', '/auth', {
      body: { email: this.cfg.email, password: this.cfg.password },
    });
    if (!res.token) throw new NpError('NOWPayments /auth returned no token', 502);
    this.jwt = res.token;
    // Token lives 5 minutes; refresh a minute early.
    this.jwtExpiresAt = Date.now() + 4 * 60_000;
    return this.jwt;
  }

  async getStatus(): Promise<unknown> {
    return this.req('GET', '/status');
  }

  /** Create a hosted invoice for an advertiser deposit (USD price). */
  async createInvoice(opts: {
    amountUsd: number;
    orderId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<NpInvoice> {
    return this.req<NpInvoice>('POST', '/invoice', {
      body: {
        price_amount: opts.amountUsd,
        price_currency: 'usd',
        order_id: opts.orderId,
        order_description: 'AffiLayer advertiser deposit',
        ipn_callback_url: NP_IPN_CALLBACK_URL,
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
      },
    });
  }

  /** Re-fetch a payment from the API — the only trusted status source. */
  async getPayment(paymentId: string | number): Promise<NpPayment> {
    return this.req<NpPayment>('GET', `/payment/${encodeURIComponent(String(paymentId))}`);
  }

  async getBalance(): Promise<NpBalance> {
    return this.req<NpBalance>('GET', '/balance');
  }

  async validateAddress(address: string, currency: string): Promise<unknown> {
    return this.req('POST', '/payout/validate-address', {
      body: { address, currency },
    });
  }

  async estimatePayoutFee(currency: string, amount: number): Promise<unknown> {
    return this.req(
      'GET',
      `/payout/fee?currency=${encodeURIComponent(currency)}&amount=${encodeURIComponent(String(amount))}`,
    );
  }

  /** Create a payout batch (one withdrawal). Returns the batch. */
  async createPayout(opts: {
    address: string;
    currency: string;
    amount: number;
  }): Promise<NpPayoutBatch> {
    return this.req<NpPayoutBatch>('POST', '/payout', {
      jwt: true,
      body: {
        withdrawals: [
          { address: opts.address, currency: opts.currency, amount: opts.amount },
        ],
        ipn_callback_url: NP_IPN_CALLBACK_URL,
      },
    });
  }

  /** Verify a payout batch with a 2FA code (TOTP or pasted code). */
  async verifyPayout(batchId: string | number, code: string): Promise<unknown> {
    return this.req(
      'POST',
      `/payout/${encodeURIComponent(String(batchId))}/verify`,
      { jwt: true, body: { verification_code: code } },
    );
  }

  /** Re-fetch a payout batch from the API — the only trusted status source. */
  async getPayout(batchId: string | number): Promise<NpPayoutBatch> {
    return this.req<NpPayoutBatch>('GET', `/payout/${encodeURIComponent(String(batchId))}`, {
      jwt: true,
    });
  }

  /** Generate the current TOTP code (auto-verify path). */
  async totpNow(): Promise<string> {
    if (!this.cfg.totpSecret) throw new NpError('TOTP secret not configured', 500);
    return totp(this.cfg.totpSecret);
  }

  /** Compute the worker proof for a 010 RPC subject. */
  async proof(subject: string): Promise<string> {
    if (!this.cfg.workerProof) throw new NpError('Worker proof secret not configured', 500);
    return workerProof(subject, this.cfg.workerProof);
  }
}
