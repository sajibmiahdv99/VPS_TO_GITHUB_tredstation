CREATE TABLE public.exchange_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exchange_account_id uuid NOT NULL REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
  asset text NOT NULL,
  free numeric(28,10) NOT NULL DEFAULT 0,
  used numeric(28,10) NOT NULL DEFAULT 0,
  total numeric(28,10) NOT NULL DEFAULT 0,
  usd_value numeric(18,4),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exchange_account_id, asset)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_balances TO authenticated;
GRANT ALL ON public.exchange_balances TO service_role;

ALTER TABLE public.exchange_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bal_self_read" ON public.exchange_balances
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bal_admin_read" ON public.exchange_balances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER exchange_balances_upd
  BEFORE UPDATE ON public.exchange_balances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX ix_exchange_balances_account ON public.exchange_balances(exchange_account_id);
CREATE INDEX ix_exchange_balances_user ON public.exchange_balances(user_id);

ALTER TABLE public.exchange_accounts
  ADD COLUMN IF NOT EXISTS last_balance_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_balance_error text;

ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_balances;
ALTER TABLE public.exchange_balances REPLICA IDENTITY FULL;