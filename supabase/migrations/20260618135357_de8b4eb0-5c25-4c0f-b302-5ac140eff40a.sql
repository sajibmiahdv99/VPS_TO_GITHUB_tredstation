
CREATE TABLE public.personal_signal_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_account_id uuid REFERENCES public.telegram_accounts(id) ON DELETE SET NULL,
  name text NOT NULL,
  username text,
  description text,
  win_rate numeric,
  signals_count integer NOT NULL DEFAULT 0,
  last_signal_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_personal_signal_channels_user ON public.personal_signal_channels(user_id);
CREATE INDEX idx_personal_signal_channels_tg_account ON public.personal_signal_channels(telegram_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_signal_channels TO authenticated;
GRANT ALL ON public.personal_signal_channels TO service_role;

ALTER TABLE public.personal_signal_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own channels"
  ON public.personal_signal_channels FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own channels"
  ON public.personal_signal_channels FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own channels"
  ON public.personal_signal_channels FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own channels"
  ON public.personal_signal_channels FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_personal_signal_channels_updated_at
  BEFORE UPDATE ON public.personal_signal_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
