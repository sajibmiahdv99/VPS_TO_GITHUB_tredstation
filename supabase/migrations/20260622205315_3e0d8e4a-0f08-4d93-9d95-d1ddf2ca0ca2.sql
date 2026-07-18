
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatch_error text;

CREATE INDEX IF NOT EXISTS idx_notifications_dispatch_pending
  ON public.notifications (created_at)
  WHERE email_dispatched_at IS NULL OR telegram_dispatched_at IS NULL;
