// Web types are the @affilayer/shared domain types — no local mirror.
// Database rows (snake_case columns) are mapped to these camelCase types
// in lib/data.ts before they reach any page.
export type {
  AdvertiserBalance,
  AdvertiserDeposit,
  Campaign,
  Click,
  CommissionLedgerEntry,
  Conversion,
  ConversionStatus,
  FraudSignal,
  NpPayout,
  Offer,
  OfferStatus,
  PayoutModel,
  PayoutRequest,
  PayoutWallet,
  Profile,
  Role,
  SmartLinkRule,
  Stats,
  SupportTicket,
  TrackingStep,
} from '@affilayer/shared'
