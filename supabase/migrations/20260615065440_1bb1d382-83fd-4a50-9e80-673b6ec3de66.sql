
-- Defense-in-depth: only admins may write user_roles
CREATE POLICY "user_roles_restrict_writes_to_admin"
ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Plan tier rank helper (higher rank = higher tier)
CREATE OR REPLACE FUNCTION public.plan_rank(code text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE code
    WHEN 'starter' THEN 1
    WHEN 'premium' THEN 2
    WHEN 'professional' THEN 3
    ELSE 0
  END
$$;

-- Has-active-plan helper (security definer so RLS on subscriptions doesn't recurse)
CREATE OR REPLACE FUNCTION public.user_has_plan_at_least(_user_id uuid, _min text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.status IN ('active','trialing')
      AND public.plan_rank(s.plan_code) >= public.plan_rank(_min)
  )
$$;

-- Replace permissive signals SELECT policy with a plan-gated one
DROP POLICY IF EXISTS "sig_read_auth" ON public.signals;
CREATE POLICY "sig_read_by_plan" ON public.signals FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (
    SELECT 1 FROM public.signal_sources src
    WHERE src.id = signals.source_id
      AND (
        src.plan_minimum IS NULL
        OR public.user_has_plan_at_least(auth.uid(), src.plan_minimum)
      )
  )
);
