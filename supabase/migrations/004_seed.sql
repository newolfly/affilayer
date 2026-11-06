-- ============================================================================
-- AffiLayer — 004_seed.sql — *** DEMO DATA ONLY ***
-- Every row in this file is FAKE sample data for local development and demos.
-- It is NOT real: fake people, fake companies, fake clicks, fake money.
-- Never present it as real, and never run it against a production project.
--
-- HOW TO USE:
--   1. Create the four Supabase Auth users FIRST (Authentication > Users in
--      the dashboard, or the Auth Admin API). There are NO passwords in this
--      file — passwords live only in Auth, never in SQL.
--   2. profiles.id is a foreign key to auth.users(id), so the profile rows
--      below will FAIL with a foreign-key violation until Auth users with
--      EXACTLY these UUIDs exist. Auth generates UUIDs when you create a
--      user in the dashboard, so the practical path is: create the four
--      users, copy each user's UUID from the dashboard, and replace the
--      UUID constants at the top of this file with the real ones before
--      running it. (Alternatively, create the users via the Auth Admin API
--      and pass these UUIDs as the user id where your tooling allows it.)
--   3. Run the migrations 001-003 first, then this file, in the SQL editor
--      or with `supabase db push` + `psql`. Re-runnable: every INSERT uses
--      ON CONFLICT DO NOTHING, so running it twice inserts nothing new.
--
-- Demo accounts (emails only — no passwords anywhere in this file):
--   admin@demo.affilayer.test       super_admin
--   advertiser@demo.affilayer.test  advertiser
--   affiliate1@demo.affilayer.test  affiliate (code AFF-DEMO-001)
--   affiliate2@demo.affilayer.test  affiliate (code AFF-DEMO-002)
-- ============================================================================

-- --- Fixed demo UUIDs. Replace with real Auth user UUIDs (see step 2 above).
-- Org ids
--   aaaaaaaa-0000-4000-8000-000000000001  AffiLayer Demo Network
--   aaaaaaaa-0000-4000-8000-000000000002  Demo Advertiser Co
--   aaaaaaaa-0000-4000-8000-000000000003  Demo Affiliate Org
-- Profile ids
--   bbbbbbbb-0000-4000-8000-000000000001  admin
--   bbbbbbbb-0000-4000-8000-000000000002  advertiser
--   bbbbbbbb-0000-4000-8000-000000000003  affiliate1
--   bbbbbbbb-0000-4000-8000-000000000004  affiliate2

