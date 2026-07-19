import { useState, type ReactNode } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, CreditCard, DollarSign, Radio, FileCheck, TrendingUp,
  ShieldCheck, UserCheck, Landmark, LifeBuoy, FileText, Settings, ArrowLeft, Menu, X, LogOut,
  Activity, SlidersHorizontal, Ticket, Download, Gift,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

type Nav = { label: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };

/** Super admin portal — only at /sadmin */
const nav: Nav[] = [
  { label: "Overview", to: "/sadmin", icon: LayoutDashboard, exact: true },
  { label: "Control Center", to: "/sadmin/control", icon: SlidersHorizontal },
  { label: "Promo codes", to: "/sadmin/promos", icon: Ticket },
  { label: "Rank bonuses", to: "/sadmin/rank-bonuses", icon: Gift },
  { label: "Export & analytics", to: "/sadmin/export", icon: Download },
  { label: "Users & roles", to: "/sadmin/users", icon: Users },
  { label: "Sources", to: "/sadmin/sources", icon: Radio },
  { label: "Monitoring", to: "/sadmin/monitoring", icon: Activity },
  { label: "Payments", to: "/sadmin/payments", icon: DollarSign },
  { label: "Subscriptions", to: "/sadmin/subscriptions", icon: CreditCard },
  { label: "Parsed signals", to: "/sadmin/parsed-signals", icon: FileCheck },
  { label: "Trades", to: "/sadmin/trades", icon: TrendingUp },
  { label: "Plans", to: "/sadmin/risk-templates", icon: ShieldCheck },
  { label: "Affiliates", to: "/sadmin/affiliates", icon: UserCheck },
  { label: "Payouts", to: "/sadmin/payouts", icon: Landmark },
  { label: "Support", to: "/sadmin/support", icon: LifeBuoy },
  { label: "Audit logs", to: "/sadmin/audit-logs", icon: FileText },
  { label: "Settings", to: "/sadmin/settings", icon: Settings },
];

export function SuperAdminShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const NavList = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
      {nav.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
              active
                ? "bg-violet-500/20 font-medium text-violet-300 shadow-[inset_3px_0_0_#8b5cf6]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="mesh-bg-subtle flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="p-5">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" variant="violet" />
            <div>
              <div className="text-sm font-semibold leading-none">Super admin</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-violet-400">
                /sadmin
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{BRAND.name}</div>
            </div>
          </div>
        </div>
        <NavList />
        <div className="mt-auto space-y-2 border-t border-border p-4">
          <Link to="/admin" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            Staff admin (/admin)
          </Link>
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
          <span className="font-semibold text-violet-400">/sadmin</span>
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
