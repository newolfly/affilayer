# AffiLayer migration record

Purpose: the database has no supabase_migrations registry, so this record is the human evidence trail. Live application is judged by behaviour and schema effects verified in audits, not by a registry read. (Created 16 Nov 2026, audit v6, closing finding L-2.)

## Files in supabase/migrations/

001_schema, 002_rls, 003_functions, 004_seed (demo only), 005–029 all present as files. 004_seed.sql and 023_reject_ledgerless_pending_conversion.sql DO exist as files (earlier notes saying otherwise were wrong).

## Live application evidence

- 001–003, 005–027: applied live, verified across audits v1–v4 by schema and behaviour checks (RLS on all 25 public tables verified again in v5).
- 028 (search_path hardening) and 029 (postback configs RPC): applied live 13 Nov, effects verified in audit v4 Phase 1.
- 023: file exists; its live application cannot be verified from the database side (no registry). Its effect (rejecting ledgerless pending conversions) has not been re-proven by a dedicated live probe. Status: UNVERIFIED — prove by a controlled test conversion in a test scope, or accept the gap in writing.

## Rule going forward

- Never delete completed payout rows (migration 019 closed the reservation race; the $12.02 ledger gap came from deleted test payout rows).
- Any new migration gets a line in this record with the date applied and the behaviour check that proved it.
