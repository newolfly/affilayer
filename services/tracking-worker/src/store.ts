/**
 * In-memory store for the tracking Worker.
 * Ported from services/tracking/src/store.ts (same interface, same DEMO
 * offers). State lives in the Worker isolate only — it is ephemeral and
 * NOT shared across isolates. This matches the Fastify service's dev
 * default (in-memory when DATABASE_URL is unset). For durable state,
 * use the Fastify service with Postgres or a Durable Object store.
 */
import type {
  Click,
  CommissionLedgerEntry,
  Conversion,
  Offer,
} from '@affilayer/shared';

export interface PostbackConfig {
  id: string;
  /** If set, only fires for this offer. Undefined = all offers. */
  offerId?: string;
  affiliateCode?: string;
  /** URL template with {click_id} {conversion_id} {payout} {currency} {status} {sub1} macros. */
  url: string;
}

export interface PostbackEvent {
  id: string;
  conversionId?: string;
  configId?: string;
  url: string;
  status: 'delivered' | 'failed';
  statusCode?: number;
  attempts: number;
  error?: string;
  createdAt: string;
}

export interface Store {
  getOffer(id: string): Promise<Offer | undefined>;
  listOffers(): Promise<Offer[]>;
  recordClick(click: Click): Promise<Click>;
  getClick(clickId: string): Promise<Click | undefined>;
  listClicks(): Promise<Click[]>;
  recordConversion(conversion: Conversion): Promise<Conversion>;
  getConversion(id: string): Promise<Conversion | undefined>;
  findConversionByIdempotencyKey(key: string): Promise<Conversion | undefined>;
  findConversionByClickAndOffer(clickId: string, offerId: string): Promise<Conversion | undefined>;
  listConversions(): Promise<Conversion[]>;
  recordLedgerEntry(entry: CommissionLedgerEntry): Promise<CommissionLedgerEntry>;
  listLedgerEntries(): Promise<CommissionLedgerEntry[]>;
  getPostbackConfigs(offerId?: string, affiliateCode?: string): Promise<PostbackConfig[]>;
  addPostbackConfig(config: PostbackConfig): Promise<PostbackConfig>;
  recordPostbackEvent(event: PostbackEvent): Promise<PostbackEvent>;
  listPostbackEvents(): Promise<PostbackEvent[]>;
}

/** DEMO offers, seeded in-memory only. */
export const DEMO_OFFERS: Offer[] = [
  {
    id: 'offer-a',
    name: 'Demo Offer A',
    payout: 10,
    currency: 'USD',
    payoutModel: 'CPA',
    status: 'active',
    landingUrl: 'https://example.com/landing-a',
    description: 'DEMO offer — seeded in-memory, not a real advertiser.',
  },
  {
    id: 'offer-b',
    name: 'Demo Offer B',
    payout: 25,
    currency: 'USD',
    payoutModel: 'CPA',
    status: 'active',
    landingUrl: 'https://example.com/landing-b',
    description: 'DEMO offer — seeded in-memory, not a real advertiser.',
  },
];

export class InMemoryStore implements Store {
  private offers: Offer[] = [...DEMO_OFFERS];
  private clicks: Click[] = [];
  private conversions: Conversion[] = [];
  private ledger: CommissionLedgerEntry[] = [];
  private postbackConfigs: PostbackConfig[] = [];
  private postbackEvents: PostbackEvent[] = [];

  async getOffer(id: string): Promise<Offer | undefined> {
    return this.offers.find((o) => o.id === id);
  }
  async listOffers(): Promise<Offer[]> {
    return [...this.offers];
  }
  async recordClick(click: Click): Promise<Click> {
    this.clicks.push(click);
    return click;
  }
  async getClick(clickId: string): Promise<Click | undefined> {
    return this.clicks.find((c) => c.clickId === clickId || c.id === clickId);
  }
  async listClicks(): Promise<Click[]> {
    return [...this.clicks];
  }
  async recordConversion(conversion: Conversion): Promise<Conversion> {
    this.conversions.push(conversion);
    return conversion;
  }
  async getConversion(id: string): Promise<Conversion | undefined> {
    return this.conversions.find((c) => c.id === id);
  }
  async findConversionByIdempotencyKey(key: string): Promise<Conversion | undefined> {
    return this.conversions.find((c) => c.idempotencyKey === key);
  }
  async findConversionByClickAndOffer(clickId: string, offerId: string): Promise<Conversion | undefined> {
    return this.conversions.find((c) => c.clickId === clickId && c.offerId === offerId);
  }
  async listConversions(): Promise<Conversion[]> {
    return [...this.conversions];
  }
  async recordLedgerEntry(entry: CommissionLedgerEntry): Promise<CommissionLedgerEntry> {
    this.ledger.push(entry);
    return entry;
  }
  async listLedgerEntries(): Promise<CommissionLedgerEntry[]> {
    return [...this.ledger];
  }
  async getPostbackConfigs(offerId?: string, affiliateCode?: string): Promise<PostbackConfig[]> {
    return this.postbackConfigs.filter(
      (c) =>
        (!c.offerId || !offerId || c.offerId === offerId) &&
        (!c.affiliateCode || !affiliateCode || c.affiliateCode === affiliateCode),
    );
  }
  async addPostbackConfig(config: PostbackConfig): Promise<PostbackConfig> {
    this.postbackConfigs.push(config);
    return config;
  }
  async recordPostbackEvent(event: PostbackEvent): Promise<PostbackEvent> {
    this.postbackEvents.push(event);
    return event;
  }
  async listPostbackEvents(): Promise<PostbackEvent[]> {
    return [...this.postbackEvents];
  }
}
