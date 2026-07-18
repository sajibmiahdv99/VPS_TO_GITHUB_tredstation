import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Store, TrendingUp, Users, BarChart3, Trash2 } from "lucide-react";
import { PageHeader, Card, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listPublishedStrategies,
  listMyPublishedStrategies,
  subscribeToStrategy,
  unsubscribeFromStrategy,
  unpublishStrategy,
  type PublishedStrategy,
} from "@/lib/marketplace.functions";

const marketOpts = queryOptions({ queryKey: ["marketplace"], queryFn: () => listPublishedStrategies() });
const myOpts = queryOptions({ queryKey: ["marketplace-mine"], queryFn: () => listMyPublishedStrategies() });

export const Route = createFileRoute("/_authenticated/app/marketplace")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(marketOpts),
      context.queryClient.ensureQueryData(myOpts),
    ]),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

type SortKey = "win_rate" | "total_pnl" | "subscribers";

function fmtPct(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
function fmtPctRaw(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
function fmtNum(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function Page() {
  const qc = useQueryClient();
  const { data: market } = useSuspenseQuery(marketOpts);
  const { data: mine } = useSuspenseQuery(myOpts);

  const [sort, setSort] = useState<SortKey>("win_rate");

  const subscribeFn = useServerFn(subscribeToStrategy);
  const unsubscribeFn = useServerFn(unsubscribeFromStrategy);
  const unpublishFn = useServerFn(unpublishStrategy);

  const subMut = useMutation({
    mutationFn: (sourceId: string) => subscribeFn({ data: { sourceId } }),
    onSuccess: () => {
      toast.success("Subscribed to strategy.");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unsubMut = useMutation({
    mutationFn: (sourceId: string) => unsubscribeFn({ data: { sourceId } }),
    onSuccess: () => {
      toast.success("Unsubscribed.");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unpubMut = useMutation({
    mutationFn: (sourceId: string) => unpublishFn({ data: { sourceId } }),
    onSuccess: () => {
      toast.success("Strategy unpublished.");
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["marketplace-mine"] });
      qc.invalidateQueries({ queryKey: ["personal-signal-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = useMemo(() => {
    const rows = [...market];
    rows.sort((a, b) => {
      if (sort === "win_rate") return (b.stats.win_rate ?? -1) - (a.stats.win_rate ?? -1);
      if (sort === "total_pnl") return (b.stats.total_pnl ?? 0) - (a.stats.total_pnl ?? 0);
      return (b.stats.subscriber_count ?? 0) - (a.stats.subscriber_count ?? 0);
    });
    return rows;
  }, [market, sort]);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Strategy Marketplace"
          subtitle="Browse verified track records and subscribe to strategies published by other traders."
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="win_rate">Win rate</SelectItem>
              <SelectItem value="total_pnl">Total P&amp;L</SelectItem>
              <SelectItem value="subscribers">Subscribers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No strategies published yet"
          description="When traders publish their signal channels as strategies, they'll show up here with verified track records."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((s) => (
            <StrategyCard
              key={s.id}
              s={s}
              onSubscribe={() => subMut.mutate(s.id)}
              onUnsubscribe={() => unsubMut.mutate(s.id)}
              pending={subMut.isPending || unsubMut.isPending}
            />
          ))}
        </div>
      )}

      <div className="mt-10">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">My published strategies</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Strategies you've published to the marketplace.</p>
          </div>
        </div>
        {mine.length === 0 ? (
          <EmptyState
            title="You haven't published any strategies"
            description="Publish a signal channel from Trade plan → 'Publish as strategy' to appear in the marketplace."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((s) => (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Store className="h-4 w-4 text-primary" />
                      <p className="font-medium truncate">{s.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Users className="mr-1 inline h-3 w-3" />
                      {s.stats.subscriber_count} subscriber{s.stats.subscriber_count === 1 ? "" : "s"}
                      {" · "}
                      {s.stats.closed_trades} closed trades
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Unpublish "${s.name}"? Existing subscribers will keep their reference but new signals will not fan out.`)) {
                        unpubMut.mutate(s.id);
                      }
                    }}
                    disabled={unpubMut.isPending}
                  >
                    <Trash2 className="h-3 w-3" /> Unpublish
                  </Button>
                </div>
                <StatsRow stats={s.stats} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StrategyCard({ s, onSubscribe, onUnsubscribe, pending }: {
  s: PublishedStrategy;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  pending: boolean;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <p className="font-medium truncate">{s.name}</p>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
              <ShieldCheck className="h-3 w-3" /> Verified track record
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            by {s.owner_display_name} · {s.source_type}
          </p>
          {s.description && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
        </div>
        <div>
          {s.is_owner ? (
            <Button size="sm" variant="outline" disabled>Your strategy</Button>
          ) : s.is_subscribed ? (
            <Button size="sm" variant="outline" onClick={onUnsubscribe} disabled={pending}>Unsubscribe</Button>
          ) : (
            <Button size="sm" onClick={onSubscribe} disabled={pending}>Subscribe</Button>
          )}
        </div>
      </div>
      <StatsRow stats={s.stats} />
    </Card>
  );
}

function StatsRow({ stats }: { stats: PublishedStrategy["stats"] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs sm:grid-cols-6">
      <Stat label="Win rate" value={fmtPct(stats.win_rate, 1)} />
      <Stat label="Trades" value={String(stats.closed_trades)} />
      <Stat label="Total P&L" value={fmtNum(stats.total_pnl, 2)} tone={stats.total_pnl >= 0 ? "up" : "down"} />
      <Stat label="Max DD" value={fmtPctRaw(stats.max_drawdown_pct)} tone="down" />
      <Stat label="PF" value={stats.profit_factor === null ? "—" : fmtNum(stats.profit_factor, 2)} />
      <Stat label="Subs" value={String(stats.subscriber_count)} />
      <div className="col-span-3 mt-1 flex items-center gap-1 text-[10px] text-muted-foreground sm:col-span-6">
        <BarChart3 className="h-3 w-3" />
        Active {stats.active_days} day{stats.active_days === 1 ? "" : "s"} · {stats.total_signals} signals total
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-emerald-400" : tone === "down" ? "text-rose-400" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-medium ${color}`}>{value}</div>
    </div>
  );
}
