-- ============================================================================
-- AffiLayer — 001_schema.sql
-- Creates all 19 tables for the AffiLayer affiliate-network MVP.
--
-- Apply order: 001_schema.sql -> 002_rls.sql -> 003_functions.sql -> 004_seed.sql
-- Safe to re-run? NO — this file uses CREATE TABLE (not IF NOT EXISTS) on
-- purpose: it must fail loudly if run twice against the same database, so a
-- half-applied schema is never silently mistaken for a clean one. Use
-- `supabase db reset` / a fresh project to re-apply, or write a new migration.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- organizations — a company / network tenant (advertiser org or affiliate org)
-- ---------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  type            text NOT NULL DEFAULT 'advertiser'
                  CHECK (type IN ('network', 'advertiser', 'affiliate')),
  contact_email   text,
  country         char(2),
  website         text,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- profiles — one row per Supabase Auth user. id MUST match auth.users(id).
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email           text NOT NULL UNIQUE,
  full_name       text,
  role            text NOT NULL DEFAULT 'affiliate'
                  CHECK (role IN ('super_admin', 'network_manager', 'advertiser', 'affiliate')),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
  kyc_status      text NOT NULL DEFAULT 'not_started'
                  CHECK (kyc_status IN ('not_started', 'pending', 'verified', 'rejected')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_organization_id ON public.profiles (organization_id);
CREATE INDEX idx_profiles_role ON public.profiles (role);
CREATE INDEX idx_profiles_status ON public.profiles (status);

-- ---------------------------------------------------------------------------
-- affiliate_profiles — affiliate-specific data (1:1 with profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE public.affiliate_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  affiliate_code  text NOT NULL UNIQUE,
  traffic_sources text[] NOT NULL DEFAULT '{}',
  verticals       text[] NOT NULL DEFAULT '{}',
  geos            text[] NOT NULL DEFAULT '{}',
  payment_method  text,
  payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_affiliate_profiles_affiliate_code ON public.affiliate_profiles (affiliate_code);

-- ---------------------------------------------------------------------------
-- advertiser_profiles — advertiser-specific data (1:1 with profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE public.advertiser_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  company_name    text NOT NULL,
  website         text,
  billing_email   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- campaigns — an advertiser's campaign; offers belong to a campaign
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  owner_id        uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  name            text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  budget          numeric(12, 2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  currency        char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_campaigns_organization_id ON public.campaigns (organization_id);
CREATE INDEX idx_campaigns_owner_id ON public.campaigns (owner_id);

-- ---------------------------------------------------------------------------
-- offers — the core sellable unit
-- ---------------------------------------------------------------------------
CREATE TABLE public.offers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  advertiser_id     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  organization_id   uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  vertical          text,
  countries         text[] NOT NULL DEFAULT '{}',
  devices           text[] NOT NULL DEFAULT '{}',
  traffic_sources   text[] NOT NULL DEFAULT '{}',
  conversion_type   text NOT NULL DEFAULT 'purchase',
  payout_model      text NOT NULL CHECK (payout_model IN ('CPA', 'CPL', 'CPS', 'CPC')),
  payout            numeric(12, 2) NOT NULL DEFAULT 0 CHECK (payout >= 0),
  currency          char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  daily_cap         integer CHECK (daily_cap IS NULL OR daily_cap >= 0),
  monthly_cap       integer CHECK (monthly_cap IS NULL OR monthly_cap >= 0),
  landing_url       text NOT NULL,
  creatives         jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'expired')),
  starts_at         timestamptz,
  ends_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_offers_organization_id ON public.offers (organization_id);
CREATE INDEX idx_offers_campaign_id ON public.offers (campaign_id);
CREATE INDEX idx_offers_advertiser_id ON public.offers (advertiser_id);
CREATE INDEX idx_offers_status ON public.offers (status);
CREATE INDEX idx_offers_vertical ON public.offers (vertical);

-- ---------------------------------------------------------------------------
-- offer_applications — affiliate asks to promote an offer
-- ---------------------------------------------------------------------------
CREATE TABLE public.offer_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id        uuid NOT NULL REFERENCES public.offers (id) ON DELETE CASCADE,
  affiliate_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  message         text,
  reviewed_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, affiliate_id)
);
CREATE INDEX idx_offer_applications_offer_id ON public.offer_applications (offer_id);
CREATE INDEX idx_offer_applications_affiliate_id ON public.offer_applications (affiliate_id);

