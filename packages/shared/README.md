# @affilayer/shared

Pure TypeScript types + helpers shared by the web app and the tracking
service. No Node-only dependencies — safe to import from the browser.

## Exports

Types: `Role`, `OfferStatus`, `ConversionStatus`, `PayoutModel`, `Offer`,
`Campaign`, `Click`, `Conversion`, `CommissionLedgerEntry`, `PayoutRequest`,
`TrackingStep`, `SmartLinkRule`, `FraudSignal`.

Functions: `computeCommission`, `expandPostbackMacros`, `generateClickId`,
`isOfferEligible`, `smartlinkPick`, `detectFraudSignals`, `ledgerTransition`.

Rules (per contract): SmartLink pick is deterministic (eligible offers sorted
by payout desc, then id asc, pick first). Fraud signals are signals only —
never auto-reject. Ledger transitions allowed: pending → approved|rejected,
approved → reversed; rejected/reversed are terminal.

## Run / build / test

```bash
npm install
npm test    # vitest
npm run build  # tsc -> dist/
```
