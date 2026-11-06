-- ============================================================================
-- AffiLayer — 002_rls.sql
-- Row Level Security for every user-facing table.
--
-- Model:
--   * A user sees only their own rows: auth.uid() = <owner column>, or
--     membership of the row's organization (profiles.organization_id).
--   * super_admin / network_manager see everything (via is_admin()).
--   * Tracking / financial write tables (clicks, conversions,
--     commission_ledger, postback_events, payout_transactions) have NO
--     INSERT / UPDATE / DELETE policy for `authenticated` at all: only the
--     service role (tracking service, payout jobs, security-definer
--     functions in 003) can write them. SELECT is allowed for owners/admins.
--   * audit_logs has NO INSERT policy for `authenticated`: rows are written
--     only by security-definer functions (003) or the service role; SELECT
--     is admins-only.
--
-- NOTE: RLS policies are the access gate, but Postgres GRANTs are the outer
-- gate. The GRANTs at the bottom give `authenticated` table-level access;
-- without a matching policy every statement is still denied by RLS.
-- Verify all of this against a real project — see tests/rls-checks.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS when reading
-- profiles — otherwise a policy on profiles that calls is_admin() would
-- recurse into itself).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'network_manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = p_org_id
    );
$$;

-- Affiliate's own affiliate_code (used by click SELECT policies).
CREATE OR REPLACE FUNCTION public.current_affiliate_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ap.affiliate_code
  FROM public.affiliate_profiles ap
  WHERE ap.profile_id = auth.uid();
$$;

-- ============================================================================
-- organizations
-- ============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_member_or_admin ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_org_member(id));

-- Any signed-in user may create their org during onboarding; admins may edit.
CREATE POLICY organizations_insert_authenticated ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY organizations_update_member_or_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_org_member(id))
  WITH CHECK (public.is_admin() OR public.is_org_member(id));
-- No DELETE policy for authenticated: orgs are deleted by admins via service role only.

-- ============================================================================
-- profiles
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() OR id = auth.uid());

-- A new user inserts exactly their own row (id must equal auth.uid()).
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own_or_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (public.is_admin() OR id = auth.uid());
-- No DELETE policy for authenticated.

-- ============================================================================
-- affiliate_profiles
-- ============================================================================
ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY affiliate_profiles_select_own_or_admin ON public.affiliate_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() OR profile_id = auth.uid());

CREATE POLICY affiliate_profiles_insert_own ON public.affiliate_profiles
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

CREATE POLICY affiliate_profiles_update_own_or_admin ON public.affiliate_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR profile_id = auth.uid())
  WITH CHECK (public.is_admin() OR profile_id = auth.uid());
-- No DELETE policy for authenticated.

-- ============================================================================
-- advertiser_profiles
-- ============================================================================
ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY advertiser_profiles_select_own_or_admin ON public.advertiser_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() OR profile_id = auth.uid());

CREATE POLICY advertiser_profiles_insert_own ON public.advertiser_profiles
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

CREATE POLICY advertiser_profiles_update_own_or_admin ON public.advertiser_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR profile_id = auth.uid())
  WITH CHECK (public.is_admin() OR profile_id = auth.uid());
-- No DELETE policy for authenticated.

-- ============================================================================
-- campaigns — owned by the advertiser org that created them
-- ============================================================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select_member_or_admin ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR public.is_org_member(organization_id)
      OR owner_id = auth.uid());

CREATE POLICY campaigns_insert_member ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_org_member(organization_id));

CREATE POLICY campaigns_update_member_or_admin ON public.campaigns
  FOR UPDATE TO authenticated
  USING (public.is_admin()
      OR public.is_org_member(organization_id)
      OR owner_id = auth.uid())
  WITH CHECK (public.is_admin()
      OR public.is_org_member(organization_id)
      OR owner_id = auth.uid());

CREATE POLICY campaigns_delete_member_or_admin ON public.campaigns
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_org_member(organization_id));

-- ============================================================================
-- offers — org members + owner see all their offers; any signed-in user may
-- browse ACTIVE offers (the marketplace catalogue); admins see all.
-- ============================================================================
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY offers_select_own_org_or_admin ON public.offers
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR public.is_org_member(organization_id)
      OR advertiser_id = auth.uid());

CREATE POLICY offers_select_active_catalogue ON public.offers
  FOR SELECT TO authenticated
  USING (status = 'active');

CREATE POLICY offers_insert_member ON public.offers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_org_member(organization_id));

CREATE POLICY offers_update_member_or_admin ON public.offers
  FOR UPDATE TO authenticated
  USING (public.is_admin()
      OR public.is_org_member(organization_id)
      OR advertiser_id = auth.uid())
  WITH CHECK (public.is_admin()
      OR public.is_org_member(organization_id)
      OR advertiser_id = auth.uid());