-- ---------------------------------------------------------------------------
-- affiliate_offer_access — explicit per-offer grant (for approval_required offers)
-- ---------------------------------------------------------------------------
CREATE TABLE public.affiliate_offer_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id        uuid NOT NULL REFERENCES public.offers (id) ON DELETE CASCADE,
  affiliate_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  granted         boolean NOT NULL DEFAULT true,
  granted_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, affiliate_id)
);
CREATE INDEX idx_affiliate_offer_access_offer_id ON public.affiliate_offer_access (offer_id);
CREATE INDEX idx_affiliate_offer_access_affiliate_id ON public.affiliate_offer_access (affiliate_id);

-- ---------------------------------------------------------------------------
-- tracking_links — affiliate's generated link for an offer (or a smartlink)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tracking_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  offer_id        uuid REFERENCES public.offers (id) ON DELETE SET NULL,
  campaign_id     uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  affiliate_code  text NOT NULL,
  link_code       text NOT NULL UNIQUE,
  url             text NOT NULL,
  sub1            text,
  sub2            text,
  sub3            text,
  sub4            text,
  sub5            text,
  is_smartlink    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracking_links_affiliate_id ON public.tracking_links (affiliate_id);
CREATE INDEX idx_tracking_links_offer_id ON public.tracking_links (offer_id);
CREATE INDEX idx_tracking_links_affiliate_code ON public.tracking_links (affiliate_code);

-- ---------------------------------------------------------------------------
-- clicks — one row per tracked click. Written by the tracking service
-- (service role) ONLY — see 002_rls.sql. Never written by the browser.
-- ---------------------------------------------------------------------------
CREATE TABLE public.clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id        text NOT NULL UNIQUE,
  affiliate_code  text NOT NULL,
  affiliate_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  offer_id        uuid REFERENCES public.offers (id) ON DELETE SET NULL,
  campaign_id     uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  ip              inet,
  user_agent      text,
  referrer        text,
  country         char(2),
  device          text,
  os              text,
  browser         text,
  source          text,
  sub1            text,
  sub2            text,
  sub3            text,
  sub4            text,
  sub5            text,
  is_smartlink    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clicks_offer_created ON public.clicks (offer_id, created_at DESC);
CREATE INDEX idx_clicks_affiliate_code_created ON public.clicks (affiliate_code, created_at DESC);
CREATE INDEX idx_clicks_affiliate_created ON public.clicks (affiliate_id, created_at DESC);
CREATE INDEX idx_clicks_country_created ON public.clicks (country, created_at DESC);
CREATE INDEX idx_clicks_device_created ON public.clicks (device, created_at DESC);
CREATE INDEX idx_clicks_created ON public.clicks (created_at DESC);

-- ---------------------------------------------------------------------------
-- conversions — one row per conversion event. Dedup enforced by:
--   1. idempotency_key UNIQUE (tracking service supplies it), and
--   2. partial unique index on (click_id, offer_id) for non-reversed rows,
--      so the same click cannot convert twice on the same offer unless the
--      first conversion was reversed.
-- click_id references clicks(click_id) (the public clk_... id), NOT clicks.id.
-- ---------------------------------------------------------------------------
CREATE TABLE public.conversions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id   text NOT NULL UNIQUE,
  click_id        text REFERENCES public.clicks (click_id) ON DELETE SET NULL,
  offer_id        uuid NOT NULL REFERENCES public.offers (id) ON DELETE CASCADE,
  affiliate_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  conversion_action text NOT NULL DEFAULT 'purchase',
  payout          numeric(12, 2) NOT NULL DEFAULT 0 CHECK (payout >= 0),
  currency        char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'reversed')),
  idempotency_key text NOT NULL UNIQUE,
  sub1            text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_conversions_click_offer_unique
  ON public.conversions (click_id, offer_id)
  WHERE status IN ('pending', 'approved');
CREATE INDEX idx_conversions_offer_created ON public.conversions (offer_id, created_at DESC);
CREATE INDEX idx_conversions_affiliate_created ON public.conversions (affiliate_id, created_at DESC);
CREATE INDEX idx_conversions_click_id ON public.conversions (click_id);
CREATE INDEX idx_conversions_status ON public.conversions (status);

-- ---------------------------------------------------------------------------
-- postback_configs — affiliate/advertiser postback URL templates with macros
-- e.g. https://example.com/pb?click_id={click_id}&payout={payout}&status={status}
-- Macros: {click_id} {conversion_id} {payout} {currency} {status} {sub1}
-- ---------------------------------------------------------------------------
CREATE TABLE public.postback_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  offer_id        uuid REFERENCES public.offers (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  url             text NOT NULL,
  secret          text,
  events          text[] NOT NULL DEFAULT '{conversion}',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (affiliate_id IS NOT NULL OR offer_id IS NOT NULL OR organization_id IS NOT NULL)
);
CREATE INDEX idx_postback_configs_affiliate_id ON public.postback_configs (affiliate_id);
CREATE INDEX idx_postback_configs_offer_id ON public.postback_configs (offer_id);

