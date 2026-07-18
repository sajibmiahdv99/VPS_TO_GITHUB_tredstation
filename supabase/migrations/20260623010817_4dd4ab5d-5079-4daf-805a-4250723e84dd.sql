-- 1) Table
CREATE TABLE public.user_symbol_risk_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text,
  asset_class text,
  max_exposure_pct numeric,
  max_open_positions integer,
  max_leverage integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_symbol_risk_caps_scope_chk CHECK (
    (symbol IS NOT NULL AND asset_class IS NULL) OR
    (symbol IS NULL AND asset_class IS NOT NULL)
  ),
  CONSTRAINT user_symbol_risk_caps_asset_class_chk CHECK (
    asset_class IS NULL OR asset_class IN ('BTC','ETH','ALT','STABLE','FOREX','INDEX','COMMODITY')
  )
);

CREATE UNIQUE INDEX ux_user_symbol_risk_caps_symbol
  ON public.user_symbol_risk_caps(user_id, symbol)
  WHERE symbol IS NOT NULL;

CREATE UNIQUE INDEX ux_user_symbol_risk_caps_asset_class
  ON public.user_symbol_risk_caps(user_id, asset_class)
  WHERE asset_class IS NOT NULL;

CREATE INDEX ix_user_symbol_risk_caps_user
  ON public.user_symbol_risk_caps(user_id);

-- 2) GRANTs (auth-only; no anon)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_symbol_risk_caps TO authenticated;
GRANT ALL ON public.user_symbol_risk_caps TO service_role;

-- 3) RLS
ALTER TABLE public.user_symbol_risk_caps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own symbol risk caps"
  ON public.user_symbol_risk_caps
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all symbol risk caps"
  ON public.user_symbol_risk_caps
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) updated_at trigger
CREATE TRIGGER trg_user_symbol_risk_caps_updated_at
  BEFORE UPDATE ON public.user_symbol_risk_caps
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();