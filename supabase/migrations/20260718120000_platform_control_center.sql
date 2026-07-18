-- Platform control center: settings, encrypted secrets vault, system health

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.platform_secrets (
  key text PRIMARY KEY,
  ciphertext text NOT NULL,
  hint text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.system_health (
  component text PRIMARY KEY,
  last_ok_at timestamptz,
  last_error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants: only service_role + admin via has_role for settings
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
GRANT ALL ON public.platform_secrets TO service_role;
GRANT SELECT ON public.system_health TO authenticated;
GRANT ALL ON public.system_health TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings_admin" ON public.platform_settings;
CREATE POLICY "platform_settings_admin" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- No authenticated access to ciphertext
DROP POLICY IF EXISTS "platform_secrets_deny_all" ON public.platform_secrets;
CREATE POLICY "platform_secrets_deny_all" ON public.platform_secrets
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "system_health_admin_read" ON public.system_health;
CREATE POLICY "system_health_admin_read" ON public.system_health
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Default feature flags
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('payments.enabled_providers', '["nowpayments","manual_usdt"]'::jsonb, 'Public payment providers'),
  ('payments.stripe_enabled', 'false'::jsonb, 'Show Stripe (ready-but-hidden)'),
  ('payments.paddle_enabled', 'false'::jsonb, 'Show Paddle (ready-but-hidden)'),
  ('payments.manual_usdt', '{"network":"TRC20","address":"","memo_required":false}'::jsonb, 'Manual USDT deposit details'),
  ('features.kyc_required', 'false'::jsonb, 'Require KYC before trading'),
  ('features.marketplace', 'true'::jsonb, 'Enable marketplace'),
  ('features.oauth_exchange', 'false'::jsonb, 'Enable exchange OAuth connect'),
  ('features.mt5_bridge', 'true'::jsonb, 'Show MT5 bridge option'),
  ('features.dex_bridge', 'true'::jsonb, 'Show DEX bridge option'),
  ('features.email_notifications', 'true'::jsonb, 'Dispatch email notifications'),
  ('trading.global_pause', 'false'::jsonb, 'Global trading kill switch'),
  ('ai.parser_enabled', 'true'::jsonb, 'AI signal parser fallback'),
  ('affiliate.rates', '[0.3,0.1,0.05]'::jsonb, 'MLM commission rates L1-L3')
ON CONFLICT (key) DO NOTHING;

-- Pending subscription status for checkout (if check constraint exists, widen later)
-- payments.provider free-text already supports nowpayments | manual_usdt | stripe | paddle
