-- ============================================================================
-- AffiLayer — supabase/migrations/027_create_smartlinks.sql
--
-- SmartLink code registry (P1-12 follow-up; Sojib decision 11 Nov 2026:
-- build the table, unknown /s/<code> returns 404).
--
-- Before this migration the Worker had no per-code registry in Supabase
-- mode, so ANY /s/<anything> 302'd to the deterministic pick. From now
-- on the Worker looks the code up here first: no ACTIVE row -> 404
-- 'smartlink not found' (same error shape as the demo-mode 404).
--
-- offer_id NULL means the code is not pinned to one offer — the known
-- code proceeds through the existing pick flow unchanged (geo-aware,
-- cap-aware, fallback to the next offer). A set offer_id pins the code
-- to that offer (the Worker filters the candidate list to it).
--
-- RLS: the Worker reads with the anon key and no JWT, so anon may SELECT
-- ACTIVE rows only — unknown, paused and archived codes stay invisible
-- and 404. Writes are admin-only (dashboard / service role).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.smartlinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smartlinks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS smartlinks_select_active ON public.smartlinks;
CREATE POLICY smartlinks_select_active ON public.smartlinks
  FOR SELECT TO anon
  USING (status = 'active');

DROP POLICY IF EXISTS smartlinks_write_admin ON public.smartlinks;
CREATE POLICY smartlinks_write_admin ON public.smartlinks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed the one canonical demo code (same code demo mode accepts).
INSERT INTO public.smartlinks (code, offer_id, status)
VALUES ('demo', NULL, 'active')
ON CONFLICT (code) DO NOTHING;
