/**
 * SupabaseStore — durable Store backed by Postgres RPCs (migration 007).
 *
 * M-08 (P1-12): demo offers are NOT served here. When Supabase is
 * configured this is the production store, and the old hybrid behaviour
 * (demo offers merged into every list, demo clicks/conversions kept in
 * per-isolate memory) routed real traffic to example.com demo pages and
 * made SmartLink conversions 422 on a different isolate. Demo mode is
 * the InMemoryStore only (getStore picks it when SUPABASE_URL /
 * SUPABASE_ANON_KEY are unset) — the web app's demo mode depends on
 * that, and it refuses demo credentials whenever Supabase is configured,
 * so nothing legitimate needs demo offers from this store.
 *
 * Concretely: listOffers / listClicks / listConversions /
 * listLedgerEntries return durable rows only; getOffer / getClick /
 * getConversion / findConversion* return undefined for non-UUID ids;
 * recordClick / recordConversion / recordLedgerEntry throw for non-UUID
 * offer ids (unreachable via the handlers — getOffer 404s first — but
 * loud rather than silently recording into isolate memory).
 * Postback configs/events stay in-memory (delivery records, not
 * financial truth).
 *
 * Env (wrangler [vars], both public values — never secrets):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 */
import {
  type Click,
  type CommissionLedgerEntry,
  type Conversion,
  type Offer,
} from '@affilayer/shared';
import {
  InMemoryStore,
  type PostbackConfig,
  type PostbackEvent,
  type Store,
} from './store.js';
import { workerProof } from './nowpayments.js';

export interface SupabaseStoreOptions {
  url: string;
  anonKey: string;
  /**
   * NP_WORKER_PROOF (wrangler secret, shared with the DB
   * worker_secrets.np_ipn_proof). The 012 list RPCs and the 013
   * single-row RPCs (get_click, find_conversion, get_offer,
   * list_offers) require it: with a valid proof the Worker reads rows
   * as before; without it the calls raise insufficient_privilege.
   * Missing secret = loud failure (no silent partial stats) so a
   * misconfigured deploy is visible.
   */
  workerProofSecret?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Real offers have UUID ids; demo offers are `demo-offer-*`. */
export function isRealOfferId(id: string): boolean {
  return UUID_RE.test(id);
}

type Row = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
    ? (v as string[])
    : undefined;
}

function mapOffer(row: Row): Offer {
  return {
    id: String(row.id),
    name: str(row.name) ?? '',
    description: str(row.description),
    vertical: str(row.vertical),
    countries: strArr(row.countries),
    devices: strArr(row.devices),
    trafficSources: strArr(row.traffic_sources),
    conversionType: str(row.conversion_type),
    payoutModel: (str(row.payout_model) ?? 'CPA') as Offer['payoutModel'],
    payout: num(row.payout) ?? 0,
    rateBps: num(row.rate_bps),
    currency: str(row.currency) ?? 'USD',
    capDaily: num(row.daily_cap) ?? null,
    capTotal: num(row.monthly_cap) ?? null,
    landingUrl: str(row.landing_url) ?? '',
    approvalRequired: row.approval_required !== false,
    status: (str(row.status) ?? 'active') as Offer['status'],
    advertiserId: str(row.advertiser_id),
    campaignId: str(row.campaign_id),
  };
}

function mapClick(row: Row): Click {
  return {
    id: String(row.id),
    clickId: String(row.click_id),
    affiliateCode: str(row.affiliate_code) ?? '',
    offerId: str(row.offer_id) ?? '',
    sub1: str(row.sub1),
    sub2: str(row.sub2),
    sub3: str(row.sub3),
    sub4: str(row.sub4),
    sub5: str(row.sub5),
    source: str(row.source),
    referrer: str(row.referrer),
    ip: str(row.ip),
    userAgent: str(row.user_agent),
    country: str(row.country),
    device: str(row.device),
    smartlink: row.is_smartlink === true,
    createdAt: str(row.created_at) ?? new Date().toISOString(),
  };
}

function mapConversion(row: Row): Conversion {
  return {
    id: String(row.id),
    clickId: str(row.click_id) ?? '',
    offerId: str(row.offer_id) ?? '',
    affiliateCode: str(row.affiliate_code),
    payout: num(row.payout) ?? 0,
    currency: str(row.currency) ?? 'USD',
    status: (str(row.status) ?? 'pending') as Conversion['status'],
    idempotencyKey: str(row.idempotency_key) ?? '',
    sub1: str(row.sub1),
    createdAt: str(row.created_at) ?? new Date().toISOString(),
    updatedAt: str(row.updated_at),
  };
}

export class SupabaseStore implements Store {
  // In-memory only for postback configs/events (delivery records, not
  // financial truth). Demo offers/clicks/conversions/ledger rows are NOT
  // kept here (M-08) — see the header comment.
  private memory = new InMemoryStore();

  constructor(private opts: SupabaseStoreOptions) {}

