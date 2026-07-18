ALTER TABLE public.telegram_accounts
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_code_hash text,
  ADD COLUMN IF NOT EXISTS encrypted_session text,
  ADD COLUMN IF NOT EXISTS requires_2fa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tg_user_id bigint,
  ADD COLUMN IF NOT EXISTS tg_username text;