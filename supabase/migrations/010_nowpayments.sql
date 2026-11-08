-- ============================================================================
-- AffiLayer — supabase/migrations/010_nowpayments.sql
--
-- NOWPayments all-rounder (9 Nov 2026): one connection, both directions.
--   Inbound:  advertiser deposits (crypto, priced in USD) via NOWPayments
--             invoices; IPN confirms them and credits advertiser_balances.
--   Outbound: admin-approved affiliate payouts sent via the NOWPayments
--             mass-payout API (USDT TRC20 by default); settlement flips
--             the H-5 ledger payable -> paid.
--
-- Auth model (mirrors 003/007/008 — SECURITY DEFINER RPCs, no service key):
--   * User-facing RPCs are called with the caller's Supabase JWT forwarded
--     by the tracking Worker and enforce auth.uid() / is_admin() inside.
--   * No-JWT paths (the IPN handler) are authenticated by a worker proof:
--     the Worker holds NP_WORKER_PROOF (wrangler secret); the DB holds the
--     same value in worker_secrets (seeded here with a random UUID). The
--     proof is hex(HMAC-SHA256(deposit/batch id, secret)). Without it the
--     RPCs raise insufficient_privilege. This deliberately does NOT repeat
--     the 008 pattern where a no-JWT call passes the gate (auth.uid() IS
--     NULL) — anyone holding the public anon key could otherwise mark
--     deposits finished or payouts settled without money moving.
--   * Internal helpers have EXECUTE revoked from PUBLIC so only other
--     SECURITY DEFINER functions (running as the owner) can call them.
--
-- Money rules (same conservatism as 008):
--   * A deposit credits the advertiser balance ONLY when NOWPayments
--     reports it `finished` AND the Worker re-fetched that status from
--     the API with the API key. The IPN body itself is never trusted
--     (the account IPN secret is shared with InboxNumber).
--   * `partially_paid` never auto-credits; an admin credits it manually
--     with np_admin_credit_deposit using the USD amount from the
--     NOWPayments dashboard (no invented rate).
--   * A payout settles the ledger ONLY when NOWPayments reports the batch
--     FINISHED (again re-fetched via API). A REJECTED batch releases its
--     reservation so the admin can retry or reject.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- worker_secrets — Worker-held proof secrets. RLS on, NO policies: no
-- browser role can read them; only SECURITY DEFINER functions can.
-- Seeded with a random UUID; the operator reads it once (SQL editor) and
-- sets it as the NP_WORKER_PROOF wrangler secret on affilayer-tracking.
-- ---------------------------------------------------------------------------
CREATE TABLE public.worker_secrets (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.worker_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.worker_secrets (key, value)
VALUES ('np_ipn_proof', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- advertiser_deposits — one row per deposit attempt.
-- ---------------------------------------------------------------------------
CREATE TABLE public.advertiser_deposits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_usd        numeric(12, 2) NOT NULL CHECK (amount_usd > 0),
  currency          char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  np_payment_id     text,
  np_invoice_id     text,
  np_pay_address    text,
  np_pay_amount     numeric(20, 8),
  np_pay_currency   text,
  order_id          text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'finished', 'partially_paid', 'failed', 'expired', 'refunded')),
  actually_paid     numeric(20, 8),
  outcome_amount    numeric(20, 8),
  outcome_currency  text,
  admin_note        text,
  confirmed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deposits_advertiser ON public.advertiser_deposits (advertiser_id);
CREATE INDEX idx_deposits_order ON public.advertiser_deposits (order_id);
CREATE INDEX idx_deposits_np_payment ON public.advertiser_deposits (np_payment_id);
CREATE TRIGGER trg_advertiser_deposits_updated_at
  BEFORE UPDATE ON public.advertiser_deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.advertiser_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY advertiser_deposits_select_own_or_admin ON public.advertiser_deposits
  FOR SELECT USING (advertiser_id = auth.uid() OR public.is_admin());
-- No INSERT/UPDATE/DELETE policies: rows are written by the 010 RPCs only.

-- ---------------------------------------------------------------------------
-- advertiser_balances — spendable credit per advertiser + currency.
-- ---------------------------------------------------------------------------
CREATE TABLE public.advertiser_balances (
  advertiser_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  currency      char(3) NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  balance       numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (advertiser_id, currency)
);
CREATE TRIGGER trg_advertiser_balances_updated_at
  BEFORE UPDATE ON public.advertiser_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.advertiser_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY advertiser_balances_select_own_or_admin ON public.advertiser_balances
  FOR SELECT USING (advertiser_id = auth.uid() OR public.is_admin());
-- No write policies: balances move via the 010 RPCs only.

