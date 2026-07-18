import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listMyTickets, createTicket } from "@/lib/user.functions";

const opts = queryOptions({ queryKey: ["tickets"], queryFn: () => listMyTickets() });

export const Route = createFileRoute("/_authenticated/app/support")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const createFn = useServerFn(createTicket);
  const [open, setOpen] = useState(false);
  type Priority = "low" | "normal" | "high" | "urgent";
  const [form, setForm] = useState<{ subject: string; description: string; category: string; priority: Priority }>({ subject: "", description: "", category: "general", priority: "normal" });

  const m = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => { toast.success("Ticket created"); setOpen(false); setForm({ subject: "", description: "", category: "general", priority: "normal" as Priority }); qc.invalidateQueries({ queryKey: ["tickets"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Open a ticket for billing, exchange, or trading help."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New ticket</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New support ticket</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="exchange">Exchange</SelectItem>
                        <SelectItem value="trading">Trading</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Description</Label><Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => m.mutate()} disabled={m.isPending || !form.subject || !form.description}>{m.isPending ? "Sending..." : "Send"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {data.length === 0 ? (
        <EmptyState title="No tickets" description="Open your first ticket and we'll get back fast." />
      ) : (
        <div className="grid gap-3">
          {data.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">{t.ticket_number} · {t.category} · {t.priority}</p>
                </div>
                <span className="text-xs uppercase text-muted-foreground">{t.status}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
