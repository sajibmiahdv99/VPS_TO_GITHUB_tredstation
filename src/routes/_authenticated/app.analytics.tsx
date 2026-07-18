import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, Card } from "@/components/PageHeader";
import { getAnalytics } from "@/lib/user.functions";
import { DashboardCharts } from "@/components/DashboardCharts";

const opts = queryOptions({ queryKey: ["analytics"], queryFn: () => getAnalytics() });

export const Route = createFileRoute("/_authenticated/app/analytics")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : ""}`}>{value}</p>
    </Card>
  );
}

function Page() {
  const { data } = useSuspenseQuery(opts);
  const pnlTone = data.totalPnl > 0 ? "pos" : data.totalPnl < 0 ? "neg" : undefined;
  return (
    <>
      <PageHeader title="Analytics" subtitle="Performance across all closed trades." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total orders" value={String(data.totalOrders)} />
        <Stat label="Closed" value={String(data.closedOrders)} />
        <Stat label="Win rate" value={`${data.winRate.toFixed(1)}%`} />
        <Stat label="Net P&L" value={`$${data.totalPnl.toFixed(2)}`} tone={pnlTone} />
      </div>
      {data.balanceSeries.length > 0 && (
        <DashboardCharts
          balanceSeries={data.balanceSeries}
          pnlDistribution={data.pnlDistribution}
          wins={data.wins}
          losses={data.losses}
          winRate={data.winRate}
        />
      )}
    </>
  );
}
