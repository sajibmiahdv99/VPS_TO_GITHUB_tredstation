import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { adminListTrades } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "trades"], queryFn: () => adminListTrades() });

export const Route = createFileRoute("/_authenticated/admin/trades")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  return (
    <>
      <PageHeader title="Trades" subtitle={`Last ${data.length} orders`} />
      {data.length === 0 ? <EmptyState title="No trades yet" description="Customer trades will appear here." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Fill</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{o.user_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-mono">{o.symbol}</TableCell>
                  <TableCell>{o.side}</TableCell>
                  <TableCell>{o.order_type}</TableCell>
                  <TableCell>{o.quantity}</TableCell>
                  <TableCell>{o.fill_price ?? "—"}</TableCell>
                  <TableCell className={Number(o.pnl) > 0 ? "text-green-500" : Number(o.pnl) < 0 ? "text-red-500" : ""}>{o.pnl != null ? Number(o.pnl).toFixed(2) : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
