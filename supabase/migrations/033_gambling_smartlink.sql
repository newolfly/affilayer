-- ============================================================================
-- AffiLayer — supabase/migrations/033_gambling_smartlink.sql
--
-- Gambling smartlink chain, South Asia (27 Nov 2026, Sojib's order):
-- one code `gambling` rotating his 10 South Asia gambling partners
-- (Bangladesh, India, Pakistan, Nepal). Built PAUSED — nothing goes
-- live to affiliates: all 8 offer rows status 'paused', the smartlinks
-- row status 'paused' (the Worker reads smartlinks with the anon key
-- and RLS only exposes active rows, so a paused code 404s).
--
-- Money math (Sojib, confirmed 27 Nov 2026): AffiLayer keeps 10% of
-- whatever the partner pays, affiliates get 90%. Gambling chain only —
-- it does NOT follow the zero-profit promo. The affiliate rate in each
-- row is partner rate x 0.9, using the published ENTRY tier (Sojib's
-- actual tier is verified only for JeetBuzz, 50% from his own portal).
-- Re-set the rate from his dashboard figure before activating any
-- offer whose tier is higher than the entry tier used here.
--
-- Rates used (full evidence in
-- ~/workspace/work/affilayer-acquisition/gambling-smartlink-2026-11-27.md):
--   JeetBuzz 50% -> 45% (4500) | Baji Live 40% -> 36% (3600)
--   Six6s 40% -> 36% (3600)    | Krikya 30% -> 27% (2700)
--   Nagad88 40% -> 36% (3600)  | HeyBaji 40% -> 36% (3600)
--   JeetBangla 45% -> 40.5% (4050) | BigTaka 25% -> 22.5% (2250)
-- LEFT OUT (rate-unknown, never invented): BanglaWin88 (only "up to
-- 65%", no tier table) and BGB88 (no public rate found). Both links
-- verified live; include them only after Sojib's dashboard check.
--
--  1. smartlinks gains a nullable `vertical` column. When a code's row
--     carries a vertical, the Worker scopes the pick to offers with
--     that vertical only (see services/tracking-worker/src/index.ts,
--     the /s/:code handler). NULL keeps the old behaviour (whole pool).
--  2. Eight offer rows (CPS revshare, payout 0, rate_bps = affiliate
--     rate). landing_url holds Sojib's own partner links — same as the
--     existing CJ / LosPollos rows; the affiliate UI never renders
--     landing URLs (27 Nov 2026 offer-pages fix). Descriptions are
--     affiliate-facing only: brand + their own rate + USDT / Net-30.
--     No provider, margin or backend wording anywhere.
--  3. smartlinks row ('gambling', unpinned, paused, 'Gambling').
--
-- No conversion automation: none of these partners offers a server
-- postback. Conversions reach the ledger only via the manual mirror
-- path (admin record_provider_credit from the partner agent
-- dashboards), same as CJ / NOWPayments. Clicks are tracked in real
-- time; conversions depend on weekly reconciliation.
--
-- JeetBuzz flag: his account carries a -386,123 BDT negative
-- carry-forward (verified 26 Nov 2026) — volume through that link
-- fills the hole before any commission pays. Activation of the
-- JeetBuzz row is Sojib's call; see the record file §3.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. smartlinks.vertical
-- ---------------------------------------------------------------------------
ALTER TABLE public.smartlinks
  ADD COLUMN IF NOT EXISTS vertical text;

-- ---------------------------------------------------------------------------
-- 2. Eight gambling offer rows (all paused)
-- ---------------------------------------------------------------------------
INSERT INTO public.offers
  (id, name, description, vertical, countries, devices, conversion_type,
   payout_model, payout, currency, rate_bps, landing_url,
   approval_required, status, organization_id)
VALUES
  ('2924ddfe-3b52-41c4-8a82-1fd8e3aaed8c',
   'JeetBuzz',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 45% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 4500,
   'https://jb09p25aff2024.com/af/5J46ySZS/IPL2026',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('7299e15f-5a2c-499d-bc59-e46405fd7347',
   'Baji Live',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 36% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 3600,
   'https://bj03p16aff2025.com/af/2x5I2f34/IPL2026',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('976e5d5b-099c-40a5-a9a3-7ce2dfea6cc4',
   'Six6s',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 36% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 3600,
   'https://6s02p06aff2023.com/af/8zc484VJ/join',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('6efd7e7f-37b1-4f85-9fca-975f244fc2c1',
   'Krikya',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 27% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 2700,
   'https://www.krikya22.com/?af=AG018751',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('1db19b1f-fbda-4ab9-ab60-db85c4f20760',
   'Nagad88',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 36% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 3600,
   'https://www.nagad88.vip/?af=AG009900',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('6e314bcd-bd7c-4f50-94ca-39e367d18d16',
   'HeyBaji',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 36% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 3600,
   'https://heybaji.online/af/k0sha9Bb/join',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('9af7417a-0923-4756-bfb2-0ec0d099902c',
   'JeetBangla',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 40.5% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 4050,
   'https://jeetbangla.online/af/42CH4P3Q/join',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101'),
  ('7ba75c06-508c-4a50-b700-53e19c26f47f',
   'BigTaka',
   'South Asia casino and sports betting — cricket, live casino and slots. You earn 22.5% of the net revenue from players you refer. Paid in USDT (TRC20) once your approved balance reaches $50, Net-30.',
   'Gambling', ARRAY['BD', 'IN', 'PK', 'NP'], ARRAY['mobile', 'desktop'], 'ftd',
   'CPS', 0, 'USD', 2250,
   'https://bigtaka2.com/?af=AG001523',
   true, 'paused', 'aaaaaaaa-0000-4000-8000-000000000101')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. smartlinks row for the chain (unpinned, paused)
-- ---------------------------------------------------------------------------
INSERT INTO public.smartlinks (code, offer_id, status, vertical)
VALUES ('gambling', NULL, 'paused', 'Gambling')
ON CONFLICT (code) DO NOTHING;
