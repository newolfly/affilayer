-- ============================================================================
-- AffiLayer — 003_functions.sql
-- Triggers, the immutable-ledger guard, the affiliate_balances view, the
-- audit helper, and the approve/reject conversion functions.
--
-- Security notes:
--   * approve_conversion / reject_conversion / log_audit are SECURITY DEFINER:
--     they run with the privileges of their owner (postgres / the migration
--     role), bypass RLS, and are the ONLY path by which an `authenticated`
--     user can change a conversion or write an audit row. They enforce the
--     state machine themselves (only pending -> approved / rejected).
--   * The commission_ledger immutability trigger in this file blocks
--     UPDATE/DELETE of money columns for everyone, including the service
--     role, and allows only sanctioned status transitions (pending ->
--     approved / rejected, approved -> payable, payable -> paid).
--     A correction is a NEW row (status 'reversed'), never an edit.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- One trigger per table that has an updated_at column.
-- (audit_logs has no updated_at — it is append-only — so it is excluded.)
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_affiliate_profiles_updated_at
  BEFORE UPDATE ON public.affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_advertiser_profiles_updated_at
  BEFORE UPDATE ON public.advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_offer_applications_updated_at
  BEFORE UPDATE ON public.offer_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_affiliate_offer_access_updated_at
  BEFORE UPDATE ON public.affiliate_offer_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tracking_links_updated_at
  BEFORE UPDATE ON public.tracking_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clicks_updated_at
  BEFORE UPDATE ON public.clicks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_conversions_updated_at
  BEFORE UPDATE ON public.conversions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_postback_configs_updated_at
  BEFORE UPDATE ON public.postback_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_postback_events_updated_at
  BEFORE UPDATE ON public.postback_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_commission_ledger_updated_at
  BEFORE UPDATE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payout_requests_updated_at
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payout_transactions_updated_at
  BEFORE UPDATE ON public.payout_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fraud_events_updated_at
  BEFORE UPDATE ON public.fraud_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_compliance_reviews_updated_at
  BEFORE UPDATE ON public.compliance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable commission ledger: amount / affiliate / conversion / currency /
-- offer can NEVER change, and rows can NEVER be deleted. The ONLY permitted
-- mutation is a status transition along the payout pipeline
--   pending -> approved | rejected | reversed
--   approved -> payable | reversed
--   payable  -> paid | reversed
-- (paid / rejected / reversed are terminal). This is what lets
-- approve_conversion / reject_conversion move a ledger entry pending ->
-- approved / rejected without ever touching the money columns.
-- The trigger fires for EVERYONE, including the service role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commission_ledger is immutable: rows cannot be deleted (id=%)', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Any change to a money/identity column is forbidden.
  IF OLD.conversion_id IS DISTINCT FROM NEW.conversion_id
     OR OLD.affiliate_id IS DISTINCT FROM NEW.affiliate_id
     OR OLD.offer_id IS DISTINCT FROM NEW.offer_id
     OR OLD.amount IS DISTINCT FROM NEW.amount
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.note IS DISTINCT FROM NEW.note
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'commission_ledger is immutable: only the status column may change (id=%)', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Status may only move along the sanctioned pipeline.
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NOT (
       (OLD.status = 'pending'  AND NEW.status IN ('approved', 'rejected', 'reversed'))
       OR (OLD.status = 'approved' AND NEW.status IN ('payable', 'reversed'))
       OR (OLD.status = 'payable'  AND NEW.status IN ('paid', 'reversed'))
     ) THEN
    RAISE EXCEPTION 'commission_ledger: illegal status transition % -> % (id=%)', OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commission_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Audit helper — the single sanctioned way for application code to write an
