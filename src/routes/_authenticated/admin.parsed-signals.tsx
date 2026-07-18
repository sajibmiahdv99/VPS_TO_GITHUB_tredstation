import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { adminListSignals, adminReparseSignalAI } from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "signals"], queryFn: () => adminListSignals() });

export const Route = createFileRoute("/_authenticated/admin/parsed-signals")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const reparseFn = useServerFn(adminReparseSignalAI);
  const reparse = useMutation({
    mutationFn: (signalId: string) => reparseFn({ data: { signalId } }),
    onSuccess: (r) => {
      toast.success(`AI re-parsed: ${r.symbol ?? "—"} ${r.side ?? ""} (${(r.confidence * 100).toFixed(0)}%)`);
      qc.invalidateQueries({ queryKey: ["admin", "signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Parsed Signals" subtitle={`Last ${data.length} signals — AI re-parse available for low-confidence rows`} />
      {data.length === 0 ? <EmptyState title="No signals yet" description="Parsed signals will appear here once intake is configured." /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>SL</TableHead>
                <TableHead>TP</TableHead>
                <TableHead>Lev</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono">{s.symbol ?? "—"}</TableCell>
                  <TableCell>{s.side ?? "—"}</TableCell>
                  <TableCell>{s.entry_price ?? "—"}</TableCell>
                  <TableCell>{s.stop_loss ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.take_profit?.join(", ") ?? "—"}</TableCell>
                  <TableCell>{s.leverage ?? "—"}</TableCell>
                  <TableCell>{s.confidence != null ? `${(Number(s.confidence) * 100).toFixed(0)}%` : "—"}</TableCell>
                  <TableCell><Badge variant={s.status === "parsed" ? "default" : s.status === "error" ? "destructive" : "outline"}>{s.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reparse.isPending && reparse.variables === s.id}
                      onClick={() => reparse.mutate(s.id)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" /> AI Re-parse
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
