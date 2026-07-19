import { useState, type ReactNode } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, CreditCard, DollarSign, Radio, FileCheck, TrendingUp,
  ShieldCheck, UserCheck, Landmark, LifeBuoy, FileText, Settings, ArrowLeft, Menu, X, LogOut,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { getMyRoles } from "@/lib/auth/role.functions";
import { canAccessAdminPath, hasCapability, type Capability } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type Nav = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  cap: Capability;
};

const adminNav: Nav[] = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard, exact: true, cap: "all_dashboards" },
  { label: "Monitoring", to: "/admin/monitoring", icon: Activity, cap: "trade_monitoring" },
  { label: "Users", to: "/admin/users", icon: Users, cap: "ops_user_state" },
  { label: "Subscriptions", to: "/admin/subscriptions", icon: CreditCard, cap: "view_revenue" },
  { label: "Payments", to: "/admin/payments", icon: DollarSign, cap: "view_payments" },
  { label: "Sources", to: "/admin/sources", icon: Radio, cap: "source_status" },
  { label: "Parsed Signals", to: "/admin/parsed-signals", icon: FileCheck, cap: "parsed_signals" },
  { label: "Trades", to: "/admin/trades", icon: TrendingUp, cap: "trade_monitoring" },
  { label: "Risk Templates", to: "/admin/risk-templates", icon: ShieldCheck, cap: "platform_settings" },
  { label: "Affiliates", to: "/admin/affiliates", icon: UserCheck, cap: "affiliate_eligibility" },
  { label: "Payouts", to: "/admin/payouts", icon: Landmark, cap: "review_payouts" },
  { label: "Support", to: "/admin/support", icon: LifeBuoy, cap: "support_tickets" },
  { label: "Audit Logs", to: "/admin/audit-logs", icon: FileText, cap: "all_dashboards" },
  { label: "Settings", to: "/admin/settings", icon: Settings, cap: "platform_settings" },
];

export function AdminShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => getMyRoles() });
  const roles = rolesQ.data?.roles ?? [];
  const caps = rolesQ.data?.capabilities ?? [];
  const visibleNav = adminNav.filter((item) => hasCapability(roles, item.cap));

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const roleBadge = rolesQ.data?.isSuperAdmin
    ? "Super admin"
    : rolesQ.data?.isFinanceAdmin && rolesQ.data?.isOpsAdmin
      ? "Staff"
      : rolesQ.data?.isFinanceAdmin
        ? "Finance"
        : rolesQ.data?.isOpsAdmin
          ? "Operations"
          : "Staff";

  const NavList = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3">
      {visibleNav.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
              active
                ? "bg-amber-500/15 font-medium text-amber-400 shadow-[inset_3px_0_0_#f59e0b]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {visibleNav.length === 0 && (
        <p className="px-3 py-4 text-xs text-muted-foreground">No admin modules for your role.</p>
      )}
    </nav>
  );

  return (
    <div className="mesh-bg-subtle flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="p-5">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" variant="admin" />
            <div>
              <div className="text-sm font-semibold leading-none">Admin panel</div>
              <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-400/90">{roleBadge}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{BRAND.name}</div>
            </div>
          </div>
        </div>
        <NavList />
        <div className="mt-auto space-y-2 border-t border-border p-4">
          {caps.length > 0 && (
            <p className="mb-2 text-[10px] text-muted-foreground">
              {caps.length} capabilities · {roles.filter((r) => r !== "user").join(", ") || "staff"}
            </p>
          )}
          {rolesQ.data?.isSuperAdmin && (
            <Link to="/sadmin" className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300">
              Super admin (/sadmin)
            </Link>
          )}
          <Link to="/app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border p-4 lg:hidden">
          <button type="button" onClick={() => setOpen((v) => !v)} className="p-2">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-semibold text-amber-400">{roleBadge}</span>
          <Link to="/app" className="p-2 text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
        {open && (
          <div className="max-h-[70vh] overflow-y-auto border-b border-border bg-sidebar p-3 lg:hidden">
            <NavList onClick={() => setOpen(false)} />
          </div>
        )}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div>
      </main>
    </div>
  );
}
