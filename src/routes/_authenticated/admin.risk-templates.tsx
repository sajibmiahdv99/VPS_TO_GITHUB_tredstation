import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { adminListPlans, adminUpsertPlan } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "plans"], queryFn: () => adminListPlans() });

export const Route = createFileRoute("/_authenticated/admin/risk-templates")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

type Form = {
  code: string; name: string; description: string;
  monthly_price: number; yearly_price: number;
  max_open_positions: number; max_daily_trades: number; max_trade_size_percentage: number;
  is_active: boolean; sort_order: number;
};
const empty: Form = { code: "", name: "", description: "", monthly_price: 0, yearly_price: 0, max_open_positions: 5, max_daily_trades: 20, max_trade_size_percentage: 5, is_active: true, sort_order: 0 };

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const upsert = useServerFn(adminUpsertPlan);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);

  const m = useMutation({
    mutationFn: () => upsert({ data: { ...form, description: form.description || null } }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); setForm(empty); qc.invalidateQueries({ queryKey: ["admin", "plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Plans & Risk Templates" subtitle={`${data.length} plans`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>New plan</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New plan</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Monthly $</Label><Input type="number" value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })} /></div>
              <div><Label>Yearly $</Label><Input type="number" value={form.yearly_price} onChange={(e) => setForm({ ...form, yearly_price: Number(e.target.value) })} /></div>
              <div><Label>Max open positions</Label><Input type="number" value={form.max_open_positions} onChange={(e) => setForm({ ...form, max_open_positions: Number(e.target.value) })} /></div>
              <div><Label>Max daily trades</Label><Input type="number" value={form.max_daily_trades} onChange={(e) => setForm({ ...form, max_daily_trades: Number(e.target.value) })} /></div>
              <div><Label>Max trade size %</Label><Input type="number" value={form.max_trade_size_percentage} onChange={(e) => setForm({ ...form, max_trade_size_percentage: Number(e.target.value) })} /></div>
              <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => m.mutate()} disabled={m.isPending || !form.code || !form.name}>{m.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Monthly</TableHead>
              <TableHead>Yearly</TableHead>
              <TableHead>Max pos</TableHead>
              <TableHead>Max/day</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>${p.monthly_price ?? 0}</TableCell>
                <TableCell>${p.yearly_price ?? 0}</TableCell>
                <TableCell>{p.max_open_positions ?? "—"}</TableCell>
                <TableCell>{p.max_daily_trades ?? "—"}</TableCell>
                <TableCell><Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Yes" : "No"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