-- audit_logs row (besides the service role). SECURITY DEFINER so it bypasses
-- the audit_logs RLS policy that denies INSERT to `authenticated`.
-- Authorization: callable by admins and by backend callers with no JWT
-- (service role / postgres). A non-admin signed-in user calling it directly
-- is rejected, so browser code cannot forge audit rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'log_audit: only admins may write audit rows'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- affiliate_balances — per-affiliate money totals.
--   pending  = ledger rows still awaiting approval
--   approved = ledger rows approved but not yet marked payable
--   payable  = ledger rows marked payable (ready to be paid out)
--   paid     = ledger rows marked paid
--   paid_via_payouts = completed payout_transactions for the affiliate
--                      (the money that actually left the network)
-- Reversed / rejected ledger rows contribute to none of the totals.
-- Affiliates with ledger rows but no payouts (and vice versa) both appear.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.affiliate_balances AS
WITH ledger_totals AS (
  SELECT
    affiliate_id,
    COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)  AS pending,
    COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS approved,
    COALESCE(SUM(amount) FILTER (WHERE status = 'payable'), 0)  AS payable,
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)     AS paid
  FROM public.commission_ledger
  GROUP BY affiliate_id
),
payout_totals AS (
  SELECT
    affiliate_id,
    COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS paid_via_payouts
  FROM public.payout_transactions
  GROUP BY affiliate_id
)
SELECT
  COALESCE(l.affiliate_id, p.affiliate_id) AS affiliate_id,
  COALESCE(l.pending, 0)  AS pending,
  COALESCE(l.approved, 0) AS approved,
  COALESCE(l.payable, 0)  AS payable,
  COALESCE(l.paid, 0)     AS paid,
  COALESCE(p.paid_via_payouts, 0) AS paid_via_payouts
FROM ledger_totals l
FULL OUTER JOIN payout_totals p ON p.affiliate_id = l.affiliate_id;

-- ---------------------------------------------------------------------------
-- approve_conversion — pending -> approved only.
-- Updates the conversion, moves its ledger entry pending -> approved, writes
-- an audit row, returns the new status ('approved').
-- Raises if the conversion does not exist or is not pending.
-- p_actor is the profile id of the human/admin performing the approval.
-- Authorization: only admins (or backend callers with no JWT, i.e. the
-- service role) may call this — an affiliate must NOT be able to approve
-- their own conversions. p_actor is recorded, not trusted for auth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_conversion(
  p_conversion_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_payout numeric(12, 2);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'approve_conversion: only admins may approve conversions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, payout
    INTO v_status, v_affiliate_id, v_payout
    FROM public.conversions
    WHERE id = p_conversion_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversion not found: %', p_conversion_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'conversion % cannot be approved from status % (only pending can be approved)', p_conversion_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.conversions
    SET status = 'approved'
    WHERE id = p_conversion_id;

  -- Status-only change: permitted by the ledger trigger (pending ->
  -- approved is a sanctioned transition; amount/affiliate/currency are
  -- untouched, so the immutability guard does not fire).
  UPDATE public.commission_ledger
    SET status = 'approved'
    WHERE conversion_id = p_conversion_id AND status = 'pending';

  PERFORM public.log_audit(
    p_actor,
    'conversion.approved',
    'conversion',
    p_conversion_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'payout', v_payout,
      'from_status', 'pending',
      'to_status', 'approved'
    )
  );

  RETURN 'approved';
END;
$$;

-- ---------------------------------------------------------------------------
-- reject_conversion — pending -> rejected only. Same shape as approve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_conversion(
  p_conversion_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_payout numeric(12, 2);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'reject_conversion: only admins may reject conversions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id, payout
    INTO v_status, v_affiliate_id, v_payout
    FROM public.conversions
    WHERE id = p_conversion_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversion not found: %', p_conversion_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'conversion % cannot be rejected from status % (only pending can be rejected)', p_conversion_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.conversions
    SET status = 'rejected'
    WHERE id = p_conversion_id;

  UPDATE public.commission_ledger
    SET status = 'rejected'
    WHERE conversion_id = p_conversion_id AND status = 'pending';

  PERFORM public.log_audit(
    p_actor,
    'conversion.rejected',
    'conversion',
    p_conversion_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'payout', v_payout,
      'from_status', 'pending',
      'to_status', 'rejected'
    )
  );

  RETURN 'rejected';
END;
$$;
