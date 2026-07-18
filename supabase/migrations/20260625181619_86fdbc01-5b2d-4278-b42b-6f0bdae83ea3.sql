-- Deduplicate existing rows before adding the unique constraint
DELETE FROM public.personal_signal_channels a
USING public.personal_signal_channels b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id
  AND a.tg_chat_id = b.tg_chat_id;

ALTER TABLE public.personal_signal_channels
  ADD CONSTRAINT personal_signal_channels_user_chat_unique UNIQUE (user_id, tg_chat_id);