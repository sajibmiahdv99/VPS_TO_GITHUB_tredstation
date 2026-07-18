import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";
import { getMyRoles } from "@/lib/auth/role.functions";
import { canAccessAdminPath } from "@/lib/auth/permissions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const me = await getMyRoles();
    if (!me.isAdmin) throw redirect({ to: "/app" });
    const path = location.pathname;
    // Super can access everything; others need path capability
    if (!me.isSuperAdmin && !canAccessAdminPath(me.roles, path)) {
      // send to first allowed section
      if (me.isFinanceAdmin) throw redirect({ to: "/admin/payments" });
      if (me.isOpsAdmin) throw redirect({ to: "/admin/support" });
      throw redirect({ to: "/app" });
    }
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
