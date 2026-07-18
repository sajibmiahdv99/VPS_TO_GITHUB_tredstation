ALTER TABLE public.personal_signal_channels
  ADD COLUMN IF NOT EXISTS channel_type text NOT NULL DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS webhook_token text;

ALTER TABLE public.personal_signal_channels
  DROP CONSTRAINT IF EXISTS personal_signal_channels_channel_type_check;
ALTER TABLE public.personal_signal_channels
  ADD CONSTRAINT personal_signal_channels_channel_type_check
  CHECK (channel_type IN ('telegram', 'webhook'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_signal_channels_webhook_token
  ON public.personal_signal_channels(webhook_token)
  WHERE webhook_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_signal_channels_channel_type
  ON public.personal_signal_channels(channel_type);