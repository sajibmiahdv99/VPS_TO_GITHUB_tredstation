
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  timezone text DEFAULT 'UTC',
  locale text DEFAULT 'en',
  referral_code text UNIQUE,
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_rw" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    substr(md5(NEW.id::text || clock_timestamp()::text), 1, 10)
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  monthly_price numeric(10,2) DEFAULT 0,
  yearly_price numeric(10,2) DEFAULT 0,
  max_daily_trades int DEFAULT 20,
  max_open_positions int DEFAULT 5,
  max_trade_size_percentage numeric(5,2) DEFAULT 10.0,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "plans_admin_all" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.plans (code,name,description,monthly_price,yearly_price,max_daily_trades,max_open_positions,max_trade_size_percentage,sort_order) VALUES
 ('starter','Starter','Get started with automated trading',29,290,20,3,10.0,1),
 ('premium','Premium','For active traders',79,790,50,10,25.0,2),
 ('professional','Professional','Maximum performance',199,1990,999,50,50.0,3);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.plans(code),
  billing_interval text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'trialing',
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz DEFAULT now(),
  current_period_ends_at timestamptz DEFAULT now() + interval '7 days',
  auto_renew boolean DEFAULT true,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs_self_read" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "subs_admin_all" ON public.subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_subs_user_status ON public.subscriptions(user_id,status);

-- Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_self_read" ON public.invoices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "invoices_admin_all" ON public.invoices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  invoice_id uuid REFERENCES public.invoices(id),
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  provider text NOT NULL,
  external_payment_ref text,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_self_read" ON public.payments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pay_admin_all" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Exchange accounts
CREATE TABLE public.exchange_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exchange_code text NOT NULL,
  label text NOT NULL,
  encrypted_api_key text NOT NULL,
  encrypted_api_secret text NOT NULL,
  passphrase text,
  status text NOT NULL DEFAULT 'disconnected',
  permissions jsonb DEFAULT '[]',
  validated_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_accounts TO authenticated;
GRANT ALL ON public.exchange_accounts TO service_role;
ALTER TABLE public.exchange_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ex_self_rw" ON public.exchange_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ex_admin_read" ON public.exchange_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ex_upd BEFORE UPDATE ON public.exchange_accounts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Telegram accounts
CREATE TABLE public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  masked_phone text,
  session_ref text,
  sync_info jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_self_rw" ON public.telegram_accounts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tg_admin_read" ON public.telegram_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tg_upd BEFORE UPDATE ON public.telegram_accounts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Signal sources
CREATE TABLE public.signal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  source_type text NOT NULL DEFAULT 'platform_managed',
  status text NOT NULL DEFAULT 'active',
  is_platform_managed boolean DEFAULT true,
  plan_minimum text,
  win_rate numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.signal_sources TO authenticated;