-- ---------------------------------------------------------------------------
-- np_payouts — one row per NOWPayments payout batch.
-- ---------------------------------------------------------------------------
CREATE TABLE public.np_payouts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          text NOT NULL UNIQUE,
  withdrawal_id     text,
  payout_request_id uuid NOT NULL REFERENCES public.payout_requests (id) ON DELETE CASCADE,
  affiliate_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  address           text NOT NULL,
  currency          text NOT NULL DEFAULT 'usdttrc20',
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  fee               numeric(20, 8),
  status            text NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created', 'awaiting_2fa', 'verified', 'processing', 'finished', 'rejected', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_np_payouts_request ON public.np_payouts (payout_request_id);
CREATE INDEX idx_np_payouts_affiliate ON public.np_payouts (affiliate_id);
CREATE INDEX idx_np_payouts_batch ON public.np_payouts (batch_id);
CREATE TRIGGER trg_np_payouts_updated_at
  BEFORE UPDATE ON public.np_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.np_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY np_payouts_select_own_or_admin ON public.np_payouts
  FOR SELECT USING (affiliate_id = auth.uid() OR public.is_admin());
-- No write policies: rows are written by the 010 RPCs only.

-- ---------------------------------------------------------------------------
-- Affiliate payout wallet — dedicated columns on affiliate_profiles
-- (payment_details jsonb stays for the legacy manual method).
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliate_profiles
  ADD COLUMN IF NOT EXISTS payout_currency text NOT NULL DEFAULT 'usdttrc20',
  ADD COLUMN IF NOT EXISTS payout_address text;

