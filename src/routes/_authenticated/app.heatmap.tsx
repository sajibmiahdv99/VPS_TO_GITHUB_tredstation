import { createFileRoute, ErrorComponent, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPortfolioHeatMap, type HeatCell } from "@/lib/heatmap.functions";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

const heatQuery = queryOptions({
  queryKey: ["portfolio-heatmap"],
  queryFn: () => getPortfolioHeatMap(),
  refetchInterval: 15000,
});

export const Route = createFileRoute("/_authenticated/app/heatmap")({
  loader: ({ context }) => context.queryClient.ensureQueryData(heatQuery),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: Page,
});

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function cellColor(c: HeatCell): string {
  const pnl = c.unrealizedPnl;
  if (Math.abs(pnl) < 0.01) return "bg-muted/50 border-border";
  if (pnl > 0) {
    const intensity = Math.min(1, Math.abs(pnl) / 500);
    return `border-emerald-500/40`;
  }
  return `border-rose-500/40`;
}

function cellBg(c: HeatCell): React.CSSProperties {
  const pnl = c.unrealizedPnl;
  const t = Math.min(1, Math.abs(pnl) / 500);
  if (Math.abs(pnl) < 0.01) return { background: "hsl(var(--muted) / 0.3)" };
  if (pnl > 0) return { background: `rgba(16,185,129,${0.15 + t * 0.4})` };
  return { background: `rgba(244,63,94,${0.15 + t * 0.4})` };
}

function Page() {
  const { data } = useSuspenseQuery(heatQuery);

  if (data.cells.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Portfolio Heat Map" subtitle="Open exposure ও unrealized PnL ভিজ্যুয়ালাইজেশন।" />
        <Card className="p-12 text-center text-muted-foreground">
          কোনো ওপেন পজিশন নেই। সিগন্যাল প্রসেস হলে এখানে দেখা যাবে।
        </Card>
      </div>
    );
  }

  const max = Math.max(...data.cells.map((c) => c.notional));

  return (
    <div className="space-y-6">
      <PageHeader title="Portfolio Heat Map" subtitle="Open exposure ও unrealized PnL ভিজ্যুয়ালাইজেশন।" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Notional</div>
          <div className="text-2xl font-semibold mt-1">${fmt(data.totalNotional)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Unrealized PnL</div>
          <div className={`text-2xl font-semibold mt-1 ${data.totalUnrealizedPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            {data.totalUnrealizedPnl >= 0 ? "+" : ""}${fmt(data.totalUnrealizedPnl)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="text-2xl font-semibold mt-1">${fmt(data.balance)}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Exposure by Symbol</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.cells.map((c) => {
            const size = 0.5 + (c.notional / max) * 0.5;
            return (
              <div
                key={c.symbol}
                className={`rounded-lg border-2 p-4 transition-transform hover:scale-[1.02] ${cellColor(c)}`}
                style={{ ...cellBg(c), minHeight: `${80 + size * 80}px` }}
              >
                <div className="flex items-start justify-between">
                  <div className="font-semibold">{c.symbol}</div>
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    c.side === "buy" ? "bg-emerald-500/20 text-emerald-400" :
                    c.side === "sell" ? "bg-rose-500/20 text-rose-400" :
                    "bg-amber-500/20 text-amber-400"
                  }`}>{c.side === "buy" ? "LONG" : c.side === "sell" ? "SHORT" : "MIXED"}</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Exposure: <span className="text-foreground font-medium">{c.exposurePct.toFixed(1)}%</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Notional: <span className="text-foreground">${fmt(c.notional)}</span>
                </div>
                <div className={`mt-1 text-sm font-semibold ${c.unrealizedPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {c.unrealizedPnl >= 0 ? "+" : ""}${fmt(c.unrealizedPnl)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {c.positions} position{c.positions > 1 ? "s" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
