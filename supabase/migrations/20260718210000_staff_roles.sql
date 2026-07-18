-- Staff roles: super_admin, finance_admin, operations_admin
-- Legacy role "admin" remains and is treated as super_admin in helpers.

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations_admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Super power: legacy admin OR super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_finance_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'finance_admin'::public.app_role
    );
$$;

CREATE OR REPLACE FUNCTION public.is_operations_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'operations_admin'::public.app_role
    );
$$;

-- Any staff who can open the admin area
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::public.app_role,
        'super_admin'::public.app_role,
        'finance_admin'::public.app_role,
        'operations_admin'::public.app_role
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_operations_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(uuid) TO authenticated, service_role;

-- Allow super admins to manage roles (keep legacy admin too)
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_super_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Staff can read own roles (already have select own) — allow super to read all via policy above

-- Finance read on money tables
DROP POLICY IF EXISTS "pay_finance_read" ON public.payments;
CREATE POLICY "pay_finance_read" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

DROP POLICY IF EXISTS "invoices_finance_read" ON public.invoices;
CREATE POLICY "invoices_finance_read" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

DROP POLICY IF EXISTS "po_finance_all" ON public.payouts;
CREATE POLICY "po_finance_all" ON public.payouts
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

DROP POLICY IF EXISTS "subs_finance_read" ON public.subscriptions;
CREATE POLICY "subs_finance_read" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

DROP POLICY IF EXISTS "ac_finance_read" ON public.affiliate_commissions;
CREATE POLICY "ac_finance_read" ON public.affiliate_commissions
  FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

-- Operations read/write operational surfaces
DROP POLICY IF EXISTS "st_ops_all" ON public.support_tickets;
CREATE POLICY "st_ops_all" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.is_operations_admin(auth.uid()))
  WITH CHECK (public.is_operations_admin(auth.uid()));

DROP POLICY IF EXISTS "sig_ops_read" ON public.signals;
CREATE POLICY "sig_ops_read" ON public.signals
  FOR SELECT TO authenticated
  USING (public.is_operations_admin(auth.uid()));

DROP POLICY IF EXISTS "orders_ops_read" ON public.orders;
CREATE POLICY "orders_ops_read" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_operations_admin(auth.uid()));

DROP POLICY IF EXISTS "src_ops_update" ON public.signal_sources;
CREATE POLICY "src_ops_update" ON public.signal_sources
  FOR UPDATE TO authenticated
  USING (public.is_operations_admin(auth.uid()))
  WITH CHECK (public.is_operations_admin(auth.uid()));

DROP POLICY IF EXISTS "src_ops_select" ON public.signal_sources;
CREATE POLICY "src_ops_select" ON public.signal_sources
  FOR SELECT TO authenticated
  USING (public.is_operations_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "aff_ops_all" ON public.affiliates;
CREATE POLICY "aff_ops_all" ON public.affiliates
  FOR ALL TO authenticated
  USING (public.is_operations_admin(auth.uid()))
  WITH CHECK (public.is_operations_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles_ops_read" ON public.profiles;
CREATE POLICY "profiles_ops_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_operations_admin(auth.uid()) OR public.is_finance_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles_ops_suspend" ON public.profiles;
CREATE POLICY "profiles_ops_suspend" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_operations_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_operations_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Promote existing admins note: keep role 'admin'; app treats as super_admin