CREATE POLICY offers_delete_member_or_admin ON public.offers
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_org_member(organization_id));

-- ============================================================================
-- offer_applications
-- ============================================================================
ALTER TABLE public.offer_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY offer_applications_select_own_or_org_or_admin ON public.offer_applications
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = offer_applications.offer_id
                   AND public.is_org_member(o.organization_id)));

CREATE POLICY offer_applications_insert_own ON public.offer_applications
  FOR INSERT TO authenticated WITH CHECK (affiliate_id = auth.uid());

-- Review (approve/reject) by the offer's org or an admin; affiliate may not
-- edit their own application after submitting it.
CREATE POLICY offer_applications_update_org_or_admin ON public.offer_applications
  FOR UPDATE TO authenticated
  USING (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = offer_applications.offer_id
                   AND public.is_org_member(o.organization_id)))
  WITH CHECK (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = offer_applications.offer_id
                   AND public.is_org_member(o.organization_id)));

CREATE POLICY offer_applications_delete_own_or_admin ON public.offer_applications
  FOR DELETE TO authenticated
  USING (public.is_admin() OR affiliate_id = auth.uid());

-- ============================================================================
-- affiliate_offer_access
-- ============================================================================
ALTER TABLE public.affiliate_offer_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY affiliate_offer_access_select_own_or_org_or_admin ON public.affiliate_offer_access
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = affiliate_offer_access.offer_id
                   AND public.is_org_member(o.organization_id)));

-- Grants are made by the offer's org or an admin — never by the affiliate.
CREATE POLICY affiliate_offer_access_insert_org_or_admin ON public.affiliate_offer_access
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = affiliate_offer_access.offer_id
                   AND public.is_org_member(o.organization_id)));

CREATE POLICY affiliate_offer_access_update_org_or_admin ON public.affiliate_offer_access
  FOR UPDATE TO authenticated
  USING (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = affiliate_offer_access.offer_id
                   AND public.is_org_member(o.organization_id)))
  WITH CHECK (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = affiliate_offer_access.offer_id
                   AND public.is_org_member(o.organization_id)));

CREATE POLICY affiliate_offer_access_delete_org_or_admin ON public.affiliate_offer_access
  FOR DELETE TO authenticated
  USING (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = affiliate_offer_access.offer_id
                   AND public.is_org_member(o.organization_id)));

-- ============================================================================
-- tracking_links
-- ============================================================================
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY tracking_links_select_own_or_admin ON public.tracking_links
  FOR SELECT TO authenticated
  USING (public.is_admin() OR affiliate_id = auth.uid());

CREATE POLICY tracking_links_insert_own ON public.tracking_links
  FOR INSERT TO authenticated WITH CHECK (affiliate_id = auth.uid());

CREATE POLICY tracking_links_update_own_or_admin ON public.tracking_links
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR affiliate_id = auth.uid())
  WITH CHECK (public.is_admin() OR affiliate_id = auth.uid());

CREATE POLICY tracking_links_delete_own_or_admin ON public.tracking_links
  FOR DELETE TO authenticated
  USING (public.is_admin() OR affiliate_id = auth.uid());

-- ============================================================================
-- clicks — SERVICE-ROLE ONLY writes.
-- No INSERT / UPDATE / DELETE policy for `authenticated`: any such statement
-- is denied by RLS even though the GRANTs below allow the operation.
-- SELECT: the affiliate (by affiliate_id or affiliate_code), the offer's
-- org members, and admins.
-- ============================================================================
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY clicks_select_owner_or_org_or_admin ON public.clicks
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR affiliate_code = public.current_affiliate_code()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = clicks.offer_id
                   AND public.is_org_member(o.organization_id)));

-- ============================================================================
-- conversions — SERVICE-ROLE ONLY writes (same rule as clicks).
-- SELECT: the affiliate, the offer's org members, and admins.
-- Status changes go through approve_conversion / reject_conversion (003).
-- ============================================================================
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversions_select_owner_or_org_or_admin ON public.conversions
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = conversions.offer_id
                   AND public.is_org_member(o.organization_id)));

-- ============================================================================
-- postback_configs
-- ============================================================================
ALTER TABLE public.postback_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY postback_configs_select_own_or_org_or_admin ON public.postback_configs
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR public.is_org_member(organization_id)
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = postback_configs.offer_id
                   AND public.is_org_member(o.organization_id)));

CREATE POLICY postback_configs_insert_own ON public.postback_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin()
      OR affiliate_id = auth.uid()
      OR public.is_org_member(organization_id));