-- ---------------------------------------------------------------------------
-- Demo organizations
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, slug, type, contact_email, country, website)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'AffiLayer Demo Network', 'demo-network', 'network', 'admin@demo.affilayer.test', 'US', 'https://demo.affilayer.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Demo Advertiser Co', 'demo-advertiser-co', 'advertiser', 'advertiser@demo.affilayer.test', 'US', 'https://demo-advertiser.example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'Demo Affiliate Org', 'demo-affiliate-org', 'affiliate', 'affiliate1@demo.affilayer.test', 'US', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo profiles — REQUIRES matching auth.users rows (see header, step 2).
-- If this block fails with "insert or update on table profiles violates
-- foreign key constraint profiles_id_fkey", create the Auth users first.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, email, full_name, role, organization_id, status, kyc_status)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'admin@demo.affilayer.test', 'Demo Admin', 'super_admin', 'aaaaaaaa-0000-4000-8000-000000000001', 'approved', 'verified'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'advertiser@demo.affilayer.test', 'Demo Advertiser', 'advertiser', 'aaaaaaaa-0000-4000-8000-000000000002', 'approved', 'verified'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'affiliate1@demo.affilayer.test', 'Demo Affiliate One', 'affiliate', 'aaaaaaaa-0000-4000-8000-000000000003', 'approved', 'verified'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'affiliate2@demo.affilayer.test', 'Demo Affiliate Two', 'affiliate', 'aaaaaaaa-0000-4000-8000-000000000003', 'approved', 'pending')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo affiliate / advertiser profiles
-- ---------------------------------------------------------------------------
INSERT INTO public.affiliate_profiles (id, profile_id, organization_id, affiliate_code, traffic_sources, verticals, geos)
VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003', 'AFF-DEMO-001', '{seo,social}', '{finance,ecommerce}', '{US,CA,GB}'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000003', 'AFF-DEMO-002', '{email,push}', '{gaming}', '{US}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.advertiser_profiles (id, profile_id, organization_id, company_name, website, billing_email)
VALUES
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'Demo Advertiser Co', 'https://demo-advertiser.example.test', 'billing@demo-advertiser.example.test')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo campaign + 3 demo offers across 3 verticals
-- ---------------------------------------------------------------------------
INSERT INTO public.campaigns (id, organization_id, owner_id, name, description, status, budget, currency)
VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Demo Spring Campaign', 'Fake demo campaign for local development only.', 'active', 1000.00, 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.offers (id, campaign_id, advertiser_id, organization_id, name, description, vertical, countries, devices, traffic_sources, conversion_type, payout_model, payout, currency, daily_cap, monthly_cap, landing_url, approval_required, status)
VALUES
  ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'Demo Finance Lead', 'Fake demo offer: finance lead form (CPA).', 'finance', '{US,CA,GB}', '{desktop,mobile}', '{seo,social,email}', 'lead', 'CPA', 12.00, 'USD', 100, 1000,
   'https://demo-advertiser.example.test/finance', true, 'active'),
  ('dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'Demo Ecommerce Sale', 'Fake demo offer: ecommerce purchase (CPS).', 'ecommerce', '{US}', '{desktop,mobile}', '{seo,social}', 'purchase', 'CPS', 25.00, 'USD', 50, 500,
   'https://demo-advertiser.example.test/shop', true, 'active'),
  ('dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'Demo Gaming Signup', 'Fake demo offer: gaming signup (CPL).', 'gaming', '{US,CA}', '{mobile}', '{social,push}', 'signup', 'CPL', 3.50, 'USD', 200, 2000,
   'https://demo-advertiser.example.test/game', false, 'paused')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo offer application + access grant (affiliate1 approved for offer 1)