  /**
   * Worker proof for the 012 list RPCs, the 013 single-row RPCs, and
   * the 014 write/resolve RPCs: hex(HMAC-SHA256(function name,
   * NP_WORKER_PROOF)). The subject is the function name so a proof
   * minted for one function cannot be replayed against another (or
   * against 010's deposit/batch subjects). Throws when the secret is
   * not configured — the calls must fail loudly, never silently
   * return partial (demo-only) data.
   */
  private async workerProofFor(
    fnName:
      | 'tracking_list_clicks'
      | 'tracking_list_conversions'
      | 'tracking_get_click'
      | 'tracking_find_conversion'
      | 'tracking_get_offer'
      | 'tracking_list_offers'
      | 'tracking_record_click'
      | 'tracking_record_conversion'
      | 'tracking_record_ledger_entry'
      | 'tracking_resolve_affiliate',
  ): Promise<string> {
    if (!this.opts.workerProofSecret) {
      throw new Error(`supabase ${fnName}: NP_WORKER_PROOF is not configured`);
    }
    return workerProof(fnName, this.opts.workerProofSecret);
  }

  /** Back-compat alias used by the list calls. */
  private async listProof(fnName: 'tracking_list_clicks' | 'tracking_list_conversions'): Promise<string> {
    return this.workerProofFor(fnName);
  }

  private async rpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.opts.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: this.opts.anonKey,
        Authorization: `Bearer ${this.opts.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`supabase rpc ${fn} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async getOffer(id: string): Promise<Offer | undefined> {
    // M-08: demo offers are not served when Supabase is configured —
    // a non-UUID id can only be a demo offer, and those live in the
    // InMemoryStore (demo mode) only.
    if (!isRealOfferId(id)) return undefined;
    const row = await this.rpc<Row | null>('tracking_get_offer', {
      p_offer_id: id,
      p_proof: await this.workerProofFor('tracking_get_offer'),
    });
    if (!row) return undefined;
    return mapOffer(row);
  }

  async listOffers(): Promise<Offer[]> {
    // M-08: durable rows only — no demo offers merged in.
    const rows = await this.rpc<Row[]>('tracking_list_offers', {
      p_limit: 100,
      p_proof: await this.workerProofFor('tracking_list_offers'),
    });
    return rows.map(mapOffer);
  }

  async recordClick(click: Click): Promise<Click> {
    // M-08: demo-offer clicks are not recorded when Supabase is
    // configured (unreachable via the handlers — getOffer 404s first).
    if (!isRealOfferId(click.offerId)) {
      throw new Error('supabase recordClick: demo offers are not served when Supabase is configured');
    }
    const res = await this.rpc<{ id: string; click_id: string; duplicate: boolean }>(
      'tracking_record_click',
      {
        p_click_id: click.clickId,
        p_affiliate_code: click.affiliateCode,
        p_offer_id: click.offerId,
        p_ip: click.ip ?? null,
        p_user_agent: click.userAgent ?? null,
        p_referrer: click.referrer ?? null,
        p_country: click.country ?? null,
        p_device: click.device ?? null,
        p_source: click.source ?? null,
        p_sub1: click.sub1 ?? null,
        p_sub2: click.sub2 ?? null,
        p_sub3: click.sub3 ?? null,
        p_sub4: click.sub4 ?? null,
        p_sub5: click.sub5 ?? null,
        p_is_smartlink: click.smartlink ?? false,
        p_proof: await this.workerProofFor('tracking_record_click'),
      },
    );
    return { ...click, id: res.id ?? click.id };
  }

  async getClick(clickId: string): Promise<Click | undefined> {
    const row = await this.rpc<Row | null>('tracking_get_click', {
      p_click_id: clickId,
      p_proof: await this.workerProofFor('tracking_get_click'),
    });
    if (!row) return undefined;
    return mapClick(row);
  }

  async listClicks(): Promise<Click[]> {
    const rows = await this.rpc<Row[]>('tracking_list_clicks', {
      p_from: null,
      p_to: null,
      p_offer_id: null,
      p_affiliate_code: null,
      p_limit: 1000,
      p_proof: await this.listProof('tracking_list_clicks'),
    });
    return rows.map(mapClick);
  }

  async recordConversion(conversion: Conversion): Promise<Conversion> {
    // M-08: demo conversions are not recorded when Supabase is
    // configured (unreachable via the handlers — getClick 422s first).
    if (!isRealOfferId(conversion.offerId)) {
      throw new Error('supabase recordConversion: demo offers are not served when Supabase is configured');
    }
    const res = await this.rpc<{ id: string; conversion_id: string; duplicate: boolean }>(
      'tracking_record_conversion',
      {
        p_conversion_id: conversion.id,
        p_click_id: conversion.clickId,
        p_offer_id: conversion.offerId,
        p_affiliate_code: conversion.affiliateCode ?? null,
        p_payout: conversion.payout,
        p_currency: conversion.currency,
        p_status: conversion.status,
        p_idempotency_key: conversion.idempotencyKey,
        p_sub1: conversion.sub1 ?? null,
        p_proof: await this.workerProofFor('tracking_record_conversion'),
      },
    );
    // The DB uuid is the conversion's canonical id from here on — the
    // ledger entry references it, so the handler must use this id.
    return { ...conversion, id: res.id ?? conversion.id };
  }

