-- ============================================================================
-- AffiLayer — supabase/migrations/020_restrict_organization_creation_to_admins.sql
--
-- L-07 (forensic audit 9 Nov 2026) — any authenticated user could create
-- unlimited organizations: organizations_insert_authenticated had
-- WITH CHECK (true).
--   Fix: restrict INSERT on organizations to admins (is_admin()).
--   Choice documented (per the audit's L-07 note, "org-creation rate
--   limiting" was the only suggested softening — a hard admin-only
--   gate is used instead, because no legitimate non-admin flow needs
--   it):
--     * Repo-wide grep (9 Nov 2026) finds NO code path that creates an
--       organization: no .from('organizations').insert() anywhere in
--       apps/web, services, or packages, and no onboarding/signup
--       trigger inserts one. Signup/onboarding creates a profiles row
--       (+ affiliate_profiles via 009) only; an account with no
--       organization is told "Ask an admin to assign your account to
--       an organization" (apps/web/src/lib/data.ts createOffer).
--       The 002 comment ("any signed-in user may create their org
--       during onboarding") describes an intent that was never built.
--     * The only organizations live are the seeded Test Org
--       (aaaaaaaa-0000-4000-8000-000000000101) and any future ones an
--       admin creates via dashboard SQL / a future admin UI.
--     * The service role bypasses RLS entirely, so backend/admin
--       tooling is unaffected; only the authenticated-role INSERT
--       path is gated.
--   SELECT/UPDATE policies are unchanged (member-or-admin).
-- ============================================================================

DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;

CREATE POLICY organizations_insert_admin ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
