import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adminGetSystemStats,
  adminListBlockedNetworks,
  adminAddBlockedNetwork,
  adminDeleteBlockedNetwork,
} from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "settings"], queryFn: () => adminGetSystemStats() });
const netOpts = queryOptions({
  queryKey: ["admin", "blocked-networks"],
  queryFn: () => adminListBlockedNetworks(),
});

export const Route = createFileRoute("/_authenticated/sadmin/settings")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(opts),
      context.queryClient.ensureQueryData(netOpts),
    ]),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const { data: nets } = useSuspenseQuery(netOpts);
  const qc = useQueryClient();
  const addFn = useServerFn(adminAddBlockedNetwork);
  const delFn = useServerFn(adminDeleteBlockedNetwork);

  const [cidr, setCidr] = useState("");
  const [country, setCountry] = useState("");
  const [reason, setReason] = useState("");

  const add = useMutation({
    mutationFn: () =>
      addFn({ data: { cidr, country_code: country || undefined, reason: reason || undefined } }),
    onSuccess: () => {
      toast.success("Network added");
      setCidr(""); setCountry(""); setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "blocked-networks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin", "blocked-networks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="System Settings" subtitle="Platform configuration." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium">Plans</p>
          <p className="mt-1 text-3xl font-semibold">{data.plansCount}</p>
          <Link to="/sadmin/risk-templates" className="mt-3 inline-block text-xs text-amber-400 hover:underline">Manage plans →</Link>
        </Card>
        <Card>
          <p className="text-sm font-medium">Signal sources</p>
          <p className="mt-1 text-3xl font-semibold">{data.sourcesCount}</p>
          <Link to="/sadmin/sources" className="mt-3 inline-block text-xs text-amber-400 hover:underline">Manage sources →</Link>
        </Card>
      </div>
      <Card className="mt-4">
        <p className="text-sm font-medium">Webhooks & integrations</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Telegram intake and payment webhooks will be configured in the next phase. Once enabled, signed
          callbacks will land on <code className="rounded bg-muted px-1">/api/public/*</code> endpoints.
        </p>
      </Card>

      <Card className="mt-6">
        <p className="text-sm font-medium">Blocked networks (regional signup gating)</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Enforced server-side at signup via a Supabase Auth Hook — new accounts from a listed network are
          rejected before creation. This list starts empty; populate it from a maintained source such as
          <a href="https://www.ipdeny.com/ipblocks/" target="_blank" rel="noreferrer" className="ml-1 text-amber-400 hover:underline">ipdeny.com per-country zone files</a>
          {" "}for the countries you need to restrict (e.g. cu, ir, kp, sy). After first use, enable{" "}
          <code className="rounded bg-muted px-1">public.hook_restrict_signup_by_network</code> as the
          "Before user created" hook in Auth Hooks.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label className="text-xs">CIDR</Label>
            <Input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="1.2.3.0/24" />
          </div>
          <div>
            <Label className="text-xs">Country code</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ir" />
          </div>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Signups are not available in your region." />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => add.mutate()} disabled={add.isPending || !cidr}>
            {add.isPending ? "Adding…" : "Add network"}
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CIDR</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                    No blocked networks. List is empty.
                  </TableCell>
                </TableRow>
              ) : (
                nets.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs">{n.cidr}</TableCell>
                    <TableCell className="uppercase text-xs">{n.country_code ?? "—"}</TableCell>
                    <TableCell className="text-xs">{n.reason ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remove ${n.cidr}?`)) del.mutate(n.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