  async getConversion(id: string): Promise<Conversion | undefined> {
    const row = await this.rpc<Row | null>('tracking_find_conversion', {
      p_id: id,
      p_idempotency_key: null,
      p_click_id: null,
      p_offer_id: null,
      p_proof: await this.workerProofFor('tracking_find_conversion'),
    });
    if (!row) return undefined;
    return mapConversion(row);
  }

  async findConversionByIdempotencyKey(key: string): Promise<Conversion | undefined> {
    const row = await this.rpc<Row | null>('tracking_find_conversion', {
      p_id: null,
      p_idempotency_key: key,
      p_click_id: null,
      p_offer_id: null,
      p_proof: await this.workerProofFor('tracking_find_conversion'),
    });
    if (!row) return undefined;
    return mapConversion(row);
  }

  async findConversionByClickAndOffer(
    clickId: string,
    offerId: string,
  ): Promise<Conversion | undefined> {
    const row = await this.rpc<Row | null>('tracking_find_conversion', {
      p_id: null,
      p_idempotency_key: null,
      p_click_id: clickId,
      p_offer_id: offerId,
      p_proof: await this.workerProofFor('tracking_find_conversion'),
    });
    if (!row) return undefined;
    return mapConversion(row);
  }

  async listConversions(): Promise<Conversion[]> {
    const rows = await this.rpc<Row[]>('tracking_list_conversions', {
      p_from: null,
      p_to: null,
      p_offer_id: null,
      p_affiliate_code: null,
      p_limit: 1000,
      p_proof: await this.listProof('tracking_list_conversions'),
    });
    return rows.map(mapConversion);
  }

  async recordLedgerEntry(entry: CommissionLedgerEntry): Promise<CommissionLedgerEntry> {
    // M-08: demo ledger rows are not recorded when Supabase is
    // configured (unreachable via the handlers — see recordConversion).
    if (!isRealOfferId(entry.offerId)) {
      throw new Error('supabase recordLedgerEntry: demo offers are not served when Supabase is configured');
    }
    // The conversionId here is the DB uuid (recordConversion returns it).
    const affiliate = await this.rpc<{ profile_id: string } | null>(
      'tracking_resolve_affiliate',
      {
        p_affiliate_code: entry.affiliateCode,
        p_proof: await this.workerProofFor('tracking_resolve_affiliate'),
      },
    );
    if (!affiliate?.profile_id) {
      throw new Error(`supabase ledger: cannot resolve affiliate ${entry.affiliateCode}`);
    }
    const res = await this.rpc<{ id: string; conversion_id: string; duplicate: boolean }>(
      'tracking_record_ledger_entry',
      {
        p_conversion_id: entry.conversionId,
        p_affiliate_id: affiliate.profile_id,
        p_offer_id: entry.offerId,
        p_amount: entry.amount,
        p_currency: entry.currency,
        p_proof: await this.workerProofFor('tracking_record_ledger_entry'),
      },
    );
    return { ...entry, id: res.id ?? entry.id };
  }

  async listLedgerEntries(): Promise<CommissionLedgerEntry[]> {
    const rows = await this.rpc<Row[]>('tracking_list_conversions', {
      p_from: null,
      p_to: null,
      p_offer_id: null,
      p_affiliate_code: null,
      p_limit: 1000,
      p_proof: await this.listProof('tracking_list_conversions'),
    });
    const real: CommissionLedgerEntry[] = [];
    for (const row of rows) {
      if (!row.ledger_id) continue;
      real.push({
        id: String(row.ledger_id),
        conversionId: String(row.id),
        affiliateCode: str(row.affiliate_code) ?? '',
        offerId: str(row.offer_id) ?? '',
        amount: num(row.ledger_amount) ?? 0,
        currency: str(row.currency) ?? 'USD',
        status: (str(row.ledger_status) ?? 'pending') as CommissionLedgerEntry['status'],
        createdAt: str(row.created_at) ?? new Date().toISOString(),
      });
    }
    return real;
  }

  // Postback configs/events stay in-memory (delivery records, not
  // financial truth) — delegated, never sent to Postgres.
  async getPostbackConfigs(offerId?: string, affiliateCode?: string): Promise<PostbackConfig[]> {
    return this.memory.getPostbackConfigs(offerId, affiliateCode);
  }

  async addPostbackConfig(config: PostbackConfig): Promise<PostbackConfig> {
    return this.memory.addPostbackConfig(config);
  }

  async recordPostbackEvent(event: PostbackEvent): Promise<PostbackEvent> {
    return this.memory.recordPostbackEvent(event);
  }

  async listPostbackEvents(): Promise<PostbackEvent[]> {
    return this.memory.listPostbackEvents();
  }
}
