import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlaskConical, Trash2, Play, Eye } from "lucide-react";
import {
  createBacktest,
  listBacktests,
  getBacktest,
  deleteBacktest,
} from "@/lib/backtest.functions";

const listQuery = queryOptions({
  queryKey: ["backtests"],
  queryFn: () => listBacktests(),
  refetchInterval: 5000,
});

export const Route = createFileRoute("/_authenticated/app/backtest")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listQuery),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: Page,
});

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function money(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { v: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    queued: { v: "secondary", label: "Queued" },
    running: { v: "default", label: "Running" },
    completed: { v: "default", label: "Completed" },
    failed: { v: "destructive", label: "Failed" },
  };
  const c = cfg[status] ?? { v: "outline" as const, label: status };
  return <Badge variant={c.v}>{c.label}</Badge>;
}

function Page() {
  const { data: runs } = useSuspenseQuery(listQuery);
  const qc = useQueryClient();
  const createFn = useServerFn(createBacktest);
  const deleteFn = useServerFn(deleteBacktest);

  const [openNew, setOpenNew] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  // Form state
  const defaultEnd = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [initialBalance, setInitialBalance] = useState("10000");
  const [feePct, setFeePct] = useState("0.05");
  const [riskPct, setRiskPct] = useState("1");
  const [symbols, setSymbols] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        name: name || `Backtest ${new Date().toLocaleDateString()}`,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        initial_balance: Number(initialBalance) || 10000,
        fee_pct: Number(feePct) || 0.05,
        risk_per_trade_percent: Number(riskPct) || 1,
        symbols: symbols ? symbols.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Backtest queued — চলতে শুরু করবে ১ মিনিটের মধ্যে");
      qc.invalidateQueries({ queryKey: ["backtests"] });
      setOpenNew(false);
      setName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["backtests"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backtesting"
        subtitle="ঐতিহাসিক সিগন্যালের উপর আপনার বর্তমান Risk Engine ও কনফিগারেশন সিমুলেট করুন।"
        actions={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button><FlaskConical className="h-4 w-4 mr-2" /> New backtest</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New backtest</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My strategy v1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Initial balance (USDT)</Label>
                    <Input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
                  </div>
                  <div>
                    <Label>Fee % per side</Label>
                    <Input type="number" step="0.01" value={feePct} onChange={(e) => setFeePct(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Risk per trade %</Label>
                    <Input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
                  </div>
                  <div>
                    <Label>Symbols (optional, csv)</Label>
                    <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="BTCUSDT,ETHUSDT" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  সর্বোচ্চ ৯০ দিন। শুধুমাত্র Binance-এ লিস্টেড সিম্বল সাপোর্টেড। ফাঁকা রাখলে আপনার সব সিগন্যাল ব্যবহার হবে।
                </p>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  <Play className="h-4 w-4 mr-2" />
                  {create.isPending ? "Queuing…" : "Run backtest"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {runs.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          এখনো কোনো backtest চালানো হয়নি। "New backtest" ক্লিক করে শুরু করুন।
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>Win rate</TableHead>
                <TableHead>Max DD</TableHead>
                <TableHead>Trades</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => {
                const s = (r.summary ?? {}) as {
                  total_pnl_pct?: number; win_rate?: number; max_drawdown_pct?: number; total_trades?: number;
                };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {r.status === "running" && (
                          <Progress value={r.progress} className="w-20 h-2" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.start_date).toLocaleDateString()} → {new Date(r.end_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className={s.total_pnl_pct == null ? "" : s.total_pnl_pct >= 0 ? "text-emerald-500" : "text-rose-500"}>
                      {pct(s.total_pnl_pct)}
                    </TableCell>
                    <TableCell>{s.win_rate != null ? `${(s.win_rate * 100).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell>{pct(s.max_drawdown_pct != null ? -s.max_drawdown_pct : null)}</TableCell>
                    <TableCell>{s.total_trades ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setViewId(r.id)} disabled={r.status !== "completed"}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {viewId && <RunDetail id={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

function RunDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const getFn = useServerFn(getBacktest);
  const q = useQuery({
    queryKey: ["backtest", id],
    queryFn: () => getFn({ data: { id } }),
  });
  if (q.isLoading) return null;
  if (!q.data) return null;
  const run = q.data.run as { name: string; summary?: { equity_curve?: { t: number; balance: number }[]; total_pnl?: number; ending_balance?: number } | null };
  const trades = q.data.trades as Array<{ id: string; symbol: string; side: string; entry_time: string; exit_time: string | null; entry_price: number; exit_price: number | null; pnl: number | null; pnl_pct: number | null; exit_reason: string }>;
  const equity = run.summary?.equity_curve ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{run.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 text-sm text-muted-foreground">Equity curve</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity.map((p) => ({ x: new Date(p.t).toLocaleDateString(), y: p.balance }))}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" hide />
                  <YAxis domain={["auto", "auto"]} width={60} />
                  <Tooltip />
                  <Area type="monotone" dataKey="y" stroke="hsl(var(--primary))" fill="url(#eq)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm">
              Ending balance: <span className="font-semibold">{money(run.summary?.ending_balance)}</span> · Net PnL: <span className="font-semibold">{money(run.summary?.total_pnl)}</span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>PnL</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.slice(0, 200).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.symbol}</TableCell>
                    <TableCell>{t.side}</TableCell>
                    <TableCell>{t.entry_price}</TableCell>
                    <TableCell>{t.exit_price ?? "—"}</TableCell>
                    <TableCell className={t.pnl != null && t.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}>
                      {t.pnl != null ? money(t.pnl) : "—"}
                    </TableCell>
                    <TableCell><Badge variant="outline">{t.exit_reason}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
