/**
 * Thin Postgres adapter implementing the same Store interface.
 * Only loaded when DATABASE_URL is set (see src/index.ts) — `pg` is an
 * optional dependency and is dynamically imported here, so it is never
 * required at runtime when the in-memory store is in use.
 *
 * Expected tables (see supabase/migrations/001_schema.sql): offers,
 * clicks, conversions, commission_ledger, postback_configs, postback_events.
 * This adapter is intentionally thin: it maps rows 1:1 and does no
 * business logic (commission, dedup, fraud) — that lives in routes.ts
 * and @affilayer/shared.
 */
import type {
  Click,
  CommissionLedgerEntry,
  Conversion,
  Offer,
} from '@affilayer/shared';
import type { PostbackConfig, PostbackEvent, Store } from './store.js';

type PoolLike = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

function rowToOffer(r: Record<string, unknown>): Offer {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    advertiserId: r.advertiser_id ? String(r.advertiser_id) : undefined,
    campaignId: r.campaign_id ? String(r.campaign_id) : undefined,
    payout: Number(r.payout ?? 0),
    currency: String(r.currency ?? 'USD'),
    payoutModel: (r.payout_model as Offer['payoutModel']) ?? 'CPA',
    rateBps: r.rate_bps !== null && r.rate_bps !== undefined ? Number(r.rate_bps) : undefined,
    status: (r.status as Offer['status']) ?? 'active',
    landingUrl: String(r.landing_url ?? ''),
    countries: (r.countries as string[] | null) ?? undefined,
    devices: (r.devices as string[] | null) ?? undefined,
    trafficSources: (r.traffic_sources as string[] | null) ?? undefined,
    cap: r.cap !== null && r.cap !== undefined ? Number(r.cap) : undefined,
    description: r.description ? String(r.description) : undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  };
}

export class PgStore implements Store {
  private pool: PoolLike | null = null;
  private poolPromise: Promise<PoolLike> | null = null;

  constructor(private databaseUrl: string) {}

