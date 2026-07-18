import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminListPayments } from "@/lib/admin.functions";
import { adminConfirmPayment } from "@/lib/admin.control.functions";

const opts = queryOptions({ queryKey: ["admin", "payments"], queryFn: () => adminListPayments() });

export const Route = createFileRoute("/_authenticated/admin/payments")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const confirmFn = useServerFn(adminConfirmPayment);

  const act = useMutation({
    mutationFn: (args: { invoice_id?: string; action: "confirm" | "reject" }) =>
      confirmFn({ data: args }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Payments" subtitle={`${data.length} records — confirm manual USDT here`} />
      {data.length === 0 ? (
        <EmptyState title="No payments" description="Payments will appear once a customer pays." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => {
                const actionable =
                  p.status === "pending" ||
                  p.status === "user_claimed_paid" ||
                  p.status === "awaiting_transfer";
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{p.user_id.slice(0, 8)}…</TableCell>
                    <TableCell>{p.provider}</TableCell>
                    <TableCell>
                      {Number(p.amount).toFixed(2)} {p.currency ?? ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "paid" ? "default" : "outline"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.external_payment_ref ?? "—"}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      {actionable && p.invoice_id && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => act.mutate({ invoice_id: p.invoice_id!, action: "confirm" })}
                            disabled={act.isPending}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act.mutate({ invoice_id: p.invoice_id!, action: "reject" })}
                            disabled={act.isPending}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
