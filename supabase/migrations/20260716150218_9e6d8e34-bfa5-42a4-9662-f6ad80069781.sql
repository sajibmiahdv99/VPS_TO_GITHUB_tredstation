
ALTER TABLE public.signal_sources
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.personal_signal_channels
  ADD COLUMN IF NOT EXISTS published_source_id uuid REFERENCES public.signal_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signal_sources_is_published ON public.signal_sources(is_published);
CREATE INDEX IF NOT EXISTS idx_signal_sources_owner_user ON public.signal_sources(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_signals_source ON public.signals(source_id);

-- Marketplace read: any authenticated user may SELECT published sources.
DROP POLICY IF EXISTS "src_read_published" ON public.signal_sources;
CREATE POLICY "src_read_published"
  ON public.signal_sources FOR SELECT
  TO authenticated
  USING (is_published = true);

-- Owner full manage on their own rows (update/delete). Keeps existing admin + curated policies intact.
DROP POLICY IF EXISTS "src_owner_read" ON public.signal_sources;
CREATE POLICY "src_owner_read"
  ON public.signal_sources FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "src_owner_update" ON public.signal_sources;
CREATE POLICY "src_owner_update"
  ON public.signal_sources FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "src_owner_delete" ON public.signal_sources;
CREATE POLICY "src_owner_delete"
  ON public.signal_sources FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());
