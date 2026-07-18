
-- ============ NOTIFICATION PREFERENCES ============
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  telegram_chat_id text,
  channel_email boolean NOT NULL DEFAULT true,
  channel_telegram boolean NOT NULL DEFAULT false,
  channel_inapp boolean NOT NULL DEFAULT true,
  evt_fill boolean NOT NULL DEFAULT true,
  evt_sl_tp boolean NOT NULL DEFAULT true,
  evt_error boolean NOT NULL DEFAULT true,
  evt_invalid_keys boolean NOT NULL DEFAULT true,
  evt_new_signal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_prefs TO authenticated;
GRANT ALL ON public.user_notification_prefs TO service_role;
ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np_self_rw" ON public.user_notification_prefs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_np_updated BEFORE UPDATE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- In-app notifications inbox
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_self_select" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_self_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_self_delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- ============ ORDER BEHAVIOR (extend user_risk_settings) ============
ALTER TABLE public.user_risk_settings
  ADD COLUMN IF NOT EXISTS default_order_type text NOT NULL DEFAULT 'market',
  ADD COLUMN IF NOT EXISTS slippage_tolerance_pct numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS partial_tp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trailing_sl_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT urs_order_type_chk CHECK (default_order_type IN ('market','limit'));

-- ============ SECURITY FIX: affiliates UPDATE column-scoped ============
DROP POLICY IF EXISTS "aff_self_update" ON public.affiliates;
CREATE POLICY "aff_self_update" ON public.affiliates
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE UPDATE ON public.affiliates FROM authenticated;
GRANT UPDATE (payout_method, updated_at) ON public.affiliates TO authenticated;

-- ============ SECURITY FIX: exchange_accounts hide encrypted columns ============
DROP POLICY IF EXISTS "ex_self_rw" ON public.exchange_accounts;
CREATE POLICY "ex_self_select" ON public.exchange_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ex_self_insert" ON public.exchange_accounts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "ex_self_update" ON public.exchange_accounts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ex_self_delete" ON public.exchange_accounts FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE SELECT, UPDATE ON public.exchange_accounts FROM authenticated;
GRANT SELECT (id, user_id, exchange_code, label, status, permissions, validated_at, last_error, created_at, updated_at, last_balance_sync_at, last_balance_error, execution_mode) ON public.exchange_accounts TO authenticated;
GRANT UPDATE (label, status, execution_mode, updated_at) ON public.exchange_accounts TO authenticated;

-- ============ SECURITY FIX: telegram_accounts hide encrypted session/phone ============
DROP POLICY IF EXISTS "tg_self_rw" ON public.telegram_accounts;
CREATE POLICY "tg_self_select" ON public.telegram_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tg_self_insert" ON public.telegram_accounts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "tg_self_update" ON public.telegram_accounts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tg_self_delete" ON public.telegram_accounts FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE SELECT, UPDATE ON public.telegram_accounts FROM authenticated;
GRANT SELECT (id, user_id, label, status, masked_phone, sync_info, last_error, created_at, updated_at, requires_2fa, tg_user_id, tg_username) ON public.telegram_accounts TO authenticated;
GRANT UPDATE (label, status, updated_at) ON public.telegram_accounts TO authenticated;