-- ---------------------------------------------------------------------------
INSERT INTO public.offer_applications (id, offer_id, affiliate_id, status, message)
VALUES
  ('dddddddd-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'approved', 'Demo application — fake.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.affiliate_offer_access (id, offer_id, affiliate_id, granted, granted_by)
VALUES
  ('dddddddd-0000-4000-8000-000000000006', 'dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', true, 'bbbbbbbb-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo tracking links
-- ---------------------------------------------------------------------------
INSERT INTO public.tracking_links (id, affiliate_id, offer_id, campaign_id, affiliate_code, link_code, url, sub1)
VALUES
  ('eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'AFF-DEMO-001', 'demo-link-001', 'https://demo.affilayer.test/c/AFF-DEMO-001/dddddddd-0000-4000-8000-000000000002', 'demo-sub-1'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', 'AFF-DEMO-002', 'demo-link-002', 'https://demo.affilayer.test/c/AFF-DEMO-002/dddddddd-0000-4000-8000-000000000003', 'demo-sub-2')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo clicks (5 fake clicks; IPs are documentation/test ranges, not real users)
-- ---------------------------------------------------------------------------
INSERT INTO public.clicks (id, click_id, affiliate_code, affiliate_id, offer_id, campaign_id, ip, user_agent, referrer, country, device, os, browser, source, sub1)
VALUES
  ('ffffffff-0000-4000-8000-000000000001', 'clk_demo00000000000000000001', 'AFF-DEMO-001', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', '192.0.2.1', 'DemoBrowser/1.0', 'https://demo.example.test/', 'US', 'mobile', 'DemoOS', 'DemoBrowser', 'seo', 'demo-sub-1'),
  ('ffffffff-0000-4000-8000-000000000002', 'clk_demo00000000000000000002', 'AFF-DEMO-001', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', '192.0.2.2', 'DemoBrowser/1.0', 'https://demo.example.test/', 'CA', 'desktop', 'DemoOS', 'DemoBrowser', 'social', 'demo-sub-1'),
  ('ffffffff-0000-4000-8000-000000000003', 'clk_demo00000000000000000003', 'AFF-DEMO-001', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', '192.0.2.3', 'DemoBrowser/1.0', NULL, 'GB', 'mobile', 'DemoOS', 'DemoBrowser', 'email', 'demo-sub-1'),
  ('ffffffff-0000-4000-8000-000000000004', 'clk_demo00000000000000000004', 'AFF-DEMO-002', 'bbbbbbbb-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', '192.0.2.4', 'DemoBrowser/1.0', 'https://demo.example.test/', 'US', 'desktop', 'DemoOS', 'DemoBrowser', 'seo', 'demo-sub-2'),
  ('ffffffff-0000-4000-8000-000000000005', 'clk_demo00000000000000000005', 'AFF-DEMO-002', 'bbbbbbbb-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', '192.0.2.5', 'DemoBrowser/1.0', NULL, 'US', 'mobile', 'DemoOS', 'DemoBrowser', 'social', 'demo-sub-2')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo conversions (3 fake conversions) + matching ledger rows (fake money)
-- ---------------------------------------------------------------------------
INSERT INTO public.conversions (id, conversion_id, click_id, offer_id, affiliate_id, conversion_action, payout, currency, status, idempotency_key, sub1, metadata)
VALUES
  ('11111111-1111-4000-8000-000000000001', 'conv_demo_001', 'clk_demo00000000000000000001', 'dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'lead', 12.00, 'USD', 'approved', 'idem-demo-001', 'demo-sub-1', '{"demo": true}'::jsonb),
  ('11111111-1111-4000-8000-000000000002', 'conv_demo_002', 'clk_demo00000000000000000002', 'dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'lead', 12.00, 'USD', 'pending', 'idem-demo-002', 'demo-sub-1', '{"demo": true}'::jsonb),
  ('11111111-1111-4000-8000-000000000003', 'conv_demo_003', 'clk_demo00000000000000000004', 'dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000004', 'purchase', 25.00, 'USD', 'pending', 'idem-demo-003', 'demo-sub-2', '{"demo": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.commission_ledger (id, conversion_id, affiliate_id, offer_id, amount, currency, status, note)
VALUES
  ('22222222-2222-4000-8000-000000000001', '11111111-1111-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 12.00, 'USD', 'approved', 'Demo ledger row — fake money.'),
  ('22222222-2222-4000-8000-000000000002', '11111111-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 12.00, 'USD', 'pending', 'Demo ledger row — fake money.'),
  ('22222222-2222-4000-8000-000000000003', '11111111-1111-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003', 25.00, 'USD', 'pending', 'Demo ledger row — fake money.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo postback configs — the "secret" below is a FAKE demo value.
-- Never use it in production; rotate/replace before any real traffic.
-- ---------------------------------------------------------------------------
INSERT INTO public.postback_configs (id, affiliate_id, offer_id, url, secret, events, is_active)
VALUES
  ('33333333-3333-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002',
   'https://demo-affiliate.example.test/postback?click_id={click_id}&conversion_id={conversion_id}&payout={payout}&currency={currency}&status={status}&sub1={sub1}',
   'demo-secret-do-not-use-in-production', '{conversion}', true),
  ('33333333-3333-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000004', NULL,
   'https://demo-affiliate2.example.test/postback?click_id={click_id}&payout={payout}&status={status}',
   'demo-secret-do-not-use-in-production', '{conversion}', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo payout request (fake — no money moves)
-- ---------------------------------------------------------------------------
INSERT INTO public.payout_requests (id, affiliate_id, amount, currency, status, payment_method)
VALUES
  ('44444444-4444-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 12.00, 'USD', 'pending', 'demo-bank-transfer')
ON CONFLICT (id) DO NOTHING;

-- --- End of demo seed. Verify with: SELECT count(*) FROM public.offers; (expect 3)
