import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { adminListUsers, adminSetUserActive, adminGrantRole } from "@/lib/admin.functions";
import { adminCreatePromo } from "@/lib/promo.functions";
import { getMyRoles } from "@/lib/auth/role.functions";
import { STAFF_ROLE_LABELS } from "@/lib/auth/permissions";

const opts = queryOptions({ queryKey: ["admin", "users"], queryFn: () => adminListUsers() });

const STAFF_ROLES = ["super_admin", "finance_admin", "operations_admin", "admin", "moderator"] as const;

export const Route = createFileRoute("/_authenticated/sadmin/users")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const me = useQuery({ queryKey: ["my-roles"], queryFn: () => getMyRoles() });
  const qc = useQueryClient();
  const toggleActive = useServerFn(adminSetUserActive);
  const grantRole = useServerFn(adminGrantRole);
  const canManageAdmins = me.data?.isSuperAdmin;
  const canSuspend = me.data?.capabilities?.includes("suspend_users");
  const canPromo = me.data?.capabilities?.includes("manage_promos");
  const createPromo = useServerFn(adminCreatePromo);

  const genAffiliatePromo = useMutation({
    mutationFn: (userId: string) =>
      createPromo({
        data: {
          plan_code: "pro",
          scope: "affiliate",
          affiliate_user_id: userId,
          duration_days: 30,
          max_redemptions: 50,
          notes: `Affiliate promo for ${userId}`,
        },
      }),
    onSuccess: (r) => toast.success(`Affiliate promo: ${r.code}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: (v: { user_id: string; is_active: boolean }) => toggleActive({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRole = useMutation({
    mutationFn: (v: { user_id: string; role: string; grant: boolean }) =>
      grantRole({
        data: {
          user_id: v.user_id,
          role: v.role as "super_admin" | "finance_admin" | "operations_admin" | "admin" | "moderator" | "user",
          grant: v.grant,
        },
      }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${data.length} accounts · ${canManageAdmins ? "You can manage staff roles" : "View / operational state"}`}
      />
      {canManageAdmins && (
        <Card className="mb-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Staff roles</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <strong>super_admin</strong> — settings, admins, flags, sources, suspend, emergency controls
            </li>
            <li>
              <strong>finance_admin</strong> — invoices, payments, revenue, payouts
            </li>
            <li>
              <strong>operations_admin</strong> — support, signals, monitoring, affiliates, source status
            </li>
          </ul>
        </Card>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <Badge variant="outline">user</Badge>
                    ) : (
                      u.roles.map((r) => (
                        <Badge
                          key={r}
                          variant={
                            r === "admin" || r === "super_admin"
                              ? "default"
                              : r === "finance_admin" || r === "operations_admin"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {STAFF_ROLE_LABELS[r] ?? r}
                        </Badge>
                      ))
                    )}
                  </div>
                  {canManageAdmins && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select
                        onValueChange={(role) => {
                          if (!role) return;
                          const has = u.roles.includes(role);
                          setRole.mutate({ user_id: u.id, role, grant: !has });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                          <SelectValue placeholder="Toggle staff role…" />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {u.roles.includes(r) ? "Revoke " : "Grant "}
                              {STAFF_ROLE_LABELS[r] ?? r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {u.is_active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Suspended</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {canPromo && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => genAffiliatePromo.mutate(u.id)}
                      disabled={genAffiliatePromo.isPending}
                      title="Generate affiliate-scoped promo (Pro / 30d)"
                    >
                      Promo
                    </Button>
                  )}
                  {canSuspend && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActive.mutate({ user_id: u.id, is_active: !u.is_active })}
                      disabled={setActive.isPending}
                    >
                      {u.is_active ? "Suspend" : "Enable"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
