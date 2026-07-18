-- AGENT TRED: admin control of signal sources per plan + channel metadata

ALTER TABLE public.signal_sources
  ADD COLUMN IF NOT EXISTS channel_ref text,
  ADD COLUMN IF NOT EXISTS channel_url text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.signal_sources.plan_minimum IS
  'Minimum plan code required (starter/premium/professional). NULL = free for any active user.';
COMMENT ON COLUMN public.signal_sources.channel_ref IS
  'Telegram @channel, chat id, or webhook label shown to entitled users.';

-- Plan rank from plans.sort_order when available (fallback to known codes)
CREATE OR REPLACE FUNCTION public.plan_rank(code text)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.sort_order FROM public.plans p WHERE p.code = plan_rank.code LIMIT 1),
    CASE plan_rank.code
      WHEN 'starter' THEN 1
      WHEN 'premium' THEN 2
      WHEN 'professional' THEN 3
      ELSE 0
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_plan_at_least(_user_id uuid, _min text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _min IS NULL OR btrim(_min) = '' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active', 'trialing')
        AND public.plan_rank(s.plan_code) >= public.plan_rank(_min)
    )
  END;
$$;

-- Users only see platform sources they are entitled to (admins see all)
DROP POLICY IF EXISTS "src_read_all_auth" ON public.signal_sources;
DROP POLICY IF EXISTS "src_read_by_plan" ON public.signal_sources;
CREATE POLICY "src_read_by_plan" ON public.signal_sources
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      status = 'active'
      AND (
        -- marketplace / user-owned published
        (is_published = true)
        OR (owner_user_id = auth.uid())
        OR (
          is_platform_managed = true
          AND (plan_minimum IS NULL OR public.user_has_plan_at_least(auth.uid(), plan_minimum))
        )
        -- non-platform without owner still visible if no plan gate
        OR (
          COALESCE(is_platform_managed, false) = false
          AND owner_user_id IS NULL
          AND (plan_minimum IS NULL OR public.user_has_plan_at_least(auth.uid(), plan_minimum))
        )
      )
    )
  );

-- Rename curated seeds to AGENT TRED (if still old codes)
UPDATE public.signal_sources
SET name = replace(name, 'Hermes', 'AGENT TRED'),
    description = replace(coalesce(description, ''), 'Hermes', 'AGENT TRED')
WHERE name ILIKE '%hermes%' OR description ILIKE '%hermes%';