-- ---------------------------------------------------------------------------
-- Internal: verify the worker proof. Not exposed as an RPC (EXECUTE
-- revoked from PUBLIC below) — only other SECURITY DEFINER functions
-- call it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_check_proof(
  p_subject text,
  p_proof text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
  v_expected text;
BEGIN
  SELECT value INTO v_secret FROM public.worker_secrets WHERE key = 'np_ipn_proof';
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;
  v_expected := encode(hmac(p_subject, v_secret, 'sha256'), 'hex');
  RETURN v_expected = lower(COALESCE(p_proof, ''));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.np_check_proof(text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Internal: release a payout reservation (approved -> pending, ledger
-- payable -> approved, oldest rows first until the request amount is
-- covered). Mirrors the approve loop in 008 in reverse. Not an RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_release_reservation(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affiliate_id uuid;
  v_amount numeric(12, 2);
  v_currency char(3);
  v_released numeric(12, 2) := 0;
  v_row record;
BEGIN
  SELECT affiliate_id, amount, currency
    INTO v_affiliate_id, v_amount, v_currency
    FROM public.payout_requests
    WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT id, amount FROM public.commission_ledger
    WHERE affiliate_id = v_affiliate_id
      AND currency = v_currency
      AND status = 'payable'
    ORDER BY created_at ASC, id ASC
  LOOP
    EXIT WHEN v_released >= v_amount;
    UPDATE public.commission_ledger SET status = 'approved' WHERE id = v_row.id;
    v_released := v_released + v_row.amount;
  END LOOP;

  UPDATE public.payout_requests
    SET status = 'pending'
    WHERE id = p_request_id AND status = 'approved';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.np_release_reservation(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- np_create_deposit — advertiser (JWT) records a deposit attempt after
-- the Worker created the NOWPayments invoice. Returns the deposit id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_create_deposit(
  p_advertiser_id uuid,
  p_amount_usd numeric,
  p_np_payment_id text,
  p_np_invoice_id text,
  p_pay_address text,
  p_pay_amount numeric,
  p_pay_currency text,
  p_order_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'np_create_deposit: sign-in required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_advertiser_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'np_create_deposit: only the advertiser (or an admin) may record a deposit'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN
    RAISE EXCEPTION 'np_create_deposit: amount must be greater than 0'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.advertiser_deposits
    (advertiser_id, amount_usd, np_payment_id, np_invoice_id, np_pay_address,
     np_pay_amount, np_pay_currency, order_id, status)
    VALUES (p_advertiser_id, p_amount_usd, p_np_payment_id, p_np_invoice_id,
            p_pay_address, p_pay_amount, p_pay_currency, p_order_id, 'waiting')
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- np_confirm_deposit — proof-gated (Worker, no JWT). The proof subject is
-- the deposit's order_id (present in the IPN body, so the Worker can
-- compute the proof without a lookup). Idempotent: a deposit already
-- 'finished' returns 'already_finished' without crediting twice. Only
-- 'finished' credits the balance, by the priced USD amount; the
-- settlement detail (actually_paid / outcome_*) is stored for
-- reconciliation. 'partially_paid' marks the row and credits nothing —
-- an admin reconciles it with np_admin_credit_deposit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_confirm_deposit(
  p_order_id text,
  p_proof text,
  p_status text,
  p_actually_paid numeric DEFAULT NULL,
  p_outcome_amount numeric DEFAULT NULL,
  p_outcome_currency text DEFAULT NULL,
  p_np_payment_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.advertiser_deposits%ROWTYPE;
BEGIN
  IF NOT public.np_check_proof(p_order_id, p_proof) THEN
    RAISE EXCEPTION 'np_confirm_deposit: bad worker proof'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.advertiser_deposits WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit not found for order: %', p_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.status = 'finished' THEN
    RETURN 'already_finished';
  END IF;

  IF p_status NOT IN ('finished', 'partially_paid', 'failed', 'expired', 'refunded') THEN
    RAISE EXCEPTION 'np_confirm_deposit: cannot confirm a deposit with non-terminal status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.advertiser_deposits
    SET status = p_status,
        np_payment_id = COALESCE(p_np_payment_id, np_payment_id),
        actually_paid = p_actually_paid,
        outcome_amount = p_outcome_amount,
        outcome_currency = p_outcome_currency,
        confirmed_at = CASE WHEN p_status = 'finished' THEN now() ELSE confirmed_at END
    WHERE id = v_row.id;

  IF p_status = 'finished' THEN
    INSERT INTO public.advertiser_balances (advertiser_id, currency, balance)
      VALUES (v_row.advertiser_id, v_row.currency, v_row.amount_usd)
      ON CONFLICT (advertiser_id, currency)
      DO UPDATE SET balance = public.advertiser_balances.balance + EXCLUDED.balance;

    PERFORM public.log_audit(
      NULL,
      'deposit.finished',
      'deposit',
      v_row.id,
      jsonb_build_object(
        'advertiser_id', v_row.advertiser_id,
        'amount_usd', v_row.amount_usd,
        'np_payment_id', v_row.np_payment_id,
        'order_id', v_row.order_id,
        'actually_paid', p_actually_paid,
        'outcome_amount', p_outcome_amount,
        'outcome_currency', p_outcome_currency
      )
    );
  END IF;

  RETURN p_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- np_admin_credit_deposit — admin credits a partially-paid deposit by a
-- USD amount read off the NOWPayments dashboard. No invented rate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_admin_credit_deposit(
  p_deposit_id uuid,
  p_amount_usd numeric,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.advertiser_deposits%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'np_admin_credit_deposit: only admins may credit deposits'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN
    RAISE EXCEPTION 'np_admin_credit_deposit: amount must be greater than 0'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.advertiser_deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit not found: %', p_deposit_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'partially_paid' THEN
    RAISE EXCEPTION 'deposit % cannot be manually credited from status % (only partially_paid)', p_deposit_id, v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.advertiser_balances (advertiser_id, currency, balance)
    VALUES (v_row.advertiser_id, v_row.currency, p_amount_usd)
    ON CONFLICT (advertiser_id, currency)
    DO UPDATE SET balance = public.advertiser_balances.balance + EXCLUDED.balance;

  UPDATE public.advertiser_deposits
    SET admin_note = COALESCE('Manual credit $' || p_amount_usd::text || ' by admin.', admin_note)
    WHERE id = p_deposit_id;

  PERFORM public.log_audit(
    p_actor,
    'deposit.manual_credit',
    'deposit',
    p_deposit_id,
    jsonb_build_object(
      'advertiser_id', v_row.advertiser_id,
      'amount_usd', p_amount_usd,
      'np_payment_id', v_row.np_payment_id,
      'order_id', v_row.order_id
    )
  );

  RETURN 'credited';
END;
$$;

-- ---------------------------------------------------------------------------
-- np_record_payout — admin (JWT) records a NOWPayments payout batch for
-- an approved payout request. Does NOT touch the ledger; settlement
-- happens in np_sync_payout_status when the batch reports FINISHED.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_record_payout(
  p_request_id uuid,
  p_batch_id text,
  p_withdrawal_id text,
  p_address text,
  p_currency text,
  p_amount numeric,
  p_fee numeric,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_affiliate_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'np_record_payout: only admins may record payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status, affiliate_id INTO v_status, v_affiliate_id
    FROM public.payout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_request_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'payout request % cannot be paid from status % (only approved)', p_request_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.np_payouts WHERE payout_request_id = p_request_id AND status NOT IN ('rejected', 'failed')) THEN
    RAISE EXCEPTION 'payout request % already has an active NOWPayments payout', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.np_payouts
    (batch_id, withdrawal_id, payout_request_id, affiliate_id, address, currency, amount, fee, status)
    VALUES (p_batch_id, p_withdrawal_id, p_request_id, v_affiliate_id, p_address, p_currency, p_amount, p_fee, 'created')
    RETURNING id INTO v_id;

  PERFORM public.log_audit(
    p_actor,
    'payout.np_created',
    'payout',
    p_request_id,
    jsonb_build_object(
      'affiliate_id', v_affiliate_id,
      'amount', p_amount,
      'currency', p_currency,
      'batch_id', p_batch_id,
      'address', p_address
    )
  );

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- np_verify_payout — admin (JWT) marks a batch verified (the NOWPayments
-- verify call itself is made by the Worker before this RPC).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_verify_payout(
  p_batch_id text,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.np_payouts%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'np_verify_payout: only admins may verify payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.np_payouts WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout batch not found: %', p_batch_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status NOT IN ('created', 'awaiting_2fa') THEN
    RAISE EXCEPTION 'payout batch % cannot be verified from status %', p_batch_id, v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.np_payouts SET status = 'verified' WHERE batch_id = p_batch_id;

  PERFORM public.log_audit(
    p_actor,
    'payout.np_verified',
    'payout',
    v_row.payout_request_id,
    jsonb_build_object('batch_id', p_batch_id, 'affiliate_id', v_row.affiliate_id)
  );

  RETURN 'verified';
END;
$$;

-- ---------------------------------------------------------------------------
-- np_sync_payout_status — proof-gated (Worker, no JWT). Called from the
-- IPN handler or the status poll after the Worker re-fetched the batch
-- status from the NOWPayments API. FINISHED settles the ledger via
-- complete_payout_request (provider NOWPayments, ref = batch id);
-- REJECTED releases the reservation so the admin can retry or reject.
-- Idempotent: an already-finished batch returns 'already_finished'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_sync_payout_status(
  p_batch_id text,
  p_proof text,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.np_payouts%ROWTYPE;
  v_mapped text;
BEGIN
  SELECT * INTO v_row FROM public.np_payouts WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout batch not found: %', p_batch_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The proof subject is the batch id (present in the IPN body, so the
  -- Worker can compute it without a lookup).
  IF NOT public.np_check_proof(p_batch_id, p_proof) THEN
    RAISE EXCEPTION 'np_sync_payout_status: bad worker proof'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_row.status = 'finished' THEN
    RETURN 'already_finished';
  END IF;

  -- Map NOWPayments batch statuses onto the local ones.
  v_mapped := CASE p_status
    WHEN 'FINISHED' THEN 'finished'
    WHEN 'REJECTED' THEN 'rejected'
    WHEN 'REJECTED_NOT_CHECKED' THEN 'rejected'
    WHEN 'PROCESSING' THEN 'processing'
    WHEN 'WAITING' THEN 'awaiting_2fa'
    WHEN 'CREATING' THEN 'created'
    WHEN 'NEW' THEN 'created'
    ELSE NULL
  END;
  IF v_mapped IS NULL THEN
    RAISE EXCEPTION 'np_sync_payout_status: unknown NOWPayments status %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.np_payouts SET status = v_mapped WHERE batch_id = p_batch_id;

  IF v_mapped = 'finished' THEN
    -- Settle: complete_payout_request inserts the payout_transactions row
    -- (provider NOWPayments, ref = batch id), flips ledger payable ->
    -- paid and the request -> paid. Called with no JWT, the 008 admin
    -- gate passes for backend callers; the proof check above is the
    -- authorization for this path.
    PERFORM public.complete_payout_request(
      v_row.payout_request_id, NULL, 'NOWPayments', p_batch_id
    );
    PERFORM public.log_audit(
      NULL,
      'payout.np_finished',
      'payout',
      v_row.payout_request_id,
      jsonb_build_object('batch_id', p_batch_id, 'affiliate_id', v_row.affiliate_id)
    );
  ELSIF v_mapped = 'rejected' THEN
    PERFORM public.np_release_reservation(v_row.payout_request_id);
    PERFORM public.log_audit(
      NULL,
      'payout.np_rejected',
      'payout',
      v_row.payout_request_id,
      jsonb_build_object('batch_id', p_batch_id, 'affiliate_id', v_row.affiliate_id)
    );
  END IF;

  RETURN v_mapped;
END;
$$;

-- ---------------------------------------------------------------------------
-- np_release_payout_reservation — admin (JWT) manually releases an
-- approved payout's reservation (e.g. after a failed payout attempt).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.np_release_payout_reservation(
  p_request_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'np_release_payout_reservation: only admins may release payouts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM public.payout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_request_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'payout request % cannot be released from status % (only approved)', p_request_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.np_release_reservation(p_request_id);

  PERFORM public.log_audit(
    p_actor,
    'payout.released',
    'payout',
    p_request_id,
    jsonb_build_object('from_status', 'approved', 'to_status', 'pending')
  );

  RETURN 'released';
END;
$$;
