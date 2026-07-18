
ALTER TABLE public.exchange_accounts
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'live'
    CHECK (execution_mode IN ('live','paper'));

ALTER TABLE public.user_risk_settings
  ADD COLUMN IF NOT EXISTS auto_trade_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS symbol_allowlist text[],
  ADD COLUMN IF NOT EXISTS symbol_denylist text[],
  ADD COLUMN IF NOT EXISTS min_leverage integer,
  ADD COLUMN IF NOT EXISTS max_leverage integer,
  ADD COLUMN IF NOT EXISTS max_concurrent_trades integer;
