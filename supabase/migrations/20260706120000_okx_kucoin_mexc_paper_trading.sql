-- Add OKX, KuCoin, MEXC ticker support to exchange_ticker_fetch
-- No schema changes needed — ADAPTERS are purely code-level.

-- Paper trading: mark orders as paper if execution_mode='paper' at placement time
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_paper boolean NOT NULL DEFAULT false;

-- Index for paper trade filtering
CREATE INDEX IF NOT EXISTS idx_orders_is_paper ON public.orders (user_id, is_paper);

-- Exchange accounts: add kucoin passphrase note in allowed codes (constraint on app layer)
-- No DB constraint needed — validation happens in executor.

-- Signal sources: add okx/mexc as valid platform channels
COMMENT ON TABLE public.orders IS 'is_paper=true rows are simulated fills from paper execution mode; no real capital is involved.';
