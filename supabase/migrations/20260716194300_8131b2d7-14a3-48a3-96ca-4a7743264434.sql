
CREATE TABLE IF NOT EXISTS public.risk_optimizer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  initial_balance numeric NOT NULL DEFAULT 10000,
  fee_pct numeric NOT NULL DEFAULT 0.05,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid jsonb NOT NULL DEFAULT '{}'::jsonb,
  objective text NOT NULL DEFAULT 'return_over_drawdown',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  total_combos int NOT NULL,
  completed_combos int NOT NULL DEFAULT 0,
  best_backtest_run_id uuid REFERENCES public.backtest_runs(id) ON DELETE SET NULL,
  results jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS risk_optimizer_runs_user_idx ON public.risk_optimizer_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_optimizer_runs_status_idx ON public.risk_optimizer_runs(status) WHERE status IN ('queued','running');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_optimizer_runs TO authenticated;
GRANT ALL ON public.risk_optimizer_runs TO service_role;
ALTER TABLE public.risk_optimizer_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ro_runs_self_all" ON public.risk_optimizer_runs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ro_runs_admin_read" ON public.risk_optimizer_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.backtest_runs
  ADD COLUMN IF NOT EXISTS optimizer_run_id uuid REFERENCES public.risk_optimizer_runs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS backtest_runs_optimizer_idx ON public.backtest_runs(optimizer_run_id) WHERE optimizer_run_id IS NOT NULL;
