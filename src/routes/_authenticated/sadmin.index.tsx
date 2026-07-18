import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { PageHeader, Card } from "@/components/PageHeader";
import { adminOverview } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "overview"], queryFn: () => adminOverview() });

export const Route = createFileRoute("/_authenticated/sadmin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Page() {
  const { data } = useSuspenseQuery(opts);
  return (
    <>
      <PageHeader title="Admin Overview" subtitle="Platform health at a glance." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Users" value={data.users} />
        <Stat label="Active subs" value={data.activeSubscriptions} />
        <Stat label="Open orders" value={data.openOrders} />
        <Stat label="Open tickets" value={data.openTickets} />
        <Stat label="Signals (24h)" value={data.signals24h} />
      </div>
    </>
  );
}
