import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { adminListPayouts, adminProcessPayout } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "payouts"], queryFn: () => adminListPayouts() });

export const Route = createFileRoute("/_authenticated/admin/payouts")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const process = useServerFn(adminProcessPayout);
  const m = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "paid" | "rejected" }) => process({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin", "payouts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader title="Payouts" subtitle={`${data.length} requests`} />
      {data.length === 0 ? <EmptyState title="No payout requests" description="Affiliate withdrawals will appear here." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{new Date(p.requested_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-mono text-xs">{p.user_id.slice(0, 8)}…</TableCell>
                  <TableCell>${Number(p.amount).toFixed(2)}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell><Badge variant={p.status === "paid" ? "default" : "outline"}>{p.status ?? "pending"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => m.mutate({ id: p.id, status: "approved" })} disabled={m.isPending}>Approve</Button>
                    <Button size="sm" onClick={() => m.mutate({ id: p.id, status: "paid" })} disabled={m.isPending}>Mark paid</Button>
                    <Button size="sm" variant="destructive" onClick={() => m.mutate({ id: p.id, status: "rejected" })} disabled={m.isPending}>Reject</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
