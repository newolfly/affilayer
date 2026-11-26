-- 030: team-member sub-panel (design doc:
-- ~/workspace/work/affilayer-team-subpanel-design-2026-11-26.md)
--
-- A team member is an ordinary affiliate whose affiliate_profiles row points
-- at a parent affiliate. The member's tracking links carry the PARENT's
-- affiliate code, so every click, conversion and ledger row lands on the
-- parent's profile id. The member never touches the parent's money.
--
-- NOTES ON THIS FILE vs THE DOC:
-- * §1 (data model), §2 handle_new_user extension, §3 guard triggers,
--   helpers and RLS redefinitions are the doc's SQL verbatim.
-- * §2d gives NO SQL for the five invite RPCs — only prose checks. The RPC
--   bodies below implement exactly those prose checks (nothing added).
-- * cancel_team_invite() is an extra RPC (not in §2d's table) because §4
--   specifies a "Cancel invite" action and there is deliberately no UPDATE
--   policy for authenticated on team_invites — without it, cancelling would
--   be impossible. Same checks/style as the other RPCs.
-- * Every log_audit call is best-effort (BEGIN/EXCEPTION swallow): the live
--   log_audit definition (verified 26 Nov 2026) raises for non-admin callers
--   even inside a SECURITY DEFINER RPC, so a logging failure must never
--   block an invite/accept/decline/remove/leave/cancel. (Doc §2d flag.)
-- * No Worker or web-app change in this migration.

-- ---------------------------------------------------------------------------
-- 1a. The link: a team member is an affiliate whose affiliate_profiles row
--     points at a parent affiliate (a profiles id). NULL = standalone.
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliate_profiles
  ADD COLUMN IF NOT EXISTS parent_affiliate_id uuid
    REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_linked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_affiliate_profiles_parent
  ON public.affiliate_profiles (parent_affiliate_id);

-- A parent can never be their own member.
ALTER TABLE public.affiliate_profiles
  ADD CONSTRAINT affiliate_profiles_parent_not_self
  CHECK (parent_affiliate_id IS NULL OR parent_affiliate_id <> profile_id);

-- ---------------------------------------------------------------------------
-- 1b. Pending invites: one row per invitation. The token is what the
--     invite link carries; the email binding is what makes a leaked
--     token useless (see §2).
-- ---------------------------------------------------------------------------
CREATE TABLE public.team_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  token         text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_invites_inviter
  ON public.team_invites (inviter_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_email
  ON public.team_invites (lower(invited_email));
-- One live invite per (inviter, email).
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_one_live
  ON public.team_invites (inviter_id, lower(invited_email))
  WHERE status = 'pending';

CREATE TRIGGER trg_team_invites_updated_at
  BEFORE UPDATE ON public.team_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Extension of handle_new_user() (migration 005). Only the tail is new;
--    the profiles INSERT is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token  text;
  v_invite public.team_invites%ROWTYPE;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, kyc_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    'affiliate',
    'pending',
    'not_started'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Team invite (migration 030): link the new affiliate to the inviter
  -- when the signup carried a valid, unexpired invite for this email.
  -- A bad/expired/mismatched token is ignored — signup still succeeds
  -- as a standalone affiliate.
  v_token := NULLIF(btrim(NEW.raw_user_meta_data ->> 'team_invite'), '');
  IF v_token IS NOT NULL THEN
    SELECT * INTO v_invite
      FROM public.team_invites
     WHERE token = v_token
       AND lower(invited_email) = lower(NEW.email)
       AND status = 'pending'
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1;
    IF FOUND AND EXISTS (
      SELECT 1
        FROM public.profiles p
        JOIN public.affiliate_profiles ap ON ap.profile_id = p.id
       WHERE p.id = v_invite.inviter_id
         AND p.role = 'affiliate'
         AND p.status = 'approved'
         AND ap.parent_affiliate_id IS NULL
    ) THEN
      UPDATE public.affiliate_profiles
         SET parent_affiliate_id = v_invite.inviter_id,
             parent_linked_at = now()
       WHERE profile_id = NEW.id;
      UPDATE public.team_invites
         SET status = 'accepted', accepted_at = now()
       WHERE id = v_invite.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helpers (same SECURITY DEFINER pattern as current_affiliate_code()).
-- ---------------------------------------------------------------------------
-- The caller's parent, or NULL when standalone.
CREATE OR REPLACE FUNCTION public.my_parent_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT parent_affiliate_id
    FROM public.affiliate_profiles
   WHERE profile_id = auth.uid();
$$;

-- Team context for the app: parent id + code + email, or JSON null.
-- Returns the code only — never the parent's payout wallet.
CREATE OR REPLACE FUNCTION public.my_team_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent uuid;
  v_code   text;
  v_email  text;
BEGIN
  SELECT parent_affiliate_id INTO v_parent
    FROM public.affiliate_profiles WHERE profile_id = auth.uid();
  IF v_parent IS NULL THEN RETURN 'null'::jsonb; END IF;
  SELECT ap.affiliate_code, p.email INTO v_code, v_email
    FROM public.affiliate_profiles ap
    JOIN public.profiles p ON p.id = ap.profile_id
   WHERE ap.profile_id = v_parent;
  RETURN jsonb_build_object(
    'parent_id', v_parent, 'parent_code', v_code, 'parent_email', v_email);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2d. Invite RPCs (all SECURITY DEFINER, SET search_path = public, pg_temp).
-- Bodies implement the §2a / §2c prose checks exactly; the doc gives no SQL
-- for these. Every log_audit call is best-effort (see file header).
-- ---------------------------------------------------------------------------

-- create_team_invite(p_email) -> jsonb {invite_id, token, invite_url}
-- Caller: approved affiliate with no parent of their own.
CREATE OR REPLACE FUNCTION public.create_team_invite(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_email        text;
  v_caller_email text;
  v_members      int;
  v_pending      int;
  v_invite_id    uuid;
  v_token        text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_team_invite: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.affiliate_profiles ap ON ap.profile_id = p.id
     WHERE p.id = v_caller
       AND p.role = 'affiliate'
       AND p.status = 'approved'
       AND ap.parent_affiliate_id IS NULL
  ) THEN
    RAISE EXCEPTION 'create_team_invite: only approved affiliates without a team of their own can invite'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email = '' OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'create_team_invite: a valid email address is required'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
  IF lower(v_caller_email) = v_email THEN
    RAISE EXCEPTION 'create_team_invite: you cannot invite yourself'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.affiliate_profiles ap ON ap.profile_id = p.id
     WHERE ap.parent_affiliate_id = v_caller
       AND lower(p.email) = v_email
  ) THEN
    RAISE EXCEPTION 'create_team_invite: % is already on your team', v_email
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.team_invites
     WHERE inviter_id = v_caller
       AND lower(invited_email) = v_email
       AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'create_team_invite: a pending invite already exists for %', v_email
      USING ERRCODE = 'check_violation';
  END IF;
  -- Team size cap (§2a): members + pending invites < 50.
  SELECT COUNT(*) INTO v_members
    FROM public.affiliate_profiles WHERE parent_affiliate_id = v_caller;
  SELECT COUNT(*) INTO v_pending
    FROM public.team_invites WHERE inviter_id = v_caller AND status = 'pending';
  IF v_members + v_pending >= 50 THEN
    RAISE EXCEPTION 'create_team_invite: team limit reached (50 members + pending invites)'
      USING ERRCODE = 'check_violation';
  END IF;
  v_token := gen_random_uuid()::text;
  INSERT INTO public.team_invites (inviter_id, invited_email, token)
  VALUES (v_caller, v_email, v_token)
  RETURNING id INTO v_invite_id;
  BEGIN
    PERFORM public.log_audit(v_caller, 'team_invite_created', 'team_invites',
      v_invite_id, jsonb_build_object('email', v_email));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object(
    'invite_id', v_invite_id,
    'token', v_token,
    'invite_url', 'https://affilayer.com/register?team=' || v_token);
END;
$$;

-- accept_team_invite(p_invite_id) -> text
-- Caller: the invited affiliate (§2c).
CREATE OR REPLACE FUNCTION public.accept_team_invite(p_invite_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_invite        public.team_invites%ROWTYPE;
  v_caller_email  text;
  v_caller_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'accept_team_invite: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_invite FROM public.team_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_team_invite: invite not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- Lazy expiry (§1b): a pending invite past expires_at becomes 'expired'.
  IF v_invite.status = 'pending' AND v_invite.expires_at <= now() THEN
    UPDATE public.team_invites SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'accept_team_invite: this invite has expired'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'accept_team_invite: this invite is no longer pending (status %)', v_invite.status
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT email, status INTO v_caller_email, v_caller_status
    FROM public.profiles WHERE id = v_caller;
  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'accept_team_invite: profile not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF lower(v_invite.invited_email) <> lower(v_caller_email) THEN
    RAISE EXCEPTION 'accept_team_invite: this invite was sent to a different email address'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'affiliate') THEN
    RAISE EXCEPTION 'accept_team_invite: only affiliates can join a team'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.affiliate_profiles
              WHERE profile_id = v_caller AND parent_affiliate_id IS NOT NULL) THEN
    RAISE EXCEPTION 'accept_team_invite: you are already on a team'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.affiliate_profiles WHERE parent_affiliate_id = v_caller) THEN
    RAISE EXCEPTION 'accept_team_invite: you already have team members of your own'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.affiliate_profiles ap ON ap.profile_id = p.id
     WHERE p.id = v_invite.inviter_id
       AND p.role = 'affiliate'
       AND p.status = 'approved'
       AND ap.parent_affiliate_id IS NULL
  ) THEN
    RAISE EXCEPTION 'accept_team_invite: the inviter is no longer an approved affiliate'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.affiliate_profiles
     SET parent_affiliate_id = v_invite.inviter_id,
         parent_linked_at = now()
   WHERE profile_id = v_caller;
  -- §2c: a previously approved standalone affiliate goes back to 'pending'
  -- on joining, so their own code stops passing the 022 gate.
  IF v_caller_status = 'approved' THEN
    UPDATE public.profiles SET status = 'pending' WHERE id = v_caller;
  END IF;
  UPDATE public.team_invites
     SET status = 'accepted', accepted_at = now()
   WHERE id = v_invite.id;
  BEGIN
    PERFORM public.log_audit(v_caller, 'team_invite_accepted', 'team_invites',
      v_invite.id, jsonb_build_object('inviter_id', v_invite.inviter_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 'accepted';
END;
$$;

-- decline_team_invite(p_invite_id) -> text
-- Caller: the invited affiliate (§2c).
CREATE OR REPLACE FUNCTION public.decline_team_invite(p_invite_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_invite       public.team_invites%ROWTYPE;
  v_caller_email text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'decline_team_invite: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_invite FROM public.team_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decline_team_invite: invite not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_invite.status = 'pending' AND v_invite.expires_at <= now() THEN
    UPDATE public.team_invites SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'decline_team_invite: this invite has expired'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'decline_team_invite: this invite is no longer pending (status %)', v_invite.status
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
  IF v_caller_email IS NULL OR lower(v_invite.invited_email) <> lower(v_caller_email) THEN
    RAISE EXCEPTION 'decline_team_invite: this invite was sent to a different email address'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.team_invites SET status = 'declined' WHERE id = v_invite.id;
  BEGIN
    PERFORM public.log_audit(v_caller, 'team_invite_declined', 'team_invites',
      v_invite.id, jsonb_build_object('inviter_id', v_invite.inviter_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 'declined';
END;
$$;

-- remove_team_member(p_member_id) -> text
-- Caller: the member's parent (§4). Clears the link and nothing else.
CREATE OR REPLACE FUNCTION public.remove_team_member(p_member_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'remove_team_member: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.affiliate_profiles
     WHERE profile_id = p_member_id AND parent_affiliate_id = v_caller
  ) THEN
    RAISE EXCEPTION 'remove_team_member: this affiliate is not on your team'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.affiliate_profiles
     SET parent_affiliate_id = NULL,
         parent_linked_at = NULL
   WHERE profile_id = p_member_id;
  BEGIN
    PERFORM public.log_audit(v_caller, 'team_member_removed', 'affiliate_profiles',
      p_member_id, jsonb_build_object('member_id', p_member_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 'removed';
END;
$$;

-- leave_team() -> text
-- Caller: a member (§4). Clears their own link and nothing else.
CREATE OR REPLACE FUNCTION public.leave_team()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_parent uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'leave_team: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT parent_affiliate_id INTO v_parent
    FROM public.affiliate_profiles WHERE profile_id = v_caller;
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'leave_team: you are not on a team'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.affiliate_profiles
     SET parent_affiliate_id = NULL,
         parent_linked_at = NULL
   WHERE profile_id = v_caller;
  BEGIN
    PERFORM public.log_audit(v_caller, 'team_left', 'affiliate_profiles',
      v_caller, jsonb_build_object('parent_id', v_parent));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 'left';
END;
$$;

-- cancel_team_invite(p_invite_id) -> text
-- Caller: the inviter (§4 "Cancel invite"). Not in §2d's table; see header.
CREATE OR REPLACE FUNCTION public.cancel_team_invite(p_invite_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_invite public.team_invites%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'cancel_team_invite: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_invite FROM public.team_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_team_invite: invite not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_invite.inviter_id <> v_caller THEN
    RAISE EXCEPTION 'cancel_team_invite: only the inviter can cancel this invite'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'cancel_team_invite: this invite is no longer pending (status %)', v_invite.status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.team_invites SET status = 'cancelled' WHERE id = v_invite.id;
  BEGIN
    PERFORM public.log_audit(v_caller, 'team_invite_cancelled', 'team_invites',
      v_invite.id, jsonb_build_object('email', v_invite.invited_email));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 'cancelled';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Guard triggers.
-- ---------------------------------------------------------------------------

-- The critical guard: nobody may set their own parent link.
CREATE OR REPLACE FUNCTION public.affiliate_profiles_enforce_parent_link()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose (same reasoning as profiles_enforce_role_status):
-- the admin check reads the actor's STORED role.
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Privileged callers may set the link: the service key, direct postgres
  -- connections, and the SECURITY DEFINER RPCs / trigger functions (which
  -- run as their owner, postgres, so current_user is 'postgres' there).
  IF current_user = 'postgres' OR auth.role() IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'network_manager')
  ) THEN
    RETURN NEW;
  END IF;
  -- Everyone else: the team link is read-only. The team RPCs and the
  -- signup trigger run as postgres (above) and are unaffected.
  IF TG_OP = 'INSERT' AND NEW.parent_affiliate_id IS NOT NULL THEN
    RAISE EXCEPTION 'affiliate_profiles: team link can only be set by the team system'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE'
     AND (OLD.parent_affiliate_id IS DISTINCT FROM NEW.parent_affiliate_id
          OR OLD.parent_linked_at IS DISTINCT FROM NEW.parent_linked_at) THEN
    RAISE EXCEPTION 'affiliate_profiles: team link can only be changed by the team system'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS affiliate_profiles_enforce_parent_link ON public.affiliate_profiles;
CREATE TRIGGER affiliate_profiles_enforce_parent_link
  BEFORE INSERT OR UPDATE ON public.affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_profiles_enforce_parent_link();

-- The second guard: an admin cannot approve a team member standalone.
CREATE OR REPLACE FUNCTION public.profiles_block_team_member_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'postgres' OR auth.role() IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved'
     AND EXISTS (
       SELECT 1 FROM public.affiliate_profiles ap
       WHERE ap.profile_id = NEW.id AND ap.parent_affiliate_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'profiles: this affiliate is on a team — remove them from the team before approving them standalone'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_team_member_approval ON public.profiles;
CREATE TRIGGER profiles_block_team_member_approval
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_team_member_approval();

-- ---------------------------------------------------------------------------
-- 3. Exact RLS changes. Each redefinition is the current live policy plus
--    one added OR clause (verified against live pg_policies, 26 Nov 2026).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS clicks_select_owner_or_org_or_admin ON public.clicks;
CREATE POLICY clicks_select_owner_or_org_or_admin ON public.clicks
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR affiliate_code = public.current_affiliate_code()
      OR affiliate_id = public.my_parent_id()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = clicks.offer_id
                   AND public.is_org_member(o.organization_id)));

DROP POLICY IF EXISTS conversions_select_owner_or_org_or_admin ON public.conversions;
CREATE POLICY conversions_select_owner_or_org_or_admin ON public.conversions
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR affiliate_id = public.my_parent_id()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = conversions.offer_id
                   AND public.is_org_member(o.organization_id)));

DROP POLICY IF EXISTS commission_ledger_select_owner_or_org_or_admin ON public.commission_ledger;
CREATE POLICY commission_ledger_select_owner_or_org_or_admin ON public.commission_ledger
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR affiliate_id = public.my_parent_id()
      OR EXISTS (SELECT 1 FROM public.offers o
                 WHERE o.id = commission_ledger.offer_id
                   AND public.is_org_member(o.organization_id)));

DROP POLICY IF EXISTS tracking_links_select_own_or_admin ON public.tracking_links;
CREATE POLICY tracking_links_select_own_or_admin ON public.tracking_links
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR affiliate_id = auth.uid()
      OR affiliate_id = public.my_parent_id());

-- Parent reads MEMBERS' profile rows (member list: email, name, status) and
-- members' affiliate_profiles rows (date added = parent_linked_at).
-- ONE-DIRECTIONAL: there is deliberately NO reciprocal clause letting a
-- member read the parent's rows. The parent's wallet stays unreadable.
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR id = auth.uid()
      OR id IN (SELECT profile_id FROM public.affiliate_profiles
                WHERE parent_affiliate_id = auth.uid()));

DROP POLICY IF EXISTS affiliate_profiles_select_own_or_admin ON public.affiliate_profiles;
CREATE POLICY affiliate_profiles_select_own_or_admin ON public.affiliate_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR profile_id = auth.uid()
      OR profile_id IN (SELECT profile_id FROM public.affiliate_profiles ap
                        WHERE ap.parent_affiliate_id = auth.uid()));

-- Invites: the inviter and the invited email may read the row.
-- NO INSERT / UPDATE / DELETE policy for authenticated: all invite writes
-- go through the SECURITY DEFINER RPCs (§2d).
CREATE POLICY team_invites_select_inviter_or_invitee ON public.team_invites
  FOR SELECT TO authenticated
  USING (public.is_admin()
      OR inviter_id = auth.uid()
      OR lower(invited_email) = lower(
           (SELECT email FROM public.profiles WHERE id = auth.uid())));
