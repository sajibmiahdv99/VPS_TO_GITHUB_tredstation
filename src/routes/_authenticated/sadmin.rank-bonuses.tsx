import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  adminListRankBonuses,
  adminCreateRankBonus,
  adminPayRankBonus,
  adminListUsers,
} from "@/lib/admin.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const opts = queryOptions({
  queryKey: ["admin", "rank-bonuses"],
  queryFn: () => adminListRankBonuses(),
});

export const Route = createFileRoute("/_authenticated/sadmin/rank-bonuses")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const usersQ = useQuery({ queryKey: ["admin", "users"], queryFn: () => adminListUsers() });
  const qc = useQueryClient();
  const createFn = useServerFn(adminCreateRankBonus);
  const payFn = useServerFn(adminPayRankBonus);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("10");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { user_id: userId, amount: Number(amount), notes: notes || undefined },
      }),
    onSuccess: () => {
      toast.success("Rank bonus created (pending)");
      qc.invalidateQueries({ queryKey: ["admin", "rank-bonuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "paid" | "cancelled" }) =>
      payFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin", "rank-bonuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Rank bonuses"
        subtitle="Brand Executive 2% / Senior Brand Executive 1% — paid manually only (not auto)."
      />
      <Card className="mb-6">
        <p className="mb-3 text-sm font-semibold">Create manual rank bonus</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {(usersQ.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount (USDT)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <Button className="mt-3" disabled={!userId || create.isPending} onClick={() => create.mutate()}>
          Create pending bonus
        </Button>
      </Card>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data as Array<Record<string, unknown>>).map((r) => (
              <TableRow key={r.id as string}>
                <TableCell className="text-xs">
                  {r.created_at ? new Date(r.created_at as string).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">{String(r.user_id).slice(0, 8)}…</TableCell>
                <TableCell>{r.rank as string}</TableCell>
                <TableCell className="font-medium tabular-nums">
                  {Number(r.bonus_amount).toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status as string}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  {r.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => pay.mutate({ id: r.id as string, status: "paid" })}
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pay.mutate({ id: r.id as string, status: "cancelled" })}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(data as unknown[]).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No rank bonuses yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