-- ---------------------------------------------------------------------------
-- postback_events — delivery attempts for a fired postback. Service-role only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.postback_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id       uuid REFERENCES public.conversions (id) ON DELETE SET NULL,
  postback_config_id  uuid REFERENCES public.postback_configs (id) ON DELETE SET NULL,
  url                 text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts            integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts        integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 0),
  response_status     integer,
  response_body       text,
  last_attempt_at     timestamptz,
  next_retry_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_postback_events_conversion_id ON public.postback_events (conversion_id);
CREATE INDEX idx_postback_events_config_id ON public.postback_events (postback_config_id);
CREATE INDEX idx_postback_events_status ON public.postback_events (status);

-- ---------------------------------------------------------------------------
-- commission_ledger — money owed to affiliates. Money columns are IMMUTABLE:
-- amount / affiliate / conversion / currency can never be edited and rows are
-- never deleted (see 003_functions.sql trigger). The only permitted mutation
-- is a status transition along the payout pipeline (pending -> approved ->
-- payable -> paid). Corrections are new rows (e.g. a 'reversed' entry), never
-- edits to the amount.
-- ---------------------------------------------------------------------------
CREATE TABLE public.commission_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id   uuid REFERENCES public.conversions (id) ON DELETE SET NULL,
  affiliate_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  offer_id        uuid REFERENCES public.offers (id) ON DELETE SET NULL,
  amount          numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency        char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'payable', 'paid', 'reversed', 'rejected')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_affiliate_status ON public.commission_ledger (affiliate_id, status);
CREATE INDEX idx_ledger_conversion_id ON public.commission_ledger (conversion_id);
CREATE INDEX idx_ledger_offer_id ON public.commission_ledger (offer_id);

-- ---------------------------------------------------------------------------
-- payout_requests — affiliate asks to be paid out
-- ---------------------------------------------------------------------------
CREATE TABLE public.payout_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount          numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency        char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  payment_method  text,
  payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  note            text,
  reviewed_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_requests_affiliate_id ON public.payout_requests (affiliate_id);
CREATE INDEX idx_payout_requests_status ON public.payout_requests (status);

-- ---------------------------------------------------------------------------
-- payout_transactions — actual money movement for a payout request.
-- Service-role only writes (see 002_rls.sql).
-- ---------------------------------------------------------------------------
CREATE TABLE public.payout_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id uuid NOT NULL REFERENCES public.payout_requests (id) ON DELETE CASCADE,
  affiliate_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount            numeric(12, 2) NOT NULL CHECK (amount >= 0),
  currency          char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed')),
  provider          text,
  transaction_ref   text,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_transactions_request_id ON public.payout_transactions (payout_request_id);
CREATE INDEX idx_payout_transactions_affiliate_id ON public.payout_transactions (affiliate_id);

-- ---------------------------------------------------------------------------
-- fraud_events — signals only; NEVER auto-reject a click/conversion.
-- A human (or a later review job) decides what to do with them.
-- ---------------------------------------------------------------------------
CREATE TABLE public.fraud_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id        text REFERENCES public.clicks (click_id) ON DELETE SET NULL,
  affiliate_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  offer_id        uuid REFERENCES public.offers (id) ON DELETE SET NULL,
  signal_type     text NOT NULL,
  severity        text NOT NULL DEFAULT 'low'
                  CHECK (severity IN ('low', 'medium', 'high')),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'reviewed', 'dismissed')),
  reviewed_by     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_events_affiliate_id ON public.fraud_events (affiliate_id);
CREATE INDEX idx_fraud_events_offer_id ON public.fraud_events (offer_id);
CREATE INDEX idx_fraud_events_status ON public.fraud_events (status);

-- ---------------------------------------------------------------------------
-- compliance_reviews — manual review of an entity (offer, affiliate, org...)
-- ---------------------------------------------------------------------------
CREATE TABLE public.compliance_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  reviewer_id     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  notes           text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_reviews_entity ON public.compliance_reviews (entity_type, entity_id);
CREATE INDEX idx_compliance_reviews_status ON public.compliance_reviews (status);

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------
CREATE TABLE public.support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  subject         text NOT NULL,
  description     text,
  category        text,
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_profile_id ON public.support_tickets (profile_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets (status);

-- ---------------------------------------------------------------------------
-- audit_logs — append-only record of consequential actions.
-- Only created_at (no updated_at): rows are never updated. See 002_rls.sql:
-- no INSERT policy for `authenticated`; writes go through security-definer
-- functions (003_functions.sql) or the service role.
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action          text NOT NULL,
  entity_type     text,
  entity_id       uuid,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address      inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_actor_id ON public.audit_logs (actor_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
