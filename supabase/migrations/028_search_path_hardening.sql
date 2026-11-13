-- 028: search_path hardening (audit v4, DB-01 / v3 L-01).
-- The last 6 SECURITY DEFINER functions without a pinned search_path.
-- Matches the form used by the 026-era functions (public, pg_temp).
-- Idempotent: ALTER FUNCTION ... SET is a no-op when re-applied.

ALTER FUNCTION public.approve_conversion(p_conversion_id uuid, p_actor uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.reject_conversion(p_conversion_id uuid, p_actor uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.current_affiliate_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.current_org_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_org_member(p_org_id uuid) SET search_path = public, pg_temp;
