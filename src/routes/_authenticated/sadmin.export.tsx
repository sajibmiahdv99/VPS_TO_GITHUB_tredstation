import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { adminExportAuditPack, adminPromoAnalytics } from "@/lib/admin.export.functions";

export const Route = createFileRoute("/_authenticated/sadmin/export")({
  component: Page,
});

function Page() {
  const exportFn = useServerFn(adminExportAuditPack);
  const promoFn = useServerFn(adminPromoAnalytics);
  const promoQ = useQuery({ queryKey: ["promo-analytics"], queryFn: () => promoFn() });

  const exp = useMutation({
    mutationFn: () => exportFn(),
    onSuccess: (pack) => {
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-tred-audit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = promoQ.data;

  return (
    <>
      <PageHeader
        title="Export & analytics"
        subtitle="Audit pack, promo redemptions, payments snapshot (super admin)."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold">Compliance export</p>
          <p className="mt-1 text-xs text-muted-foreground">
            JSON bundle: audit logs, promos, redemptions, payments, roles.
          </p>
          <Button className="mt-4" onClick={() => exp.mutate()} disabled={exp.isPending}>
            {exp.isPending ? "Preparing…" : "Download audit pack"}
          </Button>
        </Card>
        <Card>
          <p className="text-sm font-semibold">Promo analytics</p>
          {a ? (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>
                Active codes: <strong className="text-foreground">{a.active_codes}</strong>
              </li>
              <li>
                Total redemptions:{" "}
                <strong className="text-foreground">{a.total_redemptions}</strong>
              </li>
              {Object.entries(a.by_plan ?? {}).map(([plan, n]) => (
                <li key={plan}>
                  {plan}: {n as number}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
          )}
        </Card>
      </div>
    </>
  );
}
