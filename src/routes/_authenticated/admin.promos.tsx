import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminCreatePromo, adminDeactivatePromo, adminListPromos } from "@/lib/promo.functions";
import { adminListUsers, adminListPlans } from "@/lib/admin.functions";
import { getMyRoles } from "@/lib/auth/role.functions";

const opts = queryOptions({ queryKey: ["admin", "promos"], queryFn: () => adminListPromos() });

export const Route = createFileRoute("/_authenticated/admin/promos")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => (
    <p className="text-sm text-destructive">{error.message} — super admin only.</p>
  ),
});

function Page() {
  const me = useQuery({ queryKey: ["my-roles"], queryFn: () => getMyRoles() });
  const { data } = useSuspenseQuery(opts);
  const plansQ = useQuery({ queryKey: ["admin", "plans"], queryFn: () => adminListPlans() });
  const usersQ = useQuery({ queryKey: ["admin", "users"], queryFn: () => adminListUsers() });
  const qc = useQueryClient();
  const createFn = useServerFn(adminCreatePromo);
  const deactFn = useServerFn(adminDeactivatePromo);

  const [plan, setPlan] = useState("pro");
  const [scope, setScope] = useState<"global" | "affiliate">("global");
  const [affiliateId, setAffiliateId] = useState("");
  const [days, setDays] = useState("30");
  const [maxUses, setMaxUses] = useState("1");
  const [customCode, setCustomCode] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          code: customCode.trim() || undefined,
          plan_code: plan,
          scope,
          affiliate_user_id: scope === "affiliate" ? affiliateId : null,
          duration_days: Number(days) || 30,
          max_redemptions: maxUses ? Number(maxUses) : null,
          notes: notes || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Promo created: ${r.code}`);
      setCustomCode("");
      qc.invalidateQueries({ queryKey: ["admin", "promos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => deactFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "promos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (me.data && !me.data.isSuperAdmin) {
    return (
      <Card>
        <p className="text-sm font-medium">Super admin only</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Promo codes that grant plans without payment can only be managed by super admins.
        </p>
      </Card>
    );
  }

  const plans = (plansQ.data ?? []).filter((p) => p.is_active !== false);
  const users = usersQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Promo codes"
        subtitle="Super admin: grant any plan without a payment transaction. Global or single-affiliate scoped."
      />

      <Card className="mb-6">
        <p className="mb-4 text-sm font-semibold">Generate promo</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-xs">Plan to grant</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Scope</Label>
            <Select
              value={scope}
              onValueChange={(v: "global" | "affiliate") => setScope(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (any user)</SelectItem>
                <SelectItem value="affiliate">Single affiliator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "affiliate" && (
            <div>
              <Label className="text-xs">Affiliate user</Label>
              <Select value={affiliateId} onValueChange={setAffiliateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Duration (days)</Label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" />
          </div>
          <div>
            <Label className="text-xs">Max redemptions (blank = unlimited)</Label>
            <Input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} type="number" />
          </div>
          <div>
            <Label className="text-xs">Custom code (optional)</Label>
            <Input
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
              placeholder="AUTO if empty"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note" />
          </div>
        </div>
        <Button
          className="mt-4"
          onClick={() => create.mutate()}
          disabled={create.isPending || (scope === "affiliate" && !affiliateId)}
        >
          {create.isPending ? "Creating…" : "Generate promo code"}
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Redemption activates the plan immediately. No invoice or payment row is created.
        </p>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id as string}>
                <TableCell className="font-mono font-semibold">{p.code as string}</TableCell>
                <TableCell>{p.plan_code as string}</TableCell>
                <TableCell>
                  <Badge variant="outline">{p.scope as string}</Badge>
                  {p.affiliate_email ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {p.affiliate_email as string}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {p.redemption_count as number}
                  {p.max_redemptions != null ? ` / ${p.max_redemptions}` : " / ∞"}
                </TableCell>
                <TableCell>{p.duration_days as number}</TableCell>
                <TableCell>
                  <Badge variant={p.is_active ? "secondary" : "outline"}>
                    {p.is_active ? "active" : "off"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggle.mutate({ id: p.id as string, is_active: !p.is_active })
                    }
                  >
                    {p.is_active ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No promo codes yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
