import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { PageHeader, Card } from "@/components/PageHeader";
import { adminMonitoring } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Download, X } from "lucide-react";

const searchSchema = z.object({
  status: z.string().optional(),
  user: z.string().optional(),
  reason: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});
type MonSearch = z.infer<typeof searchSchema>;

const STATUSES = ["PENDING", "OPEN", "FILLED", "CLOSED", "CANCELLED", "FAILED"] as const;

function toIsoOrUndef(local?: string) {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function buildOpts(s: MonSearch) {
  return queryOptions({
    queryKey: ["admin", "monitoring", s],
    queryFn: () =>
      adminMonitoring({
        data: {
          status: s.status || undefined,
          userQuery: s.user || undefined,
          reasonQuery: s.reason || undefined,
          from: toIsoOrUndef(s.from),
          to: toIsoOrUndef(s.to),
          limit: s.limit,
        },
      }),
    refetchInterval: 15_000,
  });
}

export const Route = createFileRoute("/_authenticated/admin/monitoring")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(buildOpts(deps)),
  component: Page,
  errorComponent: ({ error }) => (
    <p className="text-sm text-destructive">{error.message}</p>
  ),
  notFoundComponent: () => <p>Not found.</p>,
});

const statusVariant: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-500",
  OPEN: "bg-blue-500/15 text-blue-500",
  FILLED: "bg-emerald-500/15 text-emerald-500",
  CLOSED: "bg-emerald-500/15 text-emerald-500",
  CANCELLED: "bg-muted text-muted-foreground",
  FAILED: "bg-destructive/15 text-destructive",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        statusVariant[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, headers: string[]) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(buildOpts(search));
  const qc = useQueryClient();

  const setSearch = (patch: Partial<MonSearch>) =>
    navigate({
      search: (prev: MonSearch) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof MonSearch)[]) {
          if (next[k] === "" || next[k] === undefined) delete next[k];
        }
        return next;
      },
    });

  const hasFilters =
    !!search.status || !!search.user || !!search.reason || !!search.from || !!search.to;

  const exportExecutions = () =>
    downloadCsv(
      `executions_${new Date().toISOString().slice(0, 10)}.csv`,
      data.recent.map((o) => ({
        created_at: o.created_at,
        order_id: o.id,
        user_id: o.user_id,
        user_email: o.user_email,
        user_name: o.user_name,
        symbol: o.symbol,
        side: o.side,
        status: o.status,
        quantity: o.quantity,
        price: o.price,
        fill_price: o.fill_price,
        error_message: o.error_message,
      })),
      [
        "created_at", "order_id", "user_id", "user_email", "user_name",
        "symbol", "side", "status", "quantity", "price", "fill_price", "error_message",
      ],
    );

  const exportFailures = () =>
    downloadCsv(
      `failure_reasons_${new Date().toISOString().slice(0, 10)}.csv`,
      data.topFailureReasons,
      ["reason", "count"],
    );

  return (
    <>
      <PageHeader
        title="Execution Monitoring"
        subtitle="Live queue, recent fills, failure reasons, and retry hotspots."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportFailures}>
              <Download className="mr-2 h-4 w-4" /> Failures CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportExecutions}>
              <Download className="mr-2 h-4 w-4" /> Executions CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["admin", "monitoring"] })}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select
              value={search.status ?? "all"}
              onValueChange={(v) => setSearch({ status: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="mt-1 h-9">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">User (email / name / id)</label>
            <Input
              className="mt-1"
              defaultValue={search.user ?? ""}
              placeholder="alice@..."
              onBlur={(e) => setSearch({ user: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearch({ user: e.currentTarget.value });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Failure reason contains</label>
            <Input
              className="mt-1"
              defaultValue={search.reason ?? ""}
              placeholder="insufficient, timeout..."
              onBlur={(e) => setSearch({ reason: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearch({ reason: e.currentTarget.value });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={search.from ?? ""}
              onChange={(e) => setSearch({ from: e.currentTarget.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={search.to ?? ""}
              onChange={(e) => setSearch({ to: e.currentTarget.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Limit</label>
            <Input
              type="number"
              min={1}
              max={2000}
              className="mt-1"
              value={search.limit ?? 100}
              onChange={(e) =>
                setSearch({ limit: Number(e.currentTarget.value) || undefined })
              }
            />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing {data.recent.length} executions in window
              {" "}
              {new Date(data.filters.from).toLocaleString()} →{" "}
              {new Date(data.filters.to).toLocaleString()}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={() => navigate({ search: {} })}
            >
              <X className="mr-1 h-3 w-3" /> Clear
            </Button>
          </div>
        )}
      </Card>

      {/* Queue health top strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Failed (last hour)
            </p>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{data.queue.failedLastHour}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Filled (24h)
            </p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{data.queue.filledLast24h}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Pending
            </p>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-semibold">
            {data.queue.byStatus.find((s) => s.status === "PENDING")?.count ?? 0}
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Open
            </p>
            <Badge variant="secondary">live</Badge>
          </div>
          <p className="mt-2 text-2xl font-semibold">
            {data.queue.byStatus.find((s) => s.status === "OPEN")?.count ?? 0}
          </p>
        </Card>
      </div>

      {/* Queue by status */}
      <Card className="mt-6">
        <h2 className="text-sm font-semibold">Queue by status</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {data.queue.byStatus.map((s) => (
            <button
              key={s.status}
              onClick={() => setSearch({ status: s.status })}
              className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent"
            >
              <StatusPill status={s.status} />
              <p className="mt-2 text-xl font-semibold">{s.count}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Top failure reasons */}
        <Card>
          <h2 className="text-sm font-semibold">Top failure reasons</h2>
          {data.topFailureReasons.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No failures in window. 🎉
            </p>
          ) : (
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-20 text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topFailureReasons.map((r) => (
                  <TableRow
                    key={r.reason}
                    className="cursor-pointer"
                    onClick={() => setSearch({ reason: r.reason, status: "FAILED" })}
                  >
                    <TableCell className="font-mono text-xs">{r.reason}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Retry hotspots */}
        <Card>
          <h2 className="text-sm font-semibold">Retry hotspots</h2>
          {data.retries.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No orders with multiple execution attempts.
            </p>
          ) : (
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Last attempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.retries.map((r) => (
                  <TableRow key={r.orderId}>
                    <TableCell className="font-mono text-xs">
                      {r.order?.symbol ?? "—"} {r.order?.side ?? ""}
                      <div className="text-[10px] text-muted-foreground">
                        {r.orderId.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.order ? <StatusPill status={r.order.status} /> : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.attempts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtTime(r.lastAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Recent executions */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Recent executions ({data.recent.length})
          </h2>
        </div>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Fill px</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtTime(o.created_at)}
                  </TableCell>
                  <TableCell className="text-xs">{o.user_email ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{o.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={o.side === "BUY" ? "default" : "secondary"}>
                      {o.side}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={o.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {o.quantity ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {o.fill_price ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-destructive">
                    {o.error_message ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
