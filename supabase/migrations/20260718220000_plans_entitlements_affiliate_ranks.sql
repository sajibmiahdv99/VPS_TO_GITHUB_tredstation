-- AGENT TRED: plan entitlements + 7-layer affiliate / rank system

-- 1) Plans: feature flags as JSONB + reseed plan codes
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trial_days int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;

-- Deactivate old codes (keep FK integrity if referenced)
UPDATE public.plans SET is_active = false WHERE code IN ('premium', 'professional');

-- Upsert new plan catalog
INSERT INTO public.plans (
  code, name, description, monthly_price, yearly_price,
  max_daily_trades, max_open_positions, max_trade_size_percentage,
  is_active, sort_order, features, trial_days, is_public
) VALUES
(
  'free_trial',
  'Free Trial',
  '7-day trial — limited automation',
  0, 0,
  10, 3, 5.0,
  true, 0,
  '{
    "max_exchange_accounts": 1,
    "platform_managed_sources": true,
    "user_connected_telegram": false,
    "advanced_risk_controls": false,
    "max_open_positions_limit": 3,
    "analytics_depth": "basic",
    "affiliate_access": false,
    "priority_support": false,
    "custom_risk_templates": false,
    "premium_source_access": false
  }'::jsonb,
  7, true
),
(
  'starter',
  'Starter',
  'Core automation for new traders',
  29, 290,
  30, 10, 10.0,
  true, 1,
  '{
    "max_exchange_accounts": 1,
    "platform_managed_sources": true,
    "user_connected_telegram": false,
    "advanced_risk_controls": "limited",
    "max_open_positions_limit": 10,
    "analytics_depth": "standard",
    "affiliate_access": true,
    "priority_support": false,
    "custom_risk_templates": false,
    "premium_source_access": false
  }'::jsonb,
  0, true
),
(
  'pro',
  'Pro',
  'Full risk tools + Telegram + priority support',
  79, 790,
  100, 25, 25.0,
  true, 2,
  '{
    "max_exchange_accounts": 3,
    "platform_managed_sources": true,
    "user_connected_telegram": true,
    "advanced_risk_controls": true,
    "max_open_positions_limit": 25,
    "analytics_depth": "advanced",
    "affiliate_access": true,
    "priority_support": true,
    "custom_risk_templates": true,
    "premium_source_access": true
  }'::jsonb,
  0, true
),
(
  'premium_vip',
  'Premium VIP',
  'Unlimited positions, 10 exchanges, full stack',
  199, 1990,
  9999, 9999, 50.0,
  true, 3,
  '{
    "max_exchange_accounts": 10,
    "platform_managed_sources": true,
    "user_connected_telegram": true,
    "advanced_risk_controls": true,
    "max_open_positions_limit": null,
    "analytics_depth": "premium",
    "affiliate_access": true,
    "priority_support": true,
    "custom_risk_templates": true,
    "premium_source_access": true
  }'::jsonb,
  0, true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price,
  max_daily_trades = EXCLUDED.max_daily_trades,
  max_open_positions = EXCLUDED.max_open_positions,
  max_trade_size_percentage = EXCLUDED.max_trade_size_percentage,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  features = EXCLUDED.features,
  trial_days = EXCLUDED.trial_days,
  is_public = EXCLUDED.is_public,
  updated_at = now();

-- Plan rank helper for new codes
CREATE OR REPLACE FUNCTION public.plan_rank(code text)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.sort_order FROM public.plans p WHERE p.code = plan_rank.code LIMIT 1),
    CASE plan_rank.code
      WHEN 'free_trial' THEN 0
      WHEN 'starter' THEN 1
      WHEN 'pro' THEN 2
      WHEN 'premium' THEN 2
      WHEN 'premium_vip' THEN 3
      WHEN 'professional' THEN 3
      ELSE 0
    END
  );
$$;

-- Map old plan_minimum values on sources to closest new codes
UPDATE public.signal_sources SET plan_minimum = 'starter' WHERE plan_minimum IN ('starter');
UPDATE public.signal_sources SET plan_minimum = 'pro' WHERE plan_minimum IN ('premium');
UPDATE public.signal_sources SET plan_minimum = 'premium_vip' WHERE plan_minimum IN ('professional');

-- Premium sources flag
ALTER TABLE public.signal_sources
  ADD COLUMN IF NOT EXISTS is_premium_source boolean NOT NULL DEFAULT false;

UPDATE public.signal_sources
SET is_premium_source = true
WHERE plan_minimum IN ('pro', 'premium_vip', 'premium', 'professional');

-- 2) Affiliate graph: ensure profiles.referred_by
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id);

