import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, Card } from "@/components/PageHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { getOverview, getAnalytics } from "@/lib/user.functions";
import { DashboardCharts } from "@/components/DashboardCharts";
import { Activity, CreditCard, Network, Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const opts = queryOptions({ queryKey: ["overview"], queryFn: () => getOverview() });
const analyticsOpts = queryOptions({ queryKey: ["analytics"], queryFn: () => getAnalytics() });

export const Route = createFileRoute("/_authenticated/app/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(opts);
    context.queryClient.ensureQueryData(analyticsOpts);
  },
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const { data: analytics } = useSuspenseQuery(analyticsOpts);
  const sub = data.subscription;
  const balance = Number(data.balance?.available_balance ?? 0);
  const openPnl = Number(data.openPnl ?? 0);
  const involvedPct =
    balance > 0 ? Math.min(100, Math.round((Math.abs(openPnl) / balance) * 100)) : 0;

  return (
    <>
      <PageHeader
        title={`Hello, welcome to ${BRAND.name}`}
        subtitle="Account snapshot, live P&L, and connection status — built for clear, fast trading control."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/app/onboarding">
              Setup guide <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          variant="violet"
          label="Exchange balance"
          value={`$${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          hint="Available across synced accounts"
          icon={<Wallet className="h-5 w-5" />}
        />
        <KpiCard
          variant={openPnl >= 0 ? "emerald" : "rose"}
          label="Open P&L"
          value={`${openPnl >= 0 ? "+" : ""}$${openPnl.toFixed(2)}`}
          hint={`${data.activeTradesCount} active trades`}
          icon={<Activity className="h-5 w-5" />}
        />
        <KpiCard
          variant="magenta"
          label="Exchanges"
          value={String(data.exchangeCount)}
          hint="Connected accounts"
          icon={<Network className="h-5 w-5" />}
        />
        <KpiCard
          variant="rose"
          label="Plan"
          value={sub?.plan_code ?? "Free"}
          hint={sub?.status ?? "No subscription"}
          icon={<CreditCard className="h-5 w-5" />}
          action={
            !sub || sub.status !== "active" ? (
              <Button asChild size="sm" variant="secondary" className="bg-black/25 text-white hover:bg-black/35">
                <Link to="/app/billing">Upgrade</Link>
              </Button>
            ) : null
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col justify-between lg:col-span-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Capital involved
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{involvedPct}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open exposure vs available balance (approx.)
            </p>
          </div>
          <div className="mt-6">
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all"
                style={{ width: `${involvedPct}%` }}
              />
            </div>
            <div className="mt-4 flex justify-between text-xs text-muted-foreground">
              <span>
                Active <strong className="text-foreground">{data.activeTradesCount}</strong>
              </span>
              <span>
                Win rate{" "}
                <strong className="text-profit">{analytics.winRate?.toFixed?.(1) ?? "0"}%</strong>
              </span>
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Quick actions</p>
              <p className="text-xs text-muted-foreground">Jump to the most used workstation tools</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { to: "/app/sources", label: "Trade plan", desc: "Channels & signals" },
              { to: "/app/active-trades", label: "Active trades", desc: "Monitor positions" },
              { to: "/app/risk", label: "Risk", desc: "Limits & kill switch" },
              { to: "/app/exchanges", label: "Exchanges", desc: "API keys" },
              { to: "/app/leaderboard", label: "Leaderboard", desc: "Source quality" },
              { to: "/app/billing", label: "Billing", desc: "Crypto plans" },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to as never}
                className="card-lift rounded-xl border border-border bg-secondary/40 p-3 transition hover:border-primary/40"
              >
                <p className="text-sm font-medium">{a.label}</p>
                <p className="text-[11px] text-muted-foreground">{a.desc}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {analytics.balanceSeries.length > 0 ? (
        <DashboardCharts
          balanceSeries={analytics.balanceSeries}
          pnlDistribution={analytics.pnlDistribution}
          wins={analytics.wins}
          losses={analytics.losses}
          winRate={analytics.winRate}
        />
      ) : (
        <Card className="mt-6 border-dashed">
          <p className="text-sm font-medium">Charts will appear after closed trades</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect an exchange, enable a signal source, and run paper or live to populate analytics.
          </p>
        </Card>
      )}
    </>
  );
}
