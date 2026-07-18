
-- 1. Exchange accounts: revoke SELECT on credential columns from authenticated
REVOKE SELECT (encrypted_api_key, encrypted_api_secret, passphrase) ON public.exchange_accounts FROM authenticated;

-- 2. Telegram accounts: revoke SELECT on sensitive columns from authenticated
REVOKE SELECT (encrypted_session, phone_e164, phone_code_hash, session_ref) ON public.telegram_accounts FROM authenticated;

-- 3. Affiliates: restrict self-updates to payout_method via column-level privileges
REVOKE UPDATE ON public.affiliates FROM authenticated;
GRANT UPDATE (payout_method, updated_at) ON public.affiliates TO authenticated;

-- 4. order_events: require referenced order to belong to the same user
DROP POLICY IF EXISTS oe_self_insert ON public.order_events;
CREATE POLICY oe_self_insert ON public.order_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id AND o.user_id = auth.uid())
  );

-- 5. Realtime: deny topic subscriptions by default (app uses postgres_changes only,
-- which is governed by table RLS — broadcast/presence topics stay locked).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_realtime_topics ON realtime.messages;
CREATE POLICY deny_all_realtime_topics ON realtime.messages
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);