  private async getPool(): Promise<PoolLike> {
    if (this.pool) return this.pool;
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        // Dynamic import: pg is only loaded when DATABASE_URL is set.
        const pg = await import('pg');
        const pool = new pg.Pool({ connectionString: this.databaseUrl });
        this.pool = pool as unknown as PoolLike;
        return this.pool;
      })();
    }
    return this.poolPromise;
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
    this.pool = null;
    this.poolPromise = null;
  }

  async getOffer(id: string): Promise<Offer | undefined> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM offers WHERE id = $1', [id]);
    return rows[0] ? rowToOffer(rows[0]) : undefined;
  }

  async listOffers(): Promise<Offer[]> {
    const pool = await this.getPool();
    const { rows } = await pool.query("SELECT * FROM offers WHERE status = 'active' ORDER BY id");
    return rows.map(rowToOffer);
  }

  async recordClick(click: Click): Promise<Click> {
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO clicks (id, click_id, affiliate_code, offer_id, sub1, sub2, sub3, sub4, sub5,
        source, referrer, ip, user_agent, country, device, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        click.id, click.clickId, click.affiliateCode, click.offerId,
        click.sub1 ?? null, click.sub2 ?? null, click.sub3 ?? null, click.sub4 ?? null, click.sub5 ?? null,
        click.source ?? null, click.referrer ?? null, click.ip ?? null, click.userAgent ?? null,
        click.country ?? null, click.device ?? null, click.createdAt,
      ],
    );
    return click;
  }

  async getClick(clickId: string): Promise<Click | undefined> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM clicks WHERE click_id = $1 OR id = $1', [clickId]);
    if (!rows[0]) return undefined;
    const r = rows[0];
    return {
      id: String(r.id),
      clickId: String(r.click_id),
      affiliateCode: String(r.affiliate_code ?? ''),
      offerId: String(r.offer_id ?? ''),
      sub1: r.sub1 ? String(r.sub1) : undefined,
      sub2: r.sub2 ? String(r.sub2) : undefined,
      sub3: r.sub3 ? String(r.sub3) : undefined,
      sub4: r.sub4 ? String(r.sub4) : undefined,
      sub5: r.sub5 ? String(r.sub5) : undefined,
      source: r.source ? String(r.source) : undefined,
      referrer: r.referrer ? String(r.referrer) : undefined,
      ip: r.ip ? String(r.ip) : undefined,
      userAgent: r.user_agent ? String(r.user_agent) : undefined,
      country: r.country ? String(r.country) : undefined,
      device: r.device ? String(r.device) : undefined,
      createdAt: String(r.created_at),
    };
  }

  async listClicks(): Promise<Click[]> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM clicks ORDER BY created_at DESC LIMIT 10000');
    const out: Click[] = [];
    for (const r of rows) {
      const c = await this.getClick(String(r.click_id));
      if (c) out.push(c);
    }
    return out;
  }

  async recordConversion(conversion: Conversion): Promise<Conversion> {
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO conversions (id, click_id, offer_id, affiliate_code, payout, currency, status, idempotency_key, sub1, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        conversion.id, conversion.clickId, conversion.offerId, conversion.affiliateCode ?? null,
        conversion.payout, conversion.currency, conversion.status, conversion.idempotencyKey,
        conversion.sub1 ?? null, conversion.createdAt,
      ],
    );
    return conversion;
  }

  async getConversion(id: string): Promise<Conversion | undefined> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM conversions WHERE id = $1', [id]);
    return rows[0] ? this.rowToConversion(rows[0]) : undefined;
  }

  private rowToConversion(r: Record<string, unknown>): Conversion {
    return {
      id: String(r.id),
      clickId: String(r.click_id),
      offerId: String(r.offer_id),
      affiliateCode: r.affiliate_code ? String(r.affiliate_code) : undefined,
      payout: Number(r.payout ?? 0),
      currency: String(r.currency ?? 'USD'),
      status: (r.status as Conversion['status']) ?? 'pending',
      idempotencyKey: String(r.idempotency_key ?? ''),
      sub1: r.sub1 ? String(r.sub1) : undefined,
      createdAt: String(r.created_at),
      updatedAt: r.updated_at ? String(r.updated_at) : undefined,
    };
  }

  async findConversionByIdempotencyKey(key: string): Promise<Conversion | undefined> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM conversions WHERE idempotency_key = $1', [key]);
    return rows[0] ? this.rowToConversion(rows[0]) : undefined;
  }

  async findConversionByClickAndOffer(clickId: string, offerId: string): Promise<Conversion | undefined> {
    const pool = await this.getPool();
    const { rows } = await pool.query(
      'SELECT * FROM conversions WHERE click_id = $1 AND offer_id = $2 AND status <> $3 ORDER BY created_at ASC LIMIT 1',
      [clickId, offerId, 'reversed'],
    );
    return rows[0] ? this.rowToConversion(rows[0]) : undefined;
  }

  async listConversions(): Promise<Conversion[]> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM conversions ORDER BY created_at DESC LIMIT 10000');
    return rows.map((r) => this.rowToConversion(r));
  }

  async recordLedgerEntry(entry: CommissionLedgerEntry): Promise<CommissionLedgerEntry> {
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO commission_ledger (id, conversion_id, affiliate_code, offer_id, amount, currency, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.id, entry.conversionId, entry.affiliateCode, entry.offerId, entry.amount, entry.currency, entry.status, entry.createdAt],
    );
    return entry;
  }

  async listLedgerEntries(): Promise<CommissionLedgerEntry[]> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM commission_ledger ORDER BY created_at DESC LIMIT 10000');
    return rows.map((r) => ({
      id: String(r.id),
      conversionId: String(r.conversion_id),
      affiliateCode: String(r.affiliate_code ?? ''),
      offerId: String(r.offer_id ?? ''),
      amount: Number(r.amount ?? 0),
      currency: String(r.currency ?? 'USD'),
      status: (r.status as CommissionLedgerEntry['status']) ?? 'pending',
      createdAt: String(r.created_at),
      updatedAt: r.updated_at ? String(r.updated_at) : undefined,
    }));
  }

  async getPostbackConfigs(offerId?: string, affiliateCode?: string): Promise<PostbackConfig[]> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM postback_configs WHERE is_active = true');
    return rows
      .map((r) => ({
        id: String(r.id),
        offerId: r.offer_id ? String(r.offer_id) : undefined,
        affiliateCode: r.affiliate_code ? String(r.affiliate_code) : undefined,
        url: String(r.url ?? ''),
      }))
      .filter(
        (c) =>
          (!c.offerId || !offerId || c.offerId === offerId) &&
          (!c.affiliateCode || !affiliateCode || c.affiliateCode === affiliateCode),
      );
  }

  async addPostbackConfig(config: PostbackConfig): Promise<PostbackConfig> {
    const pool = await this.getPool();
    await pool.query(
      'INSERT INTO postback_configs (id, offer_id, affiliate_code, url, is_active) VALUES ($1,$2,$3,$4,true)',
      [config.id, config.offerId ?? null, config.affiliateCode ?? null, config.url],
    );
    return config;
  }

  async recordPostbackEvent(event: PostbackEvent): Promise<PostbackEvent> {
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO postback_events (id, conversion_id, url, status, status_code, attempts, error, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.id, event.conversionId ?? null, event.url, event.status,
        event.statusCode ?? null, event.attempts, event.error ?? null, event.createdAt,
      ],
    );
    return event;
  }

  async listPostbackEvents(): Promise<PostbackEvent[]> {
    const pool = await this.getPool();
    const { rows } = await pool.query('SELECT * FROM postback_events ORDER BY created_at DESC LIMIT 10000');
    return rows.map((r) => ({
      id: String(r.id),
      conversionId: r.conversion_id ? String(r.conversion_id) : undefined,
      url: String(r.url ?? ''),
      status: (r.status as PostbackEvent['status']) ?? 'failed',
      statusCode: r.status_code !== null && r.status_code !== undefined ? Number(r.status_code) : undefined,
      attempts: Number(r.attempts ?? 0),
      error: r.error ? String(r.error) : undefined,
      createdAt: String(r.created_at),
    }));
  }
}

/** Create a PgStore for a DATABASE_URL. Importing this module does not load `pg`. */
export function createPgStore(databaseUrl: string): PgStore {
  return new PgStore(databaseUrl);
}
