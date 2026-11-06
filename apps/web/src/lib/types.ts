// Web types are the @affilayer/shared domain types — no local mirror.
// Database rows (snake_case columns) are mapped to these camelCase types
// in lib/data.ts before they reach any page.
export type {
  Campaign,
  Click,
  CommissionLedgerEntry,
  Conversion,
  ConversionStatus,
  FraudSignal,
  Offer,
  OfferStatus,
  PayoutModel,
  PayoutRequest,
  Profile,
  Role,
  SmartLinkRule,
  Stats,
  SupportTicket,
  TrackingStep,
} from '@affilayer/shared'
