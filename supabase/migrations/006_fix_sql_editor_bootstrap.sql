-- ============================================================================
-- AffiLayer — supabase/migrations/006_fix_sql_editor_bootstrap.sql
--
-- Fixes a bug in 005's profiles_enforce_role_status(): the privileged
-- bypass checked only auth.role() IN ('service_role', 'postgres'). In the
-- Supabase dashboard SQL editor there is no JWT, so auth.role() and
-- auth.uid() are both NULL even though the session runs as the postgres
-- superuser (current_user = 'postgres'). The trigger therefore treated
-- the SQL editor as an unprivileged actor and silently rewrote every
-- UPDATE of role/status back to the safe defaults — the first
-- super_admin promotion reported "Success" while changing nothing
-- (verified live 8 Nov 2026: two UPDATEs, role stayed 'affiliate').
--
-- Fix: also treat current_user = 'postgres' as privileged. The function
-- is SECURITY INVOKER, so current_user is the real session user:
-- 'postgres' only for the SQL editor / direct superuser connections
-- (which already have full database access), 'authenticated' / 'anon'
-- for app users via PostgREST, 'service_role' for the service key.
-- App-user behavior is unchanged: a self-escalating affiliate still
-- reads as 'affiliate' and gets the defaults forced.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.profiles_enforce_role_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose (see 005 header note).
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Privileged callers may set any values: the service key, the
  -- Supabase SQL editor / direct postgres connections (seed, bootstrap),
  -- and any session running as the postgres superuser.
  IF current_user = 'postgres' OR auth.role() IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  -- An EXISTING admin (stored role, read here before the row is written)
  -- may change role / status / kyc_status — this is how approvals happen.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'network_manager')
  ) THEN
    RETURN NEW;
  END IF;

  -- Everyone else: privileged fields are forced to safe defaults.
  -- Ordinary profile edits (full_name, organization_id, ...) pass through.
  NEW.role := 'affiliate';
  NEW.status := 'pending';
  NEW.kyc_status := 'not_started';
  RETURN NEW;
END;
$$;
