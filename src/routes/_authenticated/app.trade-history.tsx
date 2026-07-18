import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listOrderHistory, exportTradeHistory } from "@/lib/user.functions";

const opts = queryOptions({ queryKey: ["order-history"], queryFn: () => listOrderHistory() });

export const Route = createFileRoute("/_authenticated/app/trade-history")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toIsoStart(d: string): string | null {
  if (!d) return null;
  return new Date(d + "T00:00:00.000Z").toISOString();
}
function toIsoEnd(d: string): string | null {
  if (!d) return null;
  return new Date(d + "T23:59:59.999Z").toISOString();
}

function Page() {
  const { data } = useSuspenseQuery(opts);
  const exportFn = useServerFn(exportTradeHistory);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState<{ total_pnl: number; total_trades: number; wins: number; losses: number; win_rate: number } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function fetchExport() {
    return exportFn({
      data: {
        start_date: toIsoStart(startDate),
        end_date: toIsoEnd(endDate),
        format: "csv",
      },
    });
  }

  async function refreshSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetchExport();
      setSummary(res.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetchExport();
      setSummary(res.summary);
      if (!res.rows.length) {
        toast.error("No trades in selected range");
        return;
      }
      const header = ["Date", "Symbol", "Side", "Quantity", "Entry Price", "Exit Price", "Leverage", "Realized P&L", "Status"];
      const lines = [header.join(",")];
      for (const r of res.rows) {
        lines.push([
          new Date(r.created_at).toISOString(),
          r.symbol,
          r.side,
          r.quantity,
          r.price ?? "",
          r.fill_price ?? "",
          r.leverage ?? "",
          r.pnl ?? "",
          r.status,
        ].map(csvEscape).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const range = startDate || endDate ? `${startDate || "start"}-${endDate || "end"}` : "all";
      a.download = `hermes-trade-history-${range}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.rows.length} trades`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader title="Trade history" subtitle="Closed and cancelled orders." />

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={refreshSummary} disabled={loadingSummary}>
            {loadingSummary ? "Loading…" : "Load summary"}
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          {summary && (
            <div className="ml-auto flex flex-wrap gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Realized P&amp;L</div>
                <div className={summary.total_pnl >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                  {summary.total_pnl.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Win rate</div>
                <div className="font-semibold">{(summary.win_rate * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Trades</div>
                <div className="font-semibold">{summary.total_trades}</div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {data.length === 0 ? (
        <EmptyState title="No history yet" description="Once a trade closes it will land here." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Date</TableHead><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead><TableHead>Entry</TableHead><TableHead>Exit</TableHead><TableHead>Status</TableHead><TableHead>P&amp;L</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{o.symbol}</TableCell>
                  <TableCell><span className={o.side === "buy" ? "text-emerald-400" : "text-red-400"}>{o.side?.toUpperCase()}</span></TableCell>
                  <TableCell>{o.quantity}</TableCell>
                  <TableCell>{o.price ?? "-"}</TableCell>
                  <TableCell>{o.fill_price ?? "-"}</TableCell>
                  <TableCell className="text-xs uppercase">{o.status}</TableCell>
                  <TableCell className={Number(o.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>{Number(o.pnl ?? 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