-- Affiliate rank enum-like text + counters
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS active_paid_directs int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_bonus_pending numeric(18,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_bonus_paid numeric(18,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Normalize ranks
UPDATE public.affiliates SET rank = 'Member' WHERE rank IS NULL OR rank = 'Regular' OR rank = '';

-- Commission types: generation vs rank_bonus
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'generation'
    CHECK (commission_type IN ('generation', 'rank_bonus')),
  ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliates(id),
  ADD COLUMN IF NOT EXISTS notes text;

-- Rank bonus payouts (manual by admin)
CREATE TABLE IF NOT EXISTS public.affiliate_rank_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  affiliate_id uuid REFERENCES public.affiliates(id),
  rank text NOT NULL,
  rate numeric(5,4) NOT NULL,
  base_amount numeric(18,8) NOT NULL DEFAULT 0,
  bonus_amount numeric(18,8) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_rank_bonuses TO authenticated;
GRANT ALL ON public.affiliate_rank_bonuses TO service_role;
ALTER TABLE public.affiliate_rank_bonuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arb_self_read" ON public.affiliate_rank_bonuses;
CREATE POLICY "arb_self_read" ON public.affiliate_rank_bonuses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "arb_admin_all" ON public.affiliate_rank_bonuses;
CREATE POLICY "arb_admin_all" ON public.affiliate_rank_bonuses
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Platform config for affiliate rates
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('affiliate.l1_default', '0.10'::jsonb, 'Direct default commission'),
  ('affiliate.l1_at_10', '0.15'::jsonb, 'Direct after 10 directs'),
  ('affiliate.l1_at_15', '0.20'::jsonb, 'Direct after 15 directs'),
  ('affiliate.gen_rates', '[0.10,0.02,0.02,0.01,0.01,0.005,0.005]'::jsonb, 'L1-L7 base rates (L1 overridden by tier)'),
  ('affiliate.rank_bonus_be', '0.02'::jsonb, 'Brand Executive rank bonus'),
  ('affiliate.rank_bonus_sbe', '0.01'::jsonb, 'Senior Brand Executive rank bonus'),
  ('affiliate.auto_access_on_signup', 'true'::jsonb, 'Create affiliate row for every user')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Auto affiliate + free_trial sub on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_ref text;
  v_ref_user uuid;
  v_parent_aff uuid;
BEGIN
  v_code := substr(md5(NEW.id::text || clock_timestamp()::text), 1, 10);
  v_ref := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'ref', NEW.raw_user_meta_data->>'referral_code', '')), '');

  IF v_ref IS NOT NULL THEN
    SELECT p.id INTO v_ref_user FROM public.profiles p WHERE p.referral_code = v_ref LIMIT 1;
    IF v_ref_user IS NULL THEN
      SELECT a.user_id INTO v_ref_user FROM public.affiliates a WHERE a.referral_code = v_ref LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, referral_code, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    v_code,
    v_ref_user
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;

  -- Affiliate row (auto access)
  IF v_ref_user IS NOT NULL THEN
    SELECT id INTO v_parent_aff FROM public.affiliates WHERE user_id = v_ref_user LIMIT 1;
  END IF;

  INSERT INTO public.affiliates (
    user_id, referral_code, referred_by, parent_affiliate_id, rank, is_approved, status
  ) VALUES (
    NEW.id, v_code, v_ref_user, v_parent_aff, 'Member', true, 'active'
  ) ON CONFLICT (user_id) DO NOTHING;

  -- Balance row
  INSERT INTO public.user_balances (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  -- Free trial subscription (7 days)
  INSERT INTO public.subscriptions (
    user_id, plan_code, status, billing_interval,
    trial_starts_at, trial_ends_at,
    current_period_starts_at, current_period_ends_at, auto_renew
  ) VALUES (
    NEW.id, 'free_trial', 'trialing', 'monthly',
    now(), now() + interval '7 days',
    now(), now() + interval '7 days', false
  );

  -- Increment parent direct_referrals
  IF v_ref_user IS NOT NULL THEN
    UPDATE public.affiliates
    SET direct_referrals = COALESCE(direct_referrals, 0) + 1,
        updated_at = now()
    WHERE user_id = v_ref_user;
  END IF;

  RETURN NEW;
END;
$$;

-- Rank recompute helper (call from app after commissions)
CREATE OR REPLACE FUNCTION public.recompute_affiliate_rank(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_directs int;
  v_paid_directs int;
  v_sbp int;
  v_be int;
  v_rank text := 'Member';
BEGIN
  SELECT COALESCE(direct_referrals, 0) INTO v_directs
  FROM public.affiliates WHERE user_id = _user_id;

  -- Active paid members under direct network (directs with active/trialing paid plan != free_trial)
  SELECT COUNT(*) INTO v_paid_directs
  FROM public.profiles p
  JOIN public.subscriptions s ON s.user_id = p.id
  WHERE p.referred_by = _user_id
    AND s.status IN ('active', 'trialing')
    AND s.plan_code NOT IN ('free_trial');

  -- Count Senior Brand Promoters under direct (affiliates of directs with rank)
  SELECT COUNT(*) INTO v_sbp
  FROM public.affiliates a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE p.referred_by = _user_id
    AND a.rank IN ('Senior Brand Promoter', 'Brand Executive', 'Senior Brand Executive');

  SELECT COUNT(*) INTO v_be
  FROM public.affiliates a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE p.referred_by = _user_id
    AND a.rank IN ('Brand Executive', 'Senior Brand Executive');

  IF v_be >= 2 THEN
    v_rank := 'Senior Brand Executive';
  ELSIF v_sbp >= 3 THEN
    v_rank := 'Brand Executive';
  ELSIF v_paid_directs >= 15 THEN
    v_rank := 'Senior Brand Promoter';
  ELSIF COALESCE(v_directs, 0) >= 10 THEN
    v_rank := 'Brand Promoter';
  ELSE
    v_rank := 'Member';
  END IF;

  UPDATE public.affiliates
  SET rank = v_rank,
      active_paid_directs = v_paid_directs,
      updated_at = now()
  WHERE user_id = _user_id;

  RETURN v_rank;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_affiliate_rank(uuid) TO service_role, authenticated;
