import { useState, type ReactNode } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Network, Send, ShieldCheck, TrendingUp, History,
  BarChart3, CreditCard, Users, LifeBuoy, Settings, LogOut, Menu, X, Shield, Flame, FlaskConical, User, Store, SlidersHorizontal,
  Rocket, Trophy, Home,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import { getMyRoles } from "@/lib/auth/role.functions";
import { getOverview } from "@/lib/user.functions";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type Nav = { label: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; items: Nav[] };

const navGroups: NavGroup[] = [
  {
    label: "Trade",
    items: [
      { label: "Overview", to: "/app", icon: LayoutDashboard, exact: true },
      { label: "Setup guide", to: "/app/onboarding", icon: Rocket },
      { label: "Exchanges", to: "/app/exchanges", icon: Network },
      { label: "Trade plan", to: "/app/sources", icon: Send },
      { label: "Active trades", to: "/app/active-trades", icon: TrendingUp },
      { label: "Risk", to: "/app/risk", icon: ShieldCheck },
    ],
  },
  {
    label: "Research",
    items: [
      { label: "Marketplace", to: "/app/marketplace", icon: Store },
      { label: "Leaderboard", to: "/app/leaderboard", icon: Trophy },
      { label: "Heat map", to: "/app/heatmap", icon: Flame },
      { label: "Backtest", to: "/app/backtest", icon: FlaskConical },
      { label: "Risk optimizer", to: "/app/risk-optimizer", icon: SlidersHorizontal },
      { label: "Trade history", to: "/app/trade-history", icon: History },
      { label: "Analytics", to: "/app/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Billing", to: "/app/billing", icon: CreditCard },
      { label: "Referrals", to: "/app/referrals", icon: Users },
      { label: "Support", to: "/app/support", icon: LifeBuoy },
      { label: "Preferences", to: "/app/preferences", icon: Settings },
      { label: "Profile", to: "/app/profile", icon: User },
    ],
  },
];

const mobileTabs: Nav[] = [
  { label: "Home", to: "/app", icon: Home, exact: true },
  { label: "Trades", to: "/app/active-trades", icon: TrendingUp },
  { label: "Sources", to: "/app/sources", icon: Send },
  { label: "More", to: "/app/profile", icon: Menu },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });
  const roles = useQuery({ queryKey: ["my-roles"], queryFn: () => getMyRoles() });
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => getOverview() });

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const isActive = (item: Nav) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  const NavList = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to as never}
                  onClick={onClick}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active ? "nav-active font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {roles.data?.isSuperAdmin && (
        <Link
          to="/sadmin"
          onClick={onClick}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-violet-400 hover:bg-violet-500/10"
        >
          <Shield className="h-4 w-4" /> Super admin
          <span className="ml-auto font-mono text-[10px] opacity-70">/sadmin</span>
        </Link>
      )}
      {roles.data?.isAdmin && !roles.data?.isSuperAdmin && (
        <Link
          to="/admin"
          onClick={onClick}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/10"
        >
          <Shield className="h-4 w-4" /> Admin panel
        </Link>
      )}
      {roles.data?.isSuperAdmin && (
        <Link
          to="/admin"
          onClick={onClick}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
        >
          Staff admin (/admin)
        </Link>
      )}
    </nav>
  );

  const bal = Number(overview.data?.balance?.available_balance ?? 0);
  const plan = overview.data?.subscription?.plan_code ?? "free";

  return (
    <div className="mesh-bg-subtle flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="p-5">
          <Link to="/app" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[11px] font-bold text-primary-foreground shadow-lg shadow-primary/30">
              {BRAND.logoInitial}
            </span>
            <div>
              <div className="text-sm font-semibold tracking-tight">{BRAND.name}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {BRAND.tagline}
              </div>
            </div>
          </Link>
        </div>
        <NavList />
        <div className="mt-auto border-t border-sidebar-border p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
              {profile.data?.full_name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile.data?.full_name || "User"}</div>
              <div className="truncate text-xs text-muted-foreground">{profile.data?.email}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 hidden items-center justify-between gap-4 border-b border-border bg-background/80 px-6 py-3 backdrop-blur-xl lg:flex">
          <div className="text-sm text-muted-foreground">
            Workstation · <span className="text-foreground/90">{BRAND.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-card/80 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Balance </span>
              <span className="font-semibold tabular-nums">${bal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium capitalize text-primary">
              {plan}
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {profile.data?.full_name?.[0]?.toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-border bg-background/90 p-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-xl p-2 hover:bg-accent">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-[10px] font-bold text-primary-foreground">
              {BRAND.logoInitial}
            </span>
            <span className="font-semibold">{BRAND.name}</span>
          </div>
          <button type="button" onClick={signOut} className="rounded-xl p-2 text-muted-foreground hover:bg-accent">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        {open && (
          <div className="max-h-[70vh] overflow-y-auto border-b border-border bg-sidebar p-3 lg:hidden">
            <NavList onClick={() => setOpen(false)} />
          </div>
        )}

        <div className="flex-1 p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-sidebar/95 backdrop-blur-xl lg:hidden">
          {mobileTabs.map((tab) => {
            const active =
              tab.to === "/app"
                ? pathname === "/app" || pathname === "/app/"
                : tab.label === "More"
                  ? !["/app", "/app/", "/app/active-trades", "/app/sources"].some(
                      (p) => pathname === p || (p !== "/app" && pathname.startsWith(p)),
                    ) && pathname.startsWith("/app")
                  : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.label}
                to={tab.to as never}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
