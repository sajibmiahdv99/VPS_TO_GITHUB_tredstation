
-- ============ Backtest Engine schema ============
CREATE TABLE IF NOT EXISTS public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  initial_balance numeric NOT NULL DEFAULT 10000,
  fee_pct numeric NOT NULL DEFAULT 0.05,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress int NOT NULL DEFAULT 0,
  summary jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS backtest_runs_user_idx ON public.backtest_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backtest_runs_status_idx ON public.backtest_runs(status) WHERE status IN ('queued','running');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backtest_runs TO authenticated;
GRANT ALL ON public.backtest_runs TO service_role;
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bt_runs_self_all" ON public.backtest_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "bt_runs_admin_read" ON public.backtest_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.backtest_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  side text NOT NULL,
  entry_time timestamptz NOT NULL,
  exit_time timestamptz,
  entry_price numeric NOT NULL,
  exit_price numeric,
  qty numeric NOT NULL,
  leverage numeric,
  pnl numeric,
  pnl_pct numeric,
  exit_reason text,
  risk_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backtest_trades_run_idx ON public.backtest_trades(run_id, entry_time);

GRANT SELECT ON public.backtest_trades TO authenticated;
GRANT ALL ON public.backtest_trades TO service_role;
ALTER TABLE public.backtest_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bt_trades_owner_read" ON public.backtest_trades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.backtest_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));

-- ============ Security fixes ============
-- exchange_accounts: column-level grants excluding encrypted credentials
REVOKE SELECT, UPDATE ON public.exchange_accounts FROM authenticated;
GRANT SELECT (id, user_id, exchange_code, label, status, permissions, validated_at, last_error, created_at, updated_at, last_balance_sync_at, last_balance_error, execution_mode) ON public.exchange_accounts TO authenticated;
GRANT UPDATE (label, status, execution_mode, updated_at) ON public.exchange_accounts TO authenticated;

-- telegram_accounts: column-level grants excluding session/phone
REVOKE SELECT, UPDATE ON public.telegram_accounts FROM authenticated;
GRANT SELECT (id, user_id, label, status, masked_phone, sync_info, last_error, created_at, updated_at, requires_2fa, tg_user_id, tg_username) ON public.telegram_accounts TO authenticated;
GRANT UPDATE (label, status, updated_at) ON public.telegram_accounts TO authenticated;

-- affiliates: restrict UPDATE to user-editable fields only
REVOKE UPDATE ON public.affiliates FROM authenticated;
GRANT UPDATE (payout_method, updated_at) ON public.affiliates TO authenticated;
