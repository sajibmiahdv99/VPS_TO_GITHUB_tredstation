import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  getMyNotificationPrefs,
  upsertMyNotificationPrefs,
  getMyRiskSettings,
  upsertMyRiskSettings,
  listExchangeAccounts,
  setExchangeAccountExecutionMode,
} from "@/lib/user.functions";

const notifOpts = queryOptions({ queryKey: ["notif-prefs"], queryFn: () => getMyNotificationPrefs() });
const riskOpts = queryOptions({ queryKey: ["risk-settings"], queryFn: () => getMyRiskSettings() });
const accountsOpts = queryOptions({ queryKey: ["exchange-accounts"], queryFn: () => listExchangeAccounts() });

export const Route = createFileRoute("/_authenticated/app/preferences")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(notifOpts),
      context.queryClient.ensureQueryData(riskOpts),
      context.queryClient.ensureQueryData(accountsOpts),
    ]);
  },
  component: PreferencesPage,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function PreferencesPage() {
  return (
    <>
      <PageHeader title="Preferences" subtitle="Customize notifications, execution mode, and order behavior." />
      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="execution">Execution Mode</TabsTrigger>
          <TabsTrigger value="order">Order Behavior</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="execution"><ExecutionTab /></TabsContent>
        <TabsContent value="order"><OrderBehaviorTab /></TabsContent>
      </Tabs>
    </>
  );
}

// ============ Notifications ============
const EVENTS = [
  { key: "evt_fill", label: "Order filled" },
  { key: "evt_sl_tp", label: "Stop-loss / Take-profit hit" },
  { key: "evt_error", label: "Execution error" },
  { key: "evt_invalid_keys", label: "Invalid exchange keys" },
  { key: "evt_new_signal", label: "New signal received" },
] as const;
const CHANNELS = [
  { key: "channel_email", label: "Email" },
  { key: "channel_telegram", label: "Telegram" },
  { key: "channel_inapp", label: "In-app" },
] as const;

function NotificationsTab() {
  const { data } = useSuspenseQuery(notifOpts);
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertMyNotificationPrefs);
  const [form, setForm] = useState({
    email: "", telegram_chat_id: "",
    channel_email: true, channel_telegram: false, channel_inapp: true,
    evt_fill: true, evt_sl_tp: true, evt_error: true, evt_invalid_keys: true, evt_new_signal: false,
  });

  useEffect(() => {
    if (data) setForm({
      email: data.email ?? "",
      telegram_chat_id: data.telegram_chat_id ?? "",
      channel_email: data.channel_email,
      channel_telegram: data.channel_telegram,
      channel_inapp: data.channel_inapp,
      evt_fill: data.evt_fill, evt_sl_tp: data.evt_sl_tp, evt_error: data.evt_error,
      evt_invalid_keys: data.evt_invalid_keys, evt_new_signal: data.evt_new_signal,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => upsertFn({ data: {
      email: form.email.trim() || null,
      telegram_chat_id: form.telegram_chat_id.trim() || null,
      channel_email: form.channel_email, channel_telegram: form.channel_telegram, channel_inapp: form.channel_inapp,
      evt_fill: form.evt_fill, evt_sl_tp: form.evt_sl_tp, evt_error: form.evt_error,
      evt_invalid_keys: form.evt_invalid_keys, evt_new_signal: form.evt_new_signal,
    } }),
    onSuccess: () => { toast.success("Notification preferences saved"); qc.invalidateQueries({ queryKey: ["notif-prefs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Email address</Label>
          <Input type="email" value={form.email} placeholder="you@example.com"
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Telegram chat ID</Label>
          <Input value={form.telegram_chat_id} placeholder="123456789"
            onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} />
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Channels</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-center justify-between rounded-md border p-3">
              <Label>{c.label}</Label>
              <Switch checked={form[c.key] as boolean}
                onCheckedChange={(v) => setForm({ ...form, [c.key]: v })} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Events</h3>
        <div className="rounded-md border divide-y">
          {EVENTS.map((ev) => (
            <div key={ev.key} className="flex items-center justify-between p-3">
              <span className="text-sm">{ev.label}</span>
              <Switch checked={form[ev.key] as boolean}
                onCheckedChange={(v) => setForm({ ...form, [ev.key]: v })} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Each event is delivered to the channels enabled above. Disable a channel to silence it everywhere.
        </p>
      </section>

      <section className="space-y-2 rounded-md border p-3">
        <h3 className="text-sm font-semibold">Browser push</h3>
        <p className="text-xs text-muted-foreground">
          Get a system notification in this browser the moment a signal is filled, closed, or your kill-switch engages. Works after you install the app to your home screen.
        </p>
        <BrowserPushButton />
      </section>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Save notifications"}
      </Button>
    </Card>
  );
}

function BrowserPushButton() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  if (perm === "unsupported") return <p className="text-xs text-muted-foreground">This browser does not support push notifications.</p>;
  if (perm === "granted") return <p className="text-xs text-emerald-600">Enabled — you will receive system notifications.</p>;
  if (perm === "denied") return <p className="text-xs text-destructive">Blocked — re-enable notifications in your browser settings.</p>;
  return (
    <Button variant="outline" size="sm" onClick={async () => {
      const { requestNotificationPermission } = await import("@/hooks/useBrowserNotifications");
      const next = await requestNotificationPermission();
      setPerm(next);
      if (next === "granted") toast.success("Push notifications enabled");
    }}>
      Enable push notifications
    </Button>
  );
}

// ============ Execution Mode ============
function ExecutionTab() {
  const { data: accounts } = useSuspenseQuery(accountsOpts);
  const qc = useQueryClient();
  const setModeFn = useServerFn(setExchangeAccountExecutionMode);
  const setMode = useMutation({
    mutationFn: (vars: { id: string; mode: "live" | "paper" }) =>
      setModeFn({ data: { exchange_account_id: vars.id, execution_mode: vars.mode } }),
    onSuccess: () => { toast.success("Execution mode updated"); qc.invalidateQueries({ queryKey: ["exchange-accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Per-account execution mode</h3>
        <p className="text-xs text-muted-foreground">
          Paper mode simulates fills locally without hitting the exchange. Use it to test signals risk-free.
        </p>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exchange accounts connected yet.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium text-sm">{a.label}</div>
                <div className="text-xs text-muted-foreground">{a.exchange_code} · {a.status}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${a.execution_mode === "paper" ? "text-amber-500" : "text-emerald-500"}`}>
                  {a.execution_mode === "paper" ? "Paper" : "Live"}
                </span>
                <Switch
                  checked={a.execution_mode === "live"}
                  onCheckedChange={(v) => setMode.mutate({ id: a.id, mode: v ? "live" : "paper" })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============ Order Behavior ============
function OrderBehaviorTab() {
  const { data } = useSuspenseQuery(riskOpts);
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertMyRiskSettings);
  const [form, setForm] = useState({
    default_order_type: "market" as "market" | "limit",
    slippage_tolerance_pct: 0.5,
    partial_tp_enabled: true,
    trailing_sl_enabled: false,
  });

  useEffect(() => {
    if (data) setForm({
      default_order_type: (data.default_order_type as "market" | "limit") ?? "market",
      slippage_tolerance_pct: Number(data.slippage_tolerance_pct ?? 0.5),
      partial_tp_enabled: data.partial_tp_enabled ?? true,
      trailing_sl_enabled: data.trailing_sl_enabled ?? false,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => upsertFn({ data: {
      // Preserve required risk fields by re-sending current values:
      max_trade_size_percent: Number(data?.max_trade_size_percent ?? 5),
      risk_per_trade_percent: Number(data?.risk_per_trade_percent ?? 1),
      max_open_positions: Number(data?.max_open_positions ?? 5),
      daily_loss_limit_percent: Number(data?.daily_loss_limit_percent ?? 5),
      max_drawdown_percent: Number(data?.max_drawdown_percent ?? 20),
      cooldown_minutes_after_loss: Number(data?.cooldown_minutes_after_loss ?? 30),
      break_even_enabled: data?.break_even_enabled ?? true,
      default_order_type: form.default_order_type,
      slippage_tolerance_pct: form.slippage_tolerance_pct,
      partial_tp_enabled: form.partial_tp_enabled,
      trailing_sl_enabled: form.trailing_sl_enabled,
    } }),
    onSuccess: () => { toast.success("Order behavior saved"); qc.invalidateQueries({ queryKey: ["risk-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Default order type</Label>
          <Select value={form.default_order_type}
            onValueChange={(v) => setForm({ ...form, default_order_type: v as "market" | "limit" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="market">Market</SelectItem>
              <SelectItem value="limit">Limit</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Market fills instantly; Limit waits at the signal entry price.</p>
        </div>
        <div className="space-y-2">
          <Label>Slippage tolerance (%)</Label>
          <Input type="number" step="0.1" min="0" max="10" value={form.slippage_tolerance_pct}
            onChange={(e) => setForm({ ...form, slippage_tolerance_pct: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Reject fills worse than entry by this percentage.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Partial take-profit ladders</Label>
            <p className="text-xs text-muted-foreground">Scale out across TP1 / TP2 / TP3 from the signal.</p>
          </div>
          <Switch checked={form.partial_tp_enabled}
            onCheckedChange={(v) => setForm({ ...form, partial_tp_enabled: v })} />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Trailing stop-loss</Label>
            <p className="text-xs text-muted-foreground">Move SL up as price advances in your favor.</p>
          </div>
          <Switch checked={form.trailing_sl_enabled}
            onCheckedChange={(v) => setForm({ ...form, trailing_sl_enabled: v })} />
        </div>
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Save order behavior"}
      </Button>
    </Card>
  );
}
