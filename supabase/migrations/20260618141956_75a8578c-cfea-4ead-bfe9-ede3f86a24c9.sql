
ALTER TABLE public.personal_signal_channels
  ADD COLUMN IF NOT EXISTS tg_chat_id bigint,
  ADD COLUMN IF NOT EXISTS is_signal_source boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_personal_signal_channels_tg_chat_id
  ON public.personal_signal_channels(tg_chat_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_signal_channels_user_chat
  ON public.personal_signal_channels(user_id, tg_chat_id)
  WHERE tg_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.channel_risk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.personal_signal_channels(id) ON DELETE CASCADE,
  allocation_percent numeric(5,2) NOT NULL DEFAULT 2,
  stop_loss_percent numeric(6,2),
  take_profit_percent numeric(6,2),
  leverage integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_risk_settings TO authenticated;
GRANT ALL ON public.channel_risk_settings TO service_role;

ALTER TABLE public.channel_risk_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own channel risk"
  ON public.channel_risk_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own channel risk"
  ON public.channel_risk_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own channel risk"
  ON public.channel_risk_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own channel risk"
  ON public.channel_risk_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_channel_risk_settings_updated_at
  BEFORE UPDATE ON public.channel_risk_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
