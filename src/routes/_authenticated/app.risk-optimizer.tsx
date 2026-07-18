import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlidersHorizontal, Trash2, Play, Eye, Check } from "lucide-react";
import {
  createRiskOptimization,
  listRiskOptimizations,
  getRiskOptimization,
  deleteRiskOptimization,
  applyOptimizedConfig,
} from "@/lib/backtest.functions";

const listQuery = queryOptions({
  queryKey: ["risk-optimizations"],
  queryFn: () => listRiskOptimizations(),
  refetchInterval: 5000,
});

export const Route = createFileRoute("/_authenticated/app/risk-optimizer")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listQuery),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  component: Page,
});

type ParamKey = "risk_per_trade_percent" | "max_trade_size_percent" | "max_open_positions" | "hold_timeout_hours";

const PARAM_META: Record<ParamKey, { label: string; default: string; int: boolean }> = {
  risk_per_trade_percent: { label: "Risk per trade %", default: "0.5, 1, 2", int: false },
  max_trade_size_percent: { label: "Max trade size %", default: "5, 10, 20", int: false },
  max_open_positions: { label: "Max open positions", default: "3, 5, 10", int: true },
  hold_timeout_hours: { label: "Hold timeout (hours)", default: "24, 48", int: true },
};

function parseList(s: string, int: boolean): number[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (int ? parseInt(x, 10) : Number(x)))
    .filter((n) => Number.isFinite(n));
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
  const createFn = useServerFn(createRiskOptimization);
  const deleteFn = useServerFn(deleteRiskOptimization);

  const [openNew, setOpenNew] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

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
  const [symbols, setSymbols] = useState("");

  const [vary, setVary] = useState<Record<ParamKey, boolean>>({
    risk_per_trade_percent: true,
    max_trade_size_percent: false,
    max_open_positions: false,
    hold_timeout_hours: false,
  });
  const [values, setValues] = useState<Record<ParamKey, string>>({
    risk_per_trade_percent: PARAM_META.risk_per_trade_percent.default,
    max_trade_size_percent: PARAM_META.max_trade_size_percent.default,
    max_open_positions: PARAM_META.max_open_positions.default,
    hold_timeout_hours: PARAM_META.hold_timeout_hours.default,
  });

  const gridArrays = useMemo(() => {
    const g: Partial<Record<ParamKey, number[]>> = {};
    (Object.keys(PARAM_META) as ParamKey[]).forEach((k) => {
      if (vary[k]) {
        const arr = parseList(values[k], PARAM_META[k].int).slice(0, 5);
        if (arr.length > 0) g[k] = arr;
      }
    });
    return g;
  }, [vary, values]);

  const totalCombos = useMemo(() => {
    const arrays = Object.values(gridArrays);
    if (arrays.length === 0) return 0;
    return arrays.reduce((acc, a) => acc * a.length, 1);
  }, [gridArrays]);

  const disabled = totalCombos === 0 || totalCombos > 24;

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        name: name || `Optimizer ${new Date().toLocaleDateString()}`,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        initial_balance: Number(initialBalance) || 10000,
        fee_pct: Number(feePct) || 0.05,
        symbols: symbols ? symbols.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        grid: gridArrays,
      },
    }),
    onSuccess: () => {
      toast.success("Optimization queued — combos will run one per minute");
      qc.invalidateQueries({ queryKey: ["risk-optimizations"] });
      setOpenNew(false);
      setName("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["risk-optimizations"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Risk Optimizer"
        subtitle="একাধিক ঝুঁকি কনফিগারেশন সিমুলেট করে সেরা কম্বিনেশন খুঁজে বের করুন — return-over-max-drawdown স্কোর অনুযায়ী।"
        actions={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button><SlidersHorizontal className="h-4 w-4 mr-2" /> New optimization</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New optimization</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My grid v1" />
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
                <div>
                  <Label>Symbols (optional, csv)</Label>
                  <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="BTCUSDT,ETHUSDT" />
                </div>

                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="text-sm font-medium">Parameters to sweep</div>
                  {(Object.keys(PARAM_META) as ParamKey[]).map((k) => (
                    <div key={k} className="grid grid-cols-[auto_1fr] gap-3 items-center">
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <Switch
                          checked={vary[k]}
                          onCheckedChange={(v) => setVary({ ...vary, [k]: v })}
                        />
                        <Label className="text-xs">{PARAM_META[k].label}</Label>
                      </div>
                      <Input
                        disabled={!vary[k]}
                        value={values[k]}
                        onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                        placeholder={`e.g. ${PARAM_META[k].default}`}
                      />
                    </div>
                  ))}
                </div>

                <div className={`rounded-lg p-3 text-sm ${disabled ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
                  {totalCombos === 0 && "At least one parameter must be varied with valid values."}
                  {totalCombos > 0 && totalCombos <= 24 && (
                    <>{totalCombos} total configuration{totalCombos > 1 ? "s" : ""} (~{totalCombos} minute{totalCombos > 1 ? "s" : ""} to complete at 1/min)</>
                  )}
                  {totalCombos > 24 && `${totalCombos} configurations exceeds the 24-combo limit. Please narrow your grid.`}
                </div>

                <Button onClick={() => create.mutate()} disabled={disabled || create.isPending}>
                  <Play className="h-4 w-4 mr-2" />
                  {create.isPending ? "Queuing…" : "Run optimization"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {runs.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          এখনো কোনো optimization চালানো হয়নি। "New optimization" ক্লিক করে শুরু করুন।
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.start_date).toLocaleDateString()} → {new Date(r.end_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={(r.completed_combos / Math.max(r.total_combos, 1)) * 100} className="w-24 h-2" />
                      <span className="text-xs text-muted-foreground">{r.completed_combos}/{r.total_combos}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewId(r.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {viewId && <RunDetail id={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

type OptRun = {
  id: string; name: string; status: string; best_backtest_run_id: string | null;
  total_combos: number; completed_combos: number; results: unknown; error: string | null;
};
type ChildRow = {
  id: string; name: string; status: string; progress: number;
  config: { risk_per_trade_percent?: number; max_trade_size_percent?: number; max_open_positions?: number; hold_timeout_hours?: number };
  summary: { total_trades?: number; total_pnl_pct?: number; max_drawdown_pct?: number; win_rate?: number } | null;
  error: string | null;
};
type ResultRow = {
  backtest_run_id: string;
  config: ChildRow["config"];
  summary: ChildRow["summary"];
  score: number | null;
  eligible: boolean;
};

function RunDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const getFn = useServerFn(getRiskOptimization);
  const applyFn = useServerFn(applyOptimizedConfig);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["risk-optimization", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 4000,
  });

  const apply = useMutation({
    mutationFn: (btId: string) => applyFn({ data: { backtest_run_id: btId } }),
    onSuccess: () => {
      toast.success("Configuration applied to your risk settings");
      qc.invalidateQueries({ queryKey: ["my-risk-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading || !q.data) return null;
  const run = q.data.run as OptRun;
  const children = (q.data.children ?? []) as ChildRow[];
  const results = (Array.isArray(run.results) ? run.results : null) as ResultRow[] | null;

  const rows: ResultRow[] = results && results.length > 0
    ? [...results].sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return (b.score ?? -Infinity) - (a.score ?? -Infinity);
      })
    : [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{run.name}</DialogTitle></DialogHeader>

        {run.status !== "completed" ? (
          <Card className="p-4 space-y-3">
            <div className="text-sm">
              Progress: <span className="font-semibold">{run.completed_combos}/{run.total_combos}</span>
            </div>
            <Progress value={(run.completed_combos / Math.max(run.total_combos, 1)) * 100} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Combo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {children.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell><Progress value={c.progress} className="w-24 h-2" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : rows.length === 0 || rows.every((r) => !r.eligible) ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            কোনো configuration statistically meaningful ছিল না (৫টির কম ট্রেড)। দীর্ঘতর সময়সীমা বেছে নিন।
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Score</TableHead>
                  <TableHead>Risk %</TableHead>
                  <TableHead>Size %</TableHead>
                  <TableHead>Max pos</TableHead>
                  <TableHead>Timeout</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>PnL %</TableHead>
                  <TableHead>Max DD %</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isBest = r.backtest_run_id === run.best_backtest_run_id;
                  return (
                    <TableRow key={r.backtest_run_id} className={isBest ? "bg-primary/10" : r.eligible ? "" : "opacity-50"}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isBest && <Badge variant="default">Best</Badge>}
                          {r.eligible ? (r.score?.toFixed(2) ?? "—") : <Badge variant="outline">insufficient trades</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{r.config?.risk_per_trade_percent ?? "—"}</TableCell>
                      <TableCell>{r.config?.max_trade_size_percent ?? "—"}</TableCell>
                      <TableCell>{r.config?.max_open_positions ?? "—"}</TableCell>
                      <TableCell>{r.config?.hold_timeout_hours ?? "—"}h</TableCell>
                      <TableCell>{r.summary?.total_trades ?? "—"}</TableCell>
                      <TableCell className={r.summary?.total_pnl_pct != null && r.summary.total_pnl_pct >= 0 ? "text-emerald-500" : "text-rose-500"}>
                        {r.summary?.total_pnl_pct != null ? `${r.summary.total_pnl_pct.toFixed(2)}%` : "—"}
                      </TableCell>
                      <TableCell>{r.summary?.max_drawdown_pct != null ? `${r.summary.max_drawdown_pct.toFixed(2)}%` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={isBest ? "default" : "outline"}
                          disabled={!r.eligible || apply.isPending}
                          onClick={() => {
                            if (confirm("Apply this configuration to your risk settings?")) apply.mutate(r.backtest_run_id);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> Apply
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
