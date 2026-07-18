import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  adminListSources,
  adminUpsertSource,
  adminListPlans,
  adminAssignSourceToPlan,
  adminAssignSourceToUser,
  adminListUsers,
} from "@/lib/admin.functions";

const opts = queryOptions({ queryKey: ["admin", "sources"], queryFn: () => adminListSources() });
const planOpts = queryOptions({ queryKey: ["admin", "plans"], queryFn: () => adminListPlans() });
const userOpts = queryOptions({ queryKey: ["admin", "users"], queryFn: () => adminListUsers() });

export const Route = createFileRoute("/_authenticated/admin/sources")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(opts),
      context.queryClient.ensureQueryData(planOpts),
      context.queryClient.ensureQueryData(userOpts),
    ]),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
});

type SourceStatus = "active" | "paused" | "disabled";
type Form = {
  id?: string;
  code: string;
  name: string;
  description: string;
  source_type: string;
  status: SourceStatus;
  is_platform_managed: boolean;
  plan_minimum: string;
  channel_ref: string;
  channel_url: string;
  notes: string;
  win_rate: string;
};

const empty: Form = {
  code: "",
  name: "",
  description: "",
  source_type: "telegram",
  status: "active",
  is_platform_managed: true,
  plan_minimum: "starter",
  channel_ref: "",
  channel_url: "",
  notes: "",
  win_rate: "",
};

function Page() {
  const { data } = useSuspenseQuery(opts);
  const { data: plans } = useSuspenseQuery(planOpts);
  const { data: users } = useSuspenseQuery(userOpts);
  const qc = useQueryClient();
  const upsert = useServerFn(adminUpsertSource);
  const assignPlan = useServerFn(adminAssignSourceToPlan);
  const assignUser = useServerFn(adminAssignSourceToUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [giveOpen, setGiveOpen] = useState(false);
  const [giveSourceId, setGiveSourceId] = useState<string>("");
  const [givePlan, setGivePlan] = useState("starter");
  const [giveUserId, setGiveUserId] = useState("");

  const save = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: form.id,
          code: form.code,
          name: form.name,
          description: form.description || null,
          source_type: form.source_type,
          status: form.status,
          is_platform_managed: form.is_platform_managed,
          plan_minimum: form.plan_minimum === "any" ? null : form.plan_minimum,
          channel_ref: form.channel_ref || null,
          channel_url: form.channel_url || null,
          notes: form.notes || null,
          win_rate: form.win_rate === "" ? null : Number(form.win_rate),
        },
      }),
    onSuccess: () => {
      toast.success("Source saved");
      setOpen(false);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin", "sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveToPlan = useMutation({
    mutationFn: () =>
      assignPlan({
        data: {
          source_id: giveSourceId,
          plan_code: givePlan,
          include_higher: true,
          also_set_plan_minimum: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Assigned to plan — ${r.granted} users granted (${r.users_matched} matched)`);
      setGiveOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const giveToUser = useMutation({
    mutationFn: () =>
      assignUser({ data: { source_id: giveSourceId, user_id: giveUserId, grant: true } }),
    onSuccess: () => {
      toast.success("Source granted to user");
      setGiveOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(s: (typeof data)[0]) {
    setForm({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description ?? "",
      source_type: s.source_type,
      status: (s.status as SourceStatus) || "active",
      is_platform_managed: Boolean(s.is_platform_managed),
      plan_minimum: s.plan_minimum ?? "any",
      channel_ref: (s as { channel_ref?: string }).channel_ref ?? "",
      channel_url: (s as { channel_url?: string }).channel_url ?? "",
      notes: (s as { notes?: string }).notes ?? "",
      win_rate: s.win_rate != null ? String(s.win_rate) : "",
    });
    setOpen(true);
  }

  function openGive(sourceId: string) {
    setGiveSourceId(sourceId);
    setGivePlan(plans[0]?.code ?? "starter");
    setGiveUserId(users[0]?.id ?? "");
    setGiveOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Signal sources & plan control"
        subtitle="Create channels, set minimum plan, and grant access to users or whole plan tiers."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setForm(empty);
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setForm(empty);
                  setOpen(true);
                }}
              >
                New source / channel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit signal source" : "New signal source"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Code</Label>
                    <Input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="agent-core"
                      disabled={Boolean(form.id)}
                    />
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="AGENT TRED Core"
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={form.source_type}
                      onValueChange={(v) => setForm({ ...form, source_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telegram">Telegram channel</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                        <SelectItem value="webhook">Webhook</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="platform_managed">Platform</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v: SourceStatus) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Minimum plan (access control)</Label>
                  <Select
                    value={form.plan_minimum}
                    onValueChange={(v) => setForm({ ...form, plan_minimum: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any plan / free</SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name} ({p.code})+
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Users need this plan or higher to see the channel and receive trades.
                  </p>
                </div>
                <div>
                  <Label>Channel ref (@telegram / chat id)</Label>
                  <Input
                    value={form.channel_ref}
                    onChange={(e) => setForm({ ...form, channel_ref: e.target.value })}
                    placeholder="@agenttred_signals"
                  />
                </div>
                <div>
                  <Label>Channel URL (optional)</Label>
                  <Input
                    value={form.channel_url}
                    onChange={(e) => setForm({ ...form, channel_url: e.target.value })}
                    placeholder="https://t.me/..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Win rate %</Label>
                    <Input
                      type="number"
                      value={form.win_rate}
                      onChange={(e) => setForm({ ...form, win_rate: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.is_platform_managed}
                        onChange={(e) => setForm({ ...form, is_platform_managed: e.target.checked })}
                      />
                      Platform managed
                    </label>
                  </div>
                </div>
                <div>
                  <Label>Admin notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !form.code || !form.name}
                >
                  {save.isPending ? "Saving…" : "Save source"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="mb-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How plan control works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Create a source and set <strong>minimum plan</strong> (e.g. Premium).</li>
          <li>
            Use <strong>Give access</strong> to set that plan gate and auto-grant the channel to all users on
            that plan (or higher).
          </li>
          <li>Or grant a single user. Fan-out only executes for entitled users.</li>
        </ol>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code / Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Min plan</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{s.code}</div>
                </TableCell>
                <TableCell className="text-xs">{s.source_type}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.plan_minimum ?? "any"}</Badge>
                </TableCell>
                <TableCell className="max-w-[140px] truncate font-mono text-[11px]">
                  {(s as { channel_ref?: string }).channel_ref ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "outline"}>{s.status}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                    Edit
                  </Button>
                  <Button size="sm" onClick={() => openGive(s.id)}>
                    Give access
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No sources yet. Create a channel and assign it to a plan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={giveOpen} onOpenChange={setGiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Give source access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Assign to plan tier</Label>
              <Select value={givePlan} onValueChange={setGivePlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name} ({p.code}) and higher
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="mt-2 w-full"
                onClick={() => giveToPlan.mutate()}
                disabled={giveToPlan.isPending || !giveSourceId}
              >
                {giveToPlan.isPending ? "Assigning…" : "Set plan gate + grant all matching users"}
              </Button>
            </div>
            <div className="border-t border-border pt-4">
              <Label>Or grant one user</Label>
              <Select value={giveUserId} onValueChange={setGiveUserId}>
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
              <Button
                className="mt-2 w-full"
                variant="outline"
                onClick={() => giveToUser.mutate()}
                disabled={giveToUser.isPending || !giveUserId}
              >
                {giveToUser.isPending ? "Granting…" : "Grant to this user"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
