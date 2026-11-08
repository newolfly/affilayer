-- ============================================================================
-- AffiLayer — supabase/migrations/009_affiliate_code_on_signup.sql
--
-- Go-live blocker (audit 7 Nov 2026, found in re-audit 8 Nov) — nothing
-- created affiliate_profiles rows on signup, so a real affiliate had no
-- affiliate_code and could not generate tracking links; code-based
-- matching fell back to the demo code 'AFF-DEMO-001'. The web app only
-- ever SELECTs affiliate_profiles (data.ts) — it never inserts one.
--
-- This migration makes the database assign the code at signup:
--   * generate_affiliate_code() — 'AFF-' + 6 chars from an unambiguous
--     alphabet (no 0/O/1/I), retried until unique (affiliate_code is
--     UNIQUE; collisions are near-impossible at this volume).
--   * assign_affiliate_code() — SECURITY DEFINER trigger function, same
--     pattern as 007/008: on profiles INSERT, or on a role change TO
--     'affiliate', insert the affiliate_profiles row (ON CONFLICT
--     (profile_id) DO NOTHING, so a row created any other way wins).
--   * Backfill — any affiliate-role profile that still lacks a row gets
--     one (today: none besides the labelled test affiliate, which
--     already has AFF-TEST-001).
--
-- The code is an identifier, not an approval: a pending affiliate gets
-- a code at signup, exactly like the demo flow assumes. Approval gating
-- (who may run traffic / get paid) lives in the app + the 007 RPCs and
-- is unchanged by this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_affiliate_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text;
  tries int := 0;
BEGIN
  LOOP
    code := 'AFF-' || (
      SELECT string_agg(substr(chars, (random() * length(chars))::int + 1, 1), '')
      FROM generate_series(1, 6)
    );
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.affiliate_profiles WHERE affiliate_code = code
    );
    tries := tries + 1;
    IF tries > 20 THEN
      RAISE EXCEPTION 'could not generate a unique affiliate code';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_affiliate_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'affiliate' THEN
    INSERT INTO public.affiliate_profiles (profile_id, affiliate_code)
    VALUES (NEW.id, public.generate_affiliate_code())
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_affiliate_code ON public.profiles;
CREATE TRIGGER trg_assign_affiliate_code
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_affiliate_code();

-- Backfill: affiliate-role profiles that still have no row.
INSERT INTO public.affiliate_profiles (profile_id, affiliate_code)
SELECT p.id, public.generate_affiliate_code()
FROM public.profiles p
WHERE p.role = 'affiliate'
  AND NOT EXISTS (
    SELECT 1 FROM public.affiliate_profiles ap WHERE ap.profile_id = p.id
  );
