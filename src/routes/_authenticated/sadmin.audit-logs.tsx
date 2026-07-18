import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListAuditLogs } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "audit"], queryFn: () => adminListAuditLogs() });

export const Route = createFileRoute("/_authenticated/sadmin/audit-logs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  return (
    <>
      <PageHeader title="Audit Logs" subtitle={`Last ${data.length} events`} />
      {data.length === 0 ? <EmptyState title="No audit events" description="Privileged actions will be logged here." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{l.actor_email}</TableCell>
                  <TableCell className="text-xs">{l.actor_role}</TableCell>
                  <TableCell className="font-mono text-xs">{l.action}</TableCell>
                  <TableCell className="font-mono text-xs">{l.resource_type}{l.resource_id ? `:${l.resource_id.slice(0, 8)}` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
