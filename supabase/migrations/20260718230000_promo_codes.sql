-- Promo codes: super_admin only grants plans without payment
-- scope: global | affiliate (single affiliator)

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  plan_code text NOT NULL REFERENCES public.plans(code),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'affiliate')),
  -- When scope=affiliate, only redemptions that credit this affiliate / optional restriction
  affiliate_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  duration_days int NOT NULL DEFAULT 30 CHECK (duration_days > 0 AND duration_days <= 3650),
  max_redemptions int, -- null = unlimited
  redemption_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promo_id, user_id) -- one redeem per user per code
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes (lower(code));
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON public.promo_redemptions (user_id);

GRANT SELECT ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Super admin full control
DROP POLICY IF EXISTS "promo_super_all" ON public.promo_codes;
CREATE POLICY "promo_super_all" ON public.promo_codes
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Users can read active codes they redeem via service role; self redemptions
DROP POLICY IF EXISTS "promo_redeem_self" ON public.promo_redemptions;
CREATE POLICY "promo_redeem_self" ON public.promo_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "promo_redeem_super" ON public.promo_redemptions;
CREATE POLICY "promo_redeem_super" ON public.promo_redemptions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
