-- 031: fix RLS infinite recursion introduced by 030.
--
-- ROOT CAUSE (verified live 27 Nov 2026): the 030 SELECT policies contained
-- subqueries against the very tables they guard:
--   * affiliate_profiles_select_own_or_admin subqueried affiliate_profiles
--     itself  ->  every authenticated SELECT on affiliate_profiles failed
--     with 42P17 "infinite recursion detected in policy for relation
--     affiliate_profiles".
--   * profiles_select_own_or_admin subqueried affiliate_profiles, so every
--     authenticated SELECT on profiles inherited the same recursion.
--   * team_invites_select_inviter_or_invitee subqueried profiles, so every
--     authenticated SELECT on team_invites inherited it too.
-- Signed-in app reads (useAuth, wallet, profile) hit profiles +
-- affiliate_profiles on every load, so the signed-in app was broken.
--
-- FIX: same pattern as the existing my_parent_id() helper — evaluate the
-- team-membership test inside SECURITY DEFINER functions, which bypass RLS
-- for their internal query, so policy evaluation can never recurse. The
-- access semantics are UNCHANGED (own row, admin, parent-sees-team-member;
-- member still NEVER reads the parent's affiliate_profiles row, so the
-- parent's payout wallet stays unreadable):
--   * is_my_team_member(p_member) — true when the caller's profile id is
--     the parent_affiliate_id on p_member's affiliate_profiles row.
--   * my_email() — the caller's own email from profiles (replaces the
--     profiles subquery in the team_invites policy).
-- The two guard triggers (affiliate_profiles_enforce_parent_link,
-- profiles_block_team_member_approval) are untouched; their internal
-- SELECTs now resolve against the fixed policies (is_admin() / own-row
-- clauses still make the rows they need visible).

-- ---------------------------------------------------------------------------
-- Helpers (same SECURITY DEFINER pattern as my_parent_id()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_my_team_member(p_member uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affiliate_profiles
     WHERE profile_id = p_member
       AND parent_affiliate_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.my_email()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Redefined SELECT policies — same access, no self-referencing subqueries.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS affiliate_profiles_select_own_or_admin ON public.affiliate_profiles;
CREATE POLICY affiliate_profiles_select_own_or_admin ON public.affiliate_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR profile_id = auth.uid()
      OR public.is_my_team_member(profile_id));

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR id = auth.uid()
      OR public.is_my_team_member(id));

DROP POLICY IF EXISTS team_invites_select_inviter_or_invitee ON public.team_invites;
CREATE POLICY team_invites_select_inviter_or_invitee ON public.team_invites
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR inviter_id = auth.uid()
      OR lower(invited_email) = lower(public.my_email()));
