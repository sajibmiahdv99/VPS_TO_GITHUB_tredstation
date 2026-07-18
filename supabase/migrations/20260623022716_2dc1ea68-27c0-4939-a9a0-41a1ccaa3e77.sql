-- Restrict orders mutations to server-side (service_role) only.
DROP POLICY IF EXISTS orders_self_rw ON public.orders;
CREATE POLICY orders_self_select ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
-- service_role retains full access and bypasses RLS for server-side workers.

-- Profiles: tighten table-level grants so only RLS-scoped reads/writes are
-- exposed to the authenticated role. RLS continues to scope rows to the owner;
-- the admin policy still allows admin reads.
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;