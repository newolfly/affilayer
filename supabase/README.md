# AffiLayer — Supabase

Database layer for the AffiLayer affiliate-network MVP. SQL files only — no
live project is created or touched by anything in this folder.

## Files

| File | What it does |
| --- | --- |
| `migrations/001_schema.sql` | All 19 tables, FKs, CHECKs, dedup + reporting indexes |
| `migrations/002_rls.sql` | Row Level Security on every user-facing table + helper functions |
| `migrations/003_functions.sql` | `updated_at` triggers, immutable-ledger guard, `affiliate_balances` view, `approve_conversion` / `reject_conversion`, `log_audit` |
| `migrations/004_seed.sql` | **Demo data only** — fake orgs, users, offers, clicks, conversions |
| `tests/rls-checks.sql` | SELECT checks to run by hand after applying the migrations |

## Apply

### Option A — Supabase CLI (recommended)

```bash
# from the repo root (affilayer/)
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase db push` applies `migrations/` in filename order
(001 → 002 → 003 → 004). The seed file (004) is included so a fresh
project gets demo data; delete or skip it for a production project.

### Option B — Dashboard SQL editor

In the Supabase dashboard, open the SQL editor and run the files **in
order**: `001_schema.sql`, then `002_rls.sql`, then `003_functions.sql`,
then (dev only) `004_seed.sql`. Do not run them out of order — 002
references tables from 001, 003 references tables from 001, and 004
references everything before it.

### Seed data — read before running 004

`004_seed.sql` is **demo data only** (fake people, fake clicks, fake money).
Its `profiles` rows reference `auth.users(id)`, so the profile inserts fail
with a foreign-key violation until matching Auth users exist. Create the
four demo Auth users first (Authentication > Users), copy each user's UUID,
and replace the UUID constants at the top of `004_seed.sql` with the real
ones. No passwords are in the file — passwords live only in Supabase Auth.
The seed is re-runnable (`ON CONFLICT DO NOTHING`).

## Environment the app needs

The web app (`apps/web`) reads only these two variables:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

**Never put the service-role key in the browser.** The service-role key
bypasses RLS entirely; it belongs only in trusted backend code (the
tracking service, payout jobs), as `SUPABASE_SERVICE_ROLE_KEY` on the
server. The tracking service additionally uses `DATABASE_URL` when it
talks to Postgres directly (optional — it runs in-memory without it).

## Rules the schema enforces

- **Dedup:** `conversions.idempotency_key` is unique, and a partial unique
  index on `(click_id, offer_id)` blocks a second non-reversed conversion
  for the same click + offer.
- **Money is append-only:** `commission_ledger` money columns can never be
  edited and rows can never be deleted (trigger in 003). Only the `status`
  may move, along `pending → approved → payable → paid` (or to
  `rejected` / `reversed`). Corrections are new rows.
- **Writes are service-role only** for `clicks`, `conversions`,
  `commission_ledger`, `postback_events`, `payout_transactions` — there is
  no INSERT/UPDATE/DELETE policy for `authenticated` on those tables.
  Conversion status changes go through `approve_conversion` /
  `reject_conversion`, which require an admin caller, check the state
  machine (only `pending` can move) and write an `audit_logs` row.
- **Audit trail:** `audit_logs` has no INSERT policy for `authenticated`;
  rows are written by the security-definer `log_audit()` function or the
  service role, and only admins can read them.

## Verify RLS against a real project

RLS **cannot be fully verified without a live database** — the policies in
`002_rls.sql` were syntax-checked only (see below). After applying the
migrations to a real project:

1. Create the demo Auth users and run `004_seed.sql`.
2. Sign in as `affiliate1@demo.affilayer.test` and run the checks in
   `tests/rls-checks.sql` from the SQL editor **as that user** (or via the
   app with that user's JWT). Each check states its expected result in a
   comment — e.g. selecting another affiliate's conversions must return
   0 rows.
3. Confirm the negative cases too: an `INSERT INTO clicks ...` issued with
   the anon/authenticated key must fail, and `SELECT * FROM audit_logs`
   as a non-admin must return 0 rows.

## Syntax verification (no live DB in this repo)

The four migration files were parsed with `pglast` (the real PostgreSQL
parser, `pip install pglast`) — all four parse cleanly. That proves the
SQL is syntactically valid; it does **not** prove the RLS policies behave
as intended, the FK targets resolve, or the functions run — only a live
`supabase db push` + the checks in `tests/rls-checks.sql` prove that.