GRANT ALL ON public.signal_sources TO service_role;
ALTER TABLE public.signal_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "src_read_all_auth" ON public.signal_sources FOR SELECT TO authenticated USING (status = 'active' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "src_admin_all" ON public.signal_sources FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.signal_sources (code,name,description,plan_minimum,win_rate) VALUES
 ('hermes-core','Hermes Core','Flagship platform signals','starter',72.5),
 ('hermes-scalp','Hermes Scalp','High-frequency scalp signals','premium',68.1),
 ('hermes-swing','Hermes Swing','Swing trade signals','starter',74.0);

-- Signals (parsed)
CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.signal_sources(id),
  raw_text text NOT NULL,
  symbol text,
  side text,
  entry_price numeric(18,8),
  stop_loss numeric(18,8),
  take_profit numeric(18,8)[],
  leverage int,
  confidence numeric(5,2),
  status text NOT NULL DEFAULT 'parsed',
  parser_version text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sig_read_auth" ON public.signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "sig_admin_all" ON public.signals FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_signals_created ON public.signals(created_at DESC);

-- User risk settings
CREATE TABLE public.user_risk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_trade_size_percent numeric(5,2) DEFAULT 10,
  risk_per_trade_percent numeric(5,2) DEFAULT 2,
  max_open_positions int DEFAULT 3,
  stop_loss_type text DEFAULT 'fixed',
  take_profit_type text DEFAULT 'fixed',
  break_even_enabled boolean DEFAULT false,
  auto_stop_after_losses int,
  daily_loss_limit_percent numeric(5,2),
  cooldown_minutes_after_loss numeric(5,2),
  max_drawdown_percent numeric(5,2),
  allowed_source_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_risk_settings TO authenticated;
GRANT ALL ON public.user_risk_settings TO service_role;
ALTER TABLE public.user_risk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_self_rw" ON public.user_risk_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "risk_admin_read" ON public.user_risk_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Orders / trades
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  exchange_account_id uuid REFERENCES public.exchange_accounts(id),
  signal_id uuid REFERENCES public.signals(id),
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type text NOT NULL CHECK (order_type IN ('MARKET','LIMIT')),
  price numeric(18,8),
  quantity numeric(18,8) NOT NULL,
  filled_quantity numeric(18,8),
  fill_price numeric(18,8),
  leverage int DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','OPEN','FILLED','CANCELLED','FAILED','CLOSED')),
  stop_loss numeric(18,8),
  take_profit numeric(18,8),
  pnl numeric(18,8),
  exchange_order_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_self_rw" ON public.orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_orders_user_status ON public.orders(user_id,status);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);

CREATE TABLE public.trade_blocks (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trade_blocks TO authenticated;
GRANT ALL ON public.trade_blocks TO service_role;
ALTER TABLE public.trade_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tb_self_read" ON public.trade_blocks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tb_admin_all" ON public.trade_blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.trade_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  order_id uuid REFERENCES public.orders(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trade_logs TO authenticated;
GRANT ALL ON public.trade_logs TO service_role;
ALTER TABLE public.trade_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tl_self_read" ON public.trade_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tl_admin_all" ON public.trade_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Affiliates
CREATE TABLE public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code text UNIQUE NOT NULL,
  referred_by uuid REFERENCES public.profiles(id),
  parent_affiliate_id uuid REFERENCES public.affiliates(id),
  rank text NOT NULL DEFAULT 'Regular',
  is_approved boolean DEFAULT false,
  is_recurring_eligible boolean DEFAULT false,
  total_earned numeric(10,2) DEFAULT 0,
  total_paid numeric(10,2) DEFAULT 0,
  total_pending numeric(10,2) DEFAULT 0,
  direct_referrals int DEFAULT 0,
  payout_method jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.affiliates TO authenticated;
GRANT ALL ON public.affiliates TO service_role;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aff_self_rw" ON public.affiliates FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "aff_admin_all" ON public.affiliates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_by_id uuid NOT NULL REFERENCES public.profiles(id),
  subscriber_id uuid NOT NULL REFERENCES public.profiles(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  level int NOT NULL CHECK (level BETWEEN 1 AND 7),
  rate numeric(5,2) NOT NULL,
  amount numeric(18,8) NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_commissions TO authenticated;
GRANT ALL ON public.affiliate_commissions TO service_role;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac_self_read" ON public.affiliate_commissions FOR SELECT TO authenticated USING (referred_by_id = auth.uid());
CREATE POLICY "ac_admin_all" ON public.affiliate_commissions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.user_balances (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_earned numeric(18,8) DEFAULT 0,
  pending_commission numeric(18,8) DEFAULT 0,
  available_balance numeric(18,8) DEFAULT 0,
  pending_withdrawal numeric(18,8) DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_balances TO authenticated;
GRANT ALL ON public.user_balances TO service_role;
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bal_self_read" ON public.user_balances FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bal_admin_all" ON public.user_balances FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(18,2) NOT NULL,
  method text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  notes text
);
GRANT SELECT, INSERT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_self_rw" ON public.payouts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "po_self_insert" ON public.payouts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "po_admin_all" ON public.payouts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Support
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL DEFAULT ('T-' || substr(md5(random()::text),1,8)),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  assigned_to uuid REFERENCES public.profiles(id),
  category text DEFAULT 'general',
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_self_rw" ON public.support_tickets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "st_admin_all" ON public.support_tickets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Audit logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "al_admin_all" ON public.audit_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
