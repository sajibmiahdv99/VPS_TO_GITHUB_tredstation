import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, EmptyState, Card } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getLeaderboard } from "@/lib/leaderboard.functions";
import { BRAND } from "@/lib/brand";

const opts = queryOptions({
  queryKey: ["leaderboard"],
  queryFn: () => getLeaderboard(),
});

export const Route = createFileRoute("/_authenticated/app/leaderboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle={`${BRAND.name} signal quality ranking — win rate, sample size, and PnL.`}
      />
      <Card className="mb-4 text-xs text-muted-foreground">
        Quality Score (0–100) combines historical win rate, trade sample size, and realized PnL. Low-quality
        sources can be auto-muted by the risk gate.
      </Card>
      {data.length === 0 ? (
        <EmptyState title="No sources yet" description="Publish or activate signal sources to populate the board." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Win rate</TableHead>
                <TableHead>Trades</TableHead>
                <TableHead>Realized PnL</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r, i) => (
                <TableRow key={r.sourceId}>
                  <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{r.code}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.qualityScore >= 60 ? "default" : "outline"}>{r.qualityScore}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.winRate != null ? `${r.winRate.toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{r.trades}</TableCell>
                  <TableCell
                    className={`text-sm font-medium ${r.realizedPnl >= 0 ? "text-emerald-400" : "text-destructive"}`}
                  >
                    {r.realizedPnl.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs uppercase">{r.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
