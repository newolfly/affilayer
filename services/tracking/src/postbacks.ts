/**
 * Postback helpers: HMAC-SHA256 signature verification and delivery
 * with retries + exponential backoff. Delivery records a postback_event
 * per configured postback (delivered or failed) — never throws.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { expandPostbackMacros } from '@affilayer/shared';
import type { PostbackConfig, Store } from './store.js';

export function computeSignature(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Verify `x-affilayer-signature` (HMAC-SHA256 hex over the raw body).
 * Accepts an optional `sha256=` prefix. Constant-time comparison.
 */
export function verifySignature(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const given = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  const expected = computeSignature(secret, rawBody);
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface DeliverOptions {
  /** Fetch implementation (defaults to global fetch). Tests inject a mock. */
  fetchFn?: typeof fetch;
  /** Total attempts per postback: 1 initial + up to 3 retries = 4 by default. */
  maxAttempts?: number;
  /** Base backoff in ms; delay for retry n is baseDelayMs * 2^(n-1). */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Deliver configured postbacks for one conversion. Each config URL is
 * macro-expanded (see expandPostbackMacros), fetched with GET, retried
 * up to 3 times with exponential backoff on network error or non-2xx.
 * One postback_event is recorded per config. Returns the recorded events.
 */
export async function deliverPostbacks(
  store: Store,
  configs: PostbackConfig[],
  vars: Record<string, string>,
  opts: DeliverOptions = {},
): Promise<import('./store.js').PostbackEvent[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 4; // 1 + 3 retries
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const sleep = opts.sleep ?? defaultSleep;
  const events: import('./store.js').PostbackEvent[] = [];

  for (const config of configs) {
    const url = expandPostbackMacros(config.url, vars);
    let attempts = 0;
    let delivered = false;
    let statusCode: number | undefined;
    let lastError: string | undefined;

    while (attempts < maxAttempts && !delivered) {
      attempts++;
      try {
        const res = await fetchFn(url, { method: 'GET' });
        statusCode = res.status;
        if (res.ok) {
          delivered = true;
        } else {
          lastError = `HTTP ${res.status}`;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (!delivered && attempts < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempts - 1));
      }
    }

    const event = await store.recordPostbackEvent({
      id: randomUUID(),
      conversionId: vars.conversion_id,
      configId: config.id,
      url,
      status: delivered ? 'delivered' : 'failed',
      statusCode,
      attempts,
      error: delivered ? undefined : lastError,
      createdAt: new Date().toISOString(),
    });
    events.push(event);
  }

  return events;
}