CREATE POLICY postback_configs_update_own_or_admin ON public.postback_configs
  FOR UPDATE TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR public.is_org_member(organization_id))
  WITH CHECK (public.is_admin()
      OR affiliate_id = auth.uid()
      OR public.is_org_member(organization_id));

CREATE POLICY postback_configs_delete_own_or_admin ON public.postback_configs
  FOR DELETE TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR public.is_org_member(organization_id));

-- ============================================================================
-- postback_events — SERVICE-ROLE ONLY writes (same rule as clicks).
-- SELECT: owner of the config, the offer's org members, and admins.
-- ============================================================================
ALTER TABLE public.postback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY postback_events_select_owner_or_org_or_admin ON public.postback_events
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR EXISTS (SELECT 1 FROM public.postback_configs pc
                 WHERE pc.id = postback_events.postback_config_id
                   AND (pc.affiliate_id = auth.uid()
                        OR public.is_org_member(pc.organization_id)))
      OR EXISTS (SELECT 1 FROM public.conversions c
                   JOIN public.offers o ON o.id = c.offer_id
                 WHERE c.id = postback_events.conversion_id
                   AND (c.affiliate_id = auth.uid()
                        OR public.is_org_member(o.organization_id))));

-- ============================================================================
-- commission_ledger — SERVICE-ROLE ONLY writes (same rule as clicks).
-- The immutable-ledger trigger in 003 also blocks edits to money columns
-- and DELETEs for everyone, including the service role; only sanctioned
-- status transitions are allowed. SELECT: the affiliate, the offer's org, admins.
-- ============================================================================
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY commission_ledger_select_owner_or_org_or_admin ON public.commission_ledger
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = commission_ledger.offer_id
                   AND public.is_org_member(o.organization_id)));

-- ============================================================================
-- payout_requests
-- ============================================================================
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_requests_select_own_or_admin ON public.payout_requests
  FOR SELECT TO authenticated
  USING (public.is_admin() OR affiliate_id = auth.uid());

CREATE POLICY payout_requests_insert_own ON public.payout_requests
  FOR INSERT TO authenticated WITH CHECK (affiliate_id = auth.uid());

-- Review (approve/reject/mark paid) is admins-only; the affiliate may not
-- change the amount or status of their own request after submitting it.
CREATE POLICY payout_requests_update_admin ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- No DELETE policy for authenticated.

-- ============================================================================
-- payout_transactions — SERVICE-ROLE ONLY writes (same rule as clicks).
-- SELECT: the affiliate and admins.
-- ============================================================================
ALTER TABLE public.payout_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_transactions_select_own_or_admin ON public.payout_transactions
  FOR SELECT TO authenticated
  USING (public.is_admin() OR affiliate_id = auth.uid());

-- ============================================================================
-- fraud_events — signals are visible to the affected affiliate, the offer's
-- org, and admins. Writes are admins-only (system writes via service role).
-- ============================================================================
ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY fraud_events_select_owner_or_org_or_admin ON public.fraud_events
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = fraud_events.offer_id
                   AND public.is_org_member(o.organization_id)));

CREATE POLICY fraud_events_insert_admin ON public.fraud_events
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY fraud_events_update_admin ON public.fraud_events
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- No DELETE policy for authenticated.

-- ============================================================================
-- compliance_reviews — admins only (all operations). The entity being
-- reviewed is identified only by (entity_type, entity_id), so owner-based
-- access cannot be resolved safely here.
-- ============================================================================
ALTER TABLE public.compliance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_reviews_admin_all ON public.compliance_reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- support_tickets
-- ============================================================================
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_select_own_or_assigned_or_admin ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR profile_id = auth.uid()
      OR assigned_to = auth.uid()
      OR public.is_org_member(organization_id));

CREATE POLICY support_tickets_insert_own ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

CREATE POLICY support_tickets_update_own_or_assigned_or_admin ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin()
      OR profile_id = auth.uid()
      OR assigned_to = auth.uid())
  WITH CHECK (public.is_admin()
      OR profile_id = auth.uid()
      OR assigned_to = auth.uid());
-- No DELETE policy for authenticated.

-- ============================================================================
-- audit_logs — ADMINS-ONLY SELECT, NO INSERT/UPDATE/DELETE for authenticated.
-- Rows are written by security-definer functions (003_functions.sql) or the
-- service role. This is deliberate: if the browser could write audit rows,
-- the audit trail would be worthless.
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================================
-- GRANTs — table-level access for `authenticated`. RLS policies above are
-- still the real gate: a GRANT without a policy still denies the statement.
-- `anon` gets no grants: public pages must not query the database directly.
-- The service role bypasses RLS entirely (by design — it is the trusted
-- backend) and needs no grants listed here.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
