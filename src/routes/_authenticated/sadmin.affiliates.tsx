import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { adminListAffiliates, adminApproveAffiliate } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "affiliates"], queryFn: () => adminListAffiliates() });

export const Route = createFileRoute("/_authenticated/sadmin/affiliates")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const approve = useServerFn(adminApproveAffiliate);
  const m = useMutation({
    mutationFn: (v: { id: string; approved: boolean }) => approve({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin", "affiliates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader title="Affiliates" subtitle={`${data.length} affiliates`} />
      {data.length === 0 ? <EmptyState title="No affiliates yet" description="Affiliates show up when users join the program." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Referrals</TableHead>
                <TableHead>Earned</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono">{a.referral_code}</TableCell>
                  <TableCell>{a.rank}</TableCell>
                  <TableCell>{a.direct_referrals ?? 0}</TableCell>
                  <TableCell>${Number(a.total_earned ?? 0).toFixed(2)}</TableCell>
                  <TableCell>${Number(a.total_pending ?? 0).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={a.is_approved ? "default" : "outline"}>{a.is_approved ? "Approved" : "Pending"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => m.mutate({ id: a.id, approved: !a.is_approved })} disabled={m.isPending}>
                      {a.is_approved ? "Revoke" : "Approve"}
                    </Button>
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
