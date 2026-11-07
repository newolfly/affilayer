/**
 * Postback helpers for the Worker: HMAC-SHA256 via WebCrypto
 * (node:crypto is not available in Workers) and delivery with retries.
 * Ported from services/tracking/src/postbacks.ts — same semantics:
 * signature `x-affilayer-signature` is HMAC-SHA256 hex over the raw
 * body, optional `sha256=` prefix accepted. Delivery never throws.
 */
import { expandPostbackMacros } from '@affilayer/shared';
import type { PostbackConfig, PostbackEvent, Store } from './store.js';

const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

export async function computeSignature(secret: string, rawBody: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison over the two hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(
  secret: string,
  rawBody: string,
  signature: string | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const given = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  const expected = await computeSignature(secret, rawBody);
  return timingSafeEqualHex(given.toLowerCase(), expected);
}

export interface DeliverOptions {
  fetchFn?: typeof fetch;
  /** Total attempts per postback: 1 initial + up to 3 retries = 4 by default. */
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Deliver configured postbacks for one conversion. Each config URL is
 * macro-expanded, fetched with GET, retried up to 3 times with
 * exponential backoff on network error or non-2xx. When the config has
 * a secret, the request carries x-affilayer-signature: sha256=<HMAC of
 * the expanded URL>. One postback_event is recorded per config.
 * Returns the recorded events.
 */
export async function deliverPostbacks(
  store: Store,
  configs: PostbackConfig[],
  vars: Record<string, string>,
  opts: DeliverOptions = {},
): Promise<PostbackEvent[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 4; // 1 + 3 retries
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const sleep = opts.sleep ?? defaultSleep;
  const events: PostbackEvent[] = [];

  for (const config of configs) {
    const url = expandPostbackMacros(config.url, vars);
    // Sign the expanded URL when the config has a secret, so the
    // receiver can verify the postback really came from AffiLayer.
    const headers: Record<string, string> = {};
    if (config.secret) {
      headers['x-affilayer-signature'] = `sha256=${await computeSignature(config.secret, url)}`;
    }
    let attempts = 0;
    let delivered = false;
    let statusCode: number | undefined;
    let lastError: string | undefined;

    while (attempts < maxAttempts && !delivered) {
      attempts++;
      try {
        const res = await fetchFn(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
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
      id: crypto.randomUUID(),
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
