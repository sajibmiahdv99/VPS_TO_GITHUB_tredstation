import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, EmptyState, Card } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PairChipRow } from "@/components/ui/pair-chip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, X } from "lucide-react";
import { listActiveOrders } from "@/lib/user.functions";
import { cancelOrder, modifyOrder, setTrailingStop, setPartialTakeProfits } from "@/lib/execution.functions";

const opts = queryOptions({ queryKey: ["active-orders"], queryFn: () => listActiveOrders() });

export const Route = createFileRoute("/_authenticated/app/active-trades")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  dispatched: "secondary",
  open: "secondary",
  partial: "secondary",
  filled: "default",
  closed: "default",
  cancelled: "outline",
  rejected: "destructive",
};

type OrderRow = Awaited<ReturnType<typeof listActiveOrders>>[number];

function Page() {
  const { data } = useSuspenseQuery(opts);
  const queryClient = useQueryClient();
  const cancelFn = useServerFn(cancelOrder);
  const modifyFn = useServerFn(modifyOrder);

  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [editForm, setEditForm] = useState({ stop_loss: "", take_profit: "" });
  const [trailDist, setTrailDist] = useState("");
  const [tpLadder, setTpLadder] = useState<{ price: string; percent: string }[]>([
    { price: "", percent: "50" },
    { price: "", percent: "30" },
    { price: "", percent: "20" },
  ]);
  const trailFn = useServerFn(setTrailingStop);
  const partialFn = useServerFn(setPartialTakeProfits);


  // Realtime invalidation handled globally in app.tsx via useOrdersRealtime()

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { orderId: id } }),
    onSuccess: (r) => {
      toast.success(r.immediate ? "Order cancelled" : "Cancel requested — worker will action");
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modifyM = useMutation({
    mutationFn: () =>
      modifyFn({
        data: {
          orderId: editing!.id,
          stop_loss: editForm.stop_loss ? Number(editForm.stop_loss) : undefined,
          take_profit: editForm.take_profit ? Number(editForm.take_profit) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Modify requested — worker will action");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trailM = useMutation({
    mutationFn: () =>
      trailFn({ data: { orderId: editing!.id, distance: Number(trailDist), active: true } }),
    onSuccess: () => {
      toast.success("Trailing stop set");
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partialM = useMutation({
    mutationFn: () => {
      const levels = tpLadder
        .filter((l) => l.price && l.percent)
        .map((l) => ({ price: Number(l.price), percent: Number(l.percent) }));
      return partialFn({ data: { orderId: editing!.id, levels } });
    },
    onSuccess: () => {
      toast.success("Partial TP ladder configured");
      queryClient.invalidateQueries({ queryKey: ["active-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (o: OrderRow) => {
    setEditing(o);
    setEditForm({
      stop_loss: o.stop_loss?.toString() ?? "",
      take_profit: o.take_profit?.toString() ?? "",
    });
    setTrailDist((o as { trailing_stop_distance?: number | null }).trailing_stop_distance?.toString() ?? "");
    const existing = (o as { tp_levels?: { price: number; percent: number }[] | null }).tp_levels;
    if (existing && existing.length) {
      setTpLadder(existing.map((l) => ({ price: l.price.toString(), percent: l.percent.toString() })));
    } else {
      setTpLadder([
        { price: "", percent: "50" },
        { price: "", percent: "30" },
        { price: "", percent: "20" },
      ]);
    }
  };


  const canCancel = (s: string | null | undefined) =>
    s === "queued" || s === "open" || s === "partial" || s === "dispatched";
  const canModify = (s: string | null | undefined) =>
    s === "queued" || s === "open" || s === "partial" || s === "dispatched";

  const [pairFilter, setPairFilter] = useState<string | null>(null);
  const symbols = useMemo(
    () => Array.from(new Set(data.map((o) => o.symbol).filter(Boolean) as string[])).sort(),
    [data],
  );
  const filtered = useMemo(
    () => (pairFilter ? data.filter((o) => o.symbol === pairFilter) : data),
    [data, pairFilter],
  );

  return (
    <>
      <PageHeader
        title="Active trades"
        subtitle="Open and pending orders across all exchanges. Updates live as fills arrive."
      />
      {data.length === 0 ? (
        <EmptyState title="No active trades" description="Orders will appear here once signals execute." />
      ) : (
        <>
          <Card className="mb-4 py-3">
            <PairChipRow items={symbols} value={pairFilter} onChange={setPairFilter} />
          </Card>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card/90">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>SL</TableHead>
                <TableHead>TP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>P&amp;L</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} className="border-border/60">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                        {(o.symbol ?? "?").slice(0, 1)}
                      </span>
                      {o.symbol}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={o.side === "buy" || o.side === "BUY" ? "text-profit font-medium" : "text-loss font-medium"}>
                      {o.side?.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{o.quantity}</TableCell>
                  <TableCell className="tabular-nums">{o.fill_price ?? o.price ?? "-"}</TableCell>
                  <TableCell className="tabular-nums">{o.stop_loss ?? "-"}</TableCell>
                  <TableCell className="tabular-nums">{o.take_profit ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[o.status ?? ""] ?? "outline"} className="text-[10px] uppercase">
                      {o.status}
                    </Badge>
                    {(o as { cancel_requested?: boolean }).cancel_requested && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(cancel pending)</span>
                    )}
                  </TableCell>
                  <TableCell className={Number(o.pnl ?? 0) >= 0 ? "text-profit tabular-nums font-medium" : "text-loss tabular-nums font-medium"}>
                    {Number(o.pnl ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canModify(o.status) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canCancel(o.status) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          onClick={() => cancelM.mutate(o.id)}
                          disabled={cancelM.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modify order</DialogTitle>
            <DialogDescription>
              {editing?.symbol} · {editing?.side?.toUpperCase()} · Qty {editing?.quantity}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 border-b border-border pb-4">
              <div className="text-xs font-medium uppercase text-muted-foreground">Static SL / TP</div>
              <div>
                <Label>Stop loss</Label>
                <Input type="number" step="any" value={editForm.stop_loss}
                  onChange={(e) => setEditForm({ ...editForm, stop_loss: e.target.value })} />
              </div>
              <div>
                <Label>Take profit</Label>
                <Input type="number" step="any" value={editForm.take_profit}
                  onChange={(e) => setEditForm({ ...editForm, take_profit: e.target.value })} />
              </div>
              <Button size="sm" onClick={() => modifyM.mutate()} disabled={modifyM.isPending}>
                {modifyM.isPending ? "Saving..." : "Update SL/TP"}
              </Button>
            </div>

            <div className="space-y-3 border-b border-border pb-4">
              <div className="text-xs font-medium uppercase text-muted-foreground">Trailing stop</div>
              <div>
                <Label>Distance (price units)</Label>
                <Input type="number" step="any" placeholder="e.g. 150"
                  value={trailDist} onChange={(e) => setTrailDist(e.target.value)} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Worker will trail SL by this distance as price moves favorably.
                </p>
              </div>
              <Button size="sm" variant="secondary"
                onClick={() => trailM.mutate()}
                disabled={trailM.isPending || !trailDist || Number(trailDist) <= 0}>
                {trailM.isPending ? "Saving..." : "Enable trailing"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">Partial take-profit ladder</div>
              <p className="text-[11px] text-muted-foreground">
                Close a slice of the position at each price level. Percentages must sum to 100.
              </p>
              {tpLadder.map((l, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-[11px]">TP{i + 1} price</Label>
                    <Input type="number" step="any" value={l.price}
                      onChange={(e) => {
                        const next = [...tpLadder]; next[i] = { ...l, price: e.target.value }; setTpLadder(next);
                      }} />
                  </div>
                  <div className="w-24">
                    <Label className="text-[11px]">% close</Label>
                    <Input type="number" min="1" max="100" value={l.percent}
                      onChange={(e) => {
                        const next = [...tpLadder]; next[i] = { ...l, percent: e.target.value }; setTpLadder(next);
                      }} />
                  </div>
                  {tpLadder.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-9 w-9"
                      onClick={() => setTpLadder(tpLadder.filter((_, idx) => idx !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">
                  Total: {tpLadder.reduce((s, l) => s + (Number(l.percent) || 0), 0)}%
                </span>
                {tpLadder.length < 6 && (
                  <Button variant="ghost" size="sm"
                    onClick={() => setTpLadder([...tpLadder, { price: "", percent: "" }])}>
                    + Add level
                  </Button>
                )}
              </div>
              <Button size="sm" variant="secondary"
                onClick={() => partialM.mutate()}
                disabled={partialM.isPending ||
                  tpLadder.some((l) => !l.price || !l.percent) ||
                  Math.round(tpLadder.reduce((s, l) => s + Number(l.percent || 0), 0)) !== 100}>
                {partialM.isPending ? "Saving..." : "Save ladder"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
