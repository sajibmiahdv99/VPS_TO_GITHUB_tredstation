import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Trash2, CheckCircle2, Clock, AlertCircle, KeyRound, ArrowLeft,
  RefreshCw, Radio, Sliders, Search, X, Webhook, Copy, RotateCw, Store,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Card, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listSignalSources,
  listPersonalSignalChannels,
  listTelegramAccounts,
  syncTelegramChannels,
  startTelegramLogin, verifyTelegramLogin, resendTelegramCode, deleteTelegramAccount,
  toggleChannelSignalSource,
  getChannelRiskSettings, upsertChannelRiskSettings,
  listMyExchangeAccountsLite, setDefaultExchangeAccount, getMyRiskSettings,
  createWebhookSignalSource, regenerateWebhookToken, deleteWebhookSignalSource,
  enablePlatformSource,
} from "@/lib/user.functions";
import { publishChannelAsStrategy } from "@/lib/marketplace.functions";

function EnableSourceButton({ sourceId }: { sourceId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(enablePlatformSource);
  const m = useMutation({
    mutationFn: (enable: boolean) => fn({ data: { source_id: sourceId, enable } }),
    onSuccess: () => {
      toast.success("Trade plan updated");
      qc.invalidateQueries({ queryKey: ["signal-sources"] });
      qc.invalidateQueries({ queryKey: ["my-risk"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(true)}>
      {m.isPending ? "…" : "Enable for trading"}
    </Button>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}

const sourcesOpts = queryOptions({ queryKey: ["signal-sources"], queryFn: () => listSignalSources() });
const personalOpts = queryOptions({ queryKey: ["personal-signal-channels"], queryFn: () => listPersonalSignalChannels() });
const tgAcctOpts = queryOptions({ queryKey: ["telegram-accounts"], queryFn: () => listTelegramAccounts() });

export const Route = createFileRoute("/_authenticated/app/sources")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sourcesOpts),
      context.queryClient.ensureQueryData(personalOpts),
      context.queryClient.ensureQueryData(tgAcctOpts),
    ]),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between gap-3 first:mt-0">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { icon: typeof CheckCircle2; cls: string; label: string }> = {
    active: { icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10", label: "Active" },
    awaiting_code: { icon: Clock, cls: "text-amber-400 bg-amber-500/10", label: "Awaiting code" },
    pending_verification: { icon: Clock, cls: "text-amber-400 bg-amber-500/10", label: "Pending verification" },
    error: { icon: AlertCircle, cls: "text-destructive bg-destructive/10", label: "Error" },
  };
  const s = map[status] ?? { icon: Clock, cls: "text-muted-foreground bg-muted", label: status };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${s.cls}`}>
      <Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

type Step = "phone" | "code" | "password";

function Page() {
  const qc = useQueryClient();
  const { data: sources } = useSuspenseQuery(sourcesOpts);
  const { data: personal } = useSuspenseQuery(personalOpts);
  const { data: tgAccounts } = useSuspenseQuery(tgAcctOpts);

  // Telegram connect dialog state
  const startFn = useServerFn(startTelegramLogin);
  const verifyFn = useServerFn(verifyTelegramLogin);
  const resendFn = useServerFn(resendTelegramCode);
  const delFn = useServerFn(deleteTelegramAccount);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const resetDlg = () => {
    setStep("phone"); setAccountId(null);
    setLabel(""); setPhone(""); setCode(""); setPassword("");
  };

  const startMut = useMutation({
    mutationFn: (vars: { label: string; phone: string }) => startFn({ data: vars }),
    onSuccess: (r) => {
      setAccountId(r.id); setStep("code");
      toast.success("Code sent. Check your Telegram app.");
      qc.invalidateQueries({ queryKey: ["telegram-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const verifyMut = useMutation({
    mutationFn: (vars: { id: string; code: string; password?: string }) => verifyFn({ data: vars }),
    onSuccess: (r) => {
      if (!r.ok && r.requires_2fa) {
        setStep("password");
        toast.message("This account has two-factor enabled. Enter your password.");
        return;
      }
      toast.success("Telegram account connected.");
      setOpen(false); resetDlg();
      qc.invalidateQueries({ queryKey: ["telegram-accounts"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["telegram-accounts"] });
    },
  });
  const resendMut = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id } }),
    onSuccess: () => toast.success("New code sent."),
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed.");
      qc.invalidateQueries({ queryKey: ["telegram-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resumeVerification = (id: string) => {
    setAccountId(id); setStep("code"); setOpen(true);
  };

  // Sync + last-sync indicator
  const activeAccount = tgAccounts.find((a) => a.status === "active");
  const storageKey = activeAccount ? `sources:lastSync:${activeAccount.id}` : null;
  const [lastSync, setLastSync] = useState<{ at: number; count: number; ok: boolean; error?: string } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!storageKey) return setLastSync(null);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLastSync(JSON.parse(raw)); else setLastSync(null);
    } catch { setLastSync(null); }
  }, [storageKey]);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const syncFn = useServerFn(syncTelegramChannels);
  const syncMut = useMutation({
    mutationFn: () => {
      if (!activeAccount) throw new Error("Connect a Telegram account first.");
      return syncFn({ data: { telegramAccountId: activeAccount.id } });
    },
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} channel${r.synced === 1 ? "" : "s"}.`);
      const entry = { at: Date.now(), count: r.synced, ok: true };
      setLastSync(entry);
      if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(entry)); } catch {}
      qc.invalidateQueries({ queryKey: ["personal-signal-channels"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      const entry = { at: Date.now(), count: 0, ok: false, error: e.message };
      setLastSync(entry);
      if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(entry)); } catch {}
    },
  });

  // Channel toggle & risk
  const toggleFn = useServerFn(toggleChannelSignalSource);
  const toggleMut = useMutation({
    mutationFn: (vars: { id: string; is_signal_source: boolean }) => toggleFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-signal-channels"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Exchanges + default
  const listExchangesFn = useServerFn(listMyExchangeAccountsLite);
  const getRiskFn = useServerFn(getMyRiskSettings);
  const setDefaultFn = useServerFn(setDefaultExchangeAccount);
  const { data: exchanges = [] } = useQuery({ queryKey: ["my-exchanges-lite"], queryFn: () => listExchangesFn() });
  const { data: riskRow } = useQuery({ queryKey: ["my-risk-settings"], queryFn: () => getRiskFn() });
  const setDefaultMut = useMutation({
    mutationFn: (id: string | null) => setDefaultFn({ data: { exchange_account_id: id } }),
    onSuccess: () => {
      toast.success("Default exchange updated.");
      qc.invalidateQueries({ queryKey: ["my-risk-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [riskChannel, setRiskChannel] = useState<{ id: string; name: string } | null>(null);

  // Webhook-source state
  type PersonalRow = (typeof personal)[number] & {
    channel_type?: string | null;
    webhook_token?: string | null;
    published_source_id?: string | null;
  };
  const personalRows = personal as PersonalRow[];
  const telegramChannels = personalRows.filter((c) => (c.channel_type ?? "telegram") === "telegram");
  const webhookChannels = personalRows.filter((c) => c.channel_type === "webhook");

  const [webhookOpen, setWebhookOpen] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<{ id: string; name: string; token: string } | null>(null);

  const createWebhookFn = useServerFn(createWebhookSignalSource);
  const regenWebhookFn = useServerFn(regenerateWebhookToken);
  const deleteWebhookFn = useServerFn(deleteWebhookSignalSource);
  const createWebhookMut = useMutation({
    mutationFn: (vars: { name: string }) => createWebhookFn({ data: vars }),
    onSuccess: (r) => {
      const token = (r as { webhook_token?: string | null })?.webhook_token ?? "";
      setCreatedWebhook({ id: r.id, name: r.name, token });
      setWebhookOpen(false);
      toast.success("Webhook source created.");
      qc.invalidateQueries({ queryKey: ["personal-signal-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const regenWebhookMut = useMutation({
    mutationFn: (channelId: string) => regenWebhookFn({ data: { channelId } }),
    onSuccess: (r, channelId) => {
      const ch = webhookChannels.find((c) => c.id === channelId);
      setCreatedWebhook({ id: r.id, name: ch?.name ?? "Webhook", token: r.webhook_token ?? "" });
      toast.success("Token regenerated. The old URL no longer works.");
      qc.invalidateQueries({ queryKey: ["personal-signal-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteWebhookMut = useMutation({
    mutationFn: (channelId: string) => deleteWebhookFn({ data: { channelId } }),
    onSuccess: () => {
      toast.success("Webhook source removed.");
      qc.invalidateQueries({ queryKey: ["personal-signal-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Publish-as-strategy
  const publishFn = useServerFn(publishChannelAsStrategy);
  const [publishChannel, setPublishChannel] = useState<{ id: string; name: string } | null>(null);
  const publishMut = useMutation({
    mutationFn: (vars: { channelId: string; name: string; description: string }) =>
      publishFn({ data: vars }),
    onSuccess: () => {
      toast.success("Published to marketplace.");
      setPublishChannel(null);
      qc.invalidateQueries({ queryKey: ["personal-signal-channels"] });
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      qc.invalidateQueries({ queryKey: ["marketplace-mine"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Search
  const [query, setQuery] = useState("");
  const filteredPersonal = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return telegramChannels;
    return telegramChannels.filter((c) => {
      const hay = `${c.name ?? ""} ${c.username ?? ""} ${c.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [telegramChannels, query]);

  const platform = sources.filter((s) => s.is_platform_managed);
  const community = sources.filter((s) => !s.is_platform_managed);

  function webhookUrl(token: string) {
    if (typeof window === "undefined") return `/api/public/hooks/webhook-signal/${token}`;
    return `${window.location.origin}/api/public/hooks/webhook-signal/${token}`;
  }
  function copy(text: string, label = "Copied") {
    navigator.clipboard.writeText(text).then(
      () => toast.success(label),
      () => toast.error("Copy failed"),
    );
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Trade plan" subtitle="Connect Telegram, pick the channels you trade, and configure per-channel risk." />
        <Button size="sm" className="gap-1" onClick={() => { resetDlg(); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Connect Telegram
        </Button>
      </div>

      {/* Connect dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDlg(); }}>
        <DialogContent>
          {step === "phone" && (
            <>
              <DialogHeader>
                <DialogTitle>Connect Telegram account</DialogTitle>
                <DialogDescription>
                  Enter your phone number. Telegram will send a login code to your existing Telegram app.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (!label.trim() || !phone.trim()) return;
                startMut.mutate({ label: label.trim(), phone: phone.trim() });
              }}>
                <div className="space-y-1.5">
                  <Label htmlFor="label">Label</Label>
                  <Input id="label" placeholder="My main account" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={64} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number (with country code)</Label>
                  <Input id="phone" type="tel" placeholder="+15551234567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={startMut.isPending}>
                    {startMut.isPending ? "Sending code…" : "Send code"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
          {step === "code" && (
            <>
              <DialogHeader>
                <DialogTitle>Enter Telegram code</DialogTitle>
                <DialogDescription>Telegram sent a login code to your app.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (!accountId || !code.trim()) return;
                verifyMut.mutate({ id: accountId, code: code.trim() });
              }}>
                <div className="space-y-1.5">
                  <Label htmlFor="code">Login code</Label>
                  <Input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="12345"
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} required autoFocus />
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setStep("phone")}>
                    <ArrowLeft className="h-3 w-3" /> Back
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" disabled={!accountId || resendMut.isPending}
                      onClick={() => accountId && resendMut.mutate(accountId)}>
                      {resendMut.isPending ? "Resending…" : "Resend code"}
                    </Button>
                    <Button type="submit" disabled={verifyMut.isPending}>
                      {verifyMut.isPending ? "Verifying…" : "Verify"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </>
          )}
          {step === "password" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Two-factor password</DialogTitle>
                <DialogDescription>Enter your Telegram cloud password to finish login.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (!accountId || !password || !code) return;
                verifyMut.mutate({ id: accountId, code, password });
              }}>
                <div className="space-y-1.5">
                  <Label htmlFor="pw">Telegram password</Label>
                  <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={verifyMut.isPending}>
                    {verifyMut.isPending ? "Verifying…" : "Finish"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Telegram accounts */}
      <SectionHeader title="Telegram accounts" subtitle="Accounts that listen for signals." />
      {tgAccounts.length === 0 ? (
        <EmptyState
          title="No Telegram accounts connected"
          description="Connect a Telegram account so Hermes can listen for signals from your channels."
        />
      ) : (
        <div className="grid gap-3">
          {tgAccounts.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium truncate">{t.label}</p>
                    {statusBadge(t.status)}
                    {t.tg_username && <span className="text-xs text-muted-foreground">@{t.tg_username}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.masked_phone ?? "—"}</p>
                  {t.last_error && <p className="mt-1 text-xs text-destructive">{t.last_error}</p>}
                  {(t.status === "awaiting_code" || t.status === "pending_verification" || t.status === "error") && (
                    <Button variant="link" size="sm" className="px-0 h-auto mt-1" onClick={() => resumeVerification(t.id)}>
                      Resume verification →
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive"
                  onClick={() => { if (confirm(`Remove "${t.label}"?`)) delMut.mutate(t.id); }}
                  disabled={delMut.isPending} aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Default exchange */}
      <SectionHeader title="Default exchange" subtitle="Used when a channel doesn't specify its own. Channel-level selection wins." />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Pick a default account</p>
            <p className="text-xs text-muted-foreground">Falls back to first active exchange if unset.</p>
          </div>
          <div className="w-full sm:w-72">
            <Select
              value={riskRow?.default_exchange_account_id ?? "none"}
              onValueChange={(v) => setDefaultMut.mutate(v === "none" ? null : v)}
              disabled={exchanges.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={exchanges.length === 0 ? "No exchanges connected" : "Pick a default"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default (first active)</SelectItem>
                {exchanges.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.label} · {ex.exchange_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Subscribed channels */}
      <SectionHeader
        title="Subscribed channels"
        subtitle={
          activeAccount
            ? `Toggle a channel as a signal source and define its per-trade risk (${telegramChannels.length} total).`
            : "Connect a Telegram account first to see your channels."
        }
        action={
          <div className="flex items-center gap-2">
            {syncMut.isPending ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" /> Syncing…
              </span>
            ) : lastSync?.ok ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400" title={new Date(lastSync.at).toLocaleString()}>
                <CheckCircle2 className="h-3 w-3" /> Synced {formatRelative(lastSync.at)} · {lastSync.count}
              </span>
            ) : lastSync && !lastSync.ok ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive" title={lastSync.error}>
                <AlertCircle className="h-3 w-3" /> Failed {formatRelative(lastSync.at)}
              </span>
            ) : activeAccount ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" /> Never synced
              </span>
            ) : null}
            <Button size="sm" variant="outline" disabled={!activeAccount || syncMut.isPending}
              onClick={() => syncMut.mutate()} className="gap-1">
              <RefreshCw className={`h-3.5 w-3.5 ${syncMut.isPending ? "animate-spin" : ""}`} />
              {syncMut.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        }
      />
      {!activeAccount ? (
        <EmptyState title="Telegram not connected" description="Connect a Telegram account above, then sync your channels." />
      ) : telegramChannels.length === 0 ? (
        <EmptyState title="No channels yet" description="Click 'Sync now' to pull channels from your Telegram account." />
      ) : (
        <>
          <div className="mb-3 relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${telegramChannels.length} channels by name, @username or description…`}
              className="pl-8 pr-8 h-9"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {filteredPersonal.length === 0 ? (
            <EmptyState title="No matches" description={`No personal channels match "${query}".`} />
          ) : (
            <div className="grid gap-3">
              {filteredPersonal.map((c) => (
                <Card key={c.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Radio className="h-4 w-4 text-primary" />
                        <p className="font-medium truncate">{c.name}</p>
                        {c.username && <span className="text-xs text-muted-foreground">@{c.username}</span>}
                        {c.is_signal_source && (
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                            Signal source
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.signals_count ?? 0} signals
                        {c.win_rate != null && ` · ${Number(c.win_rate).toFixed(1)}% win rate`}
                        {c.last_signal_at && ` · last ${new Date(c.last_signal_at).toLocaleDateString()}`}
                      </p>
                      {c.description && <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.is_signal_source}
                          onCheckedChange={(v) => toggleMut.mutate({ id: c.id, is_signal_source: v })}
                          aria-label="Use as signal source"
                        />
                        <span className="text-xs text-muted-foreground">Source</span>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => setRiskChannel({ id: c.id, name: c.name })}>
                        <Sliders className="h-3 w-3" /> Risk
                      </Button>
                      {c.is_signal_source && (
                        c.published_source_id ? (
                          <Link to="/app/marketplace" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20">
                            <Store className="h-3 w-3" /> Published ✓ · Manage
                          </Link>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1"
                            onClick={() => setPublishChannel({ id: c.id, name: c.name })}>
                            <Store className="h-3 w-3" /> Publish as strategy
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Webhooks (TradingView & custom) */}
      <SectionHeader
        title="Webhooks (TradingView & custom)"
        subtitle="Ingest signals from TradingView alerts or any service that can POST a webhook."
        action={
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setWebhookOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create webhook source
          </Button>
        }
      />
      {webhookChannels.length === 0 ? (
        <EmptyState
          title="No webhook sources yet"
          description="Create one to get a unique URL you can paste into TradingView or any webhook-capable service."
        />
      ) : (
        <div className="grid gap-3">
          {webhookChannels.map((c) => {
            const token = c.webhook_token ?? "";
            const masked = token ? `•••• ${token.slice(-4)}` : "—";
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Webhook className="h-4 w-4 text-primary" />
                      <p className="font-medium truncate">{c.name}</p>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">Webhook</span>
                      {c.is_signal_source && (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                          Signal source
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Token {masked}
                      {typeof c.signals_count === "number" && ` · ${c.signals_count} signals`}
                      {c.last_signal_at && ` · last ${new Date(c.last_signal_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1"
                      onClick={() => token && setCreatedWebhook({ id: c.id, name: c.name, token })}
                      disabled={!token}>
                      <Copy className="h-3 w-3" /> Reveal URL
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1"
                      onClick={() => setRiskChannel({ id: c.id, name: c.name })}>
                      <Sliders className="h-3 w-3" /> Risk
                    </Button>
                    {c.is_signal_source && (
                      c.published_source_id ? (
                        <Link to="/app/marketplace" className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20">
                          <Store className="h-3 w-3" /> Published ✓ · Manage
                        </Link>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => setPublishChannel({ id: c.id, name: c.name })}>
                          <Store className="h-3 w-3" /> Publish as strategy
                        </Button>
                      )
                    )}
                    <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground"
                      onClick={() => {
                        if (confirm("Regenerate the token? The current webhook URL will stop working immediately.")) {
                          regenWebhookMut.mutate(c.id);
                        }
                      }}
                      disabled={regenWebhookMut.isPending}>
                      <RotateCw className="h-3 w-3" /> Regenerate
                    </Button>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete webhook source "${c.name}"? This cannot be undone.`)) {
                          deleteWebhookMut.mutate(c.id);
                        }
                      }}
                      disabled={deleteWebhookMut.isPending}
                      aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create webhook dialog */}
      <WebhookCreateDialog
        open={webhookOpen}
        onOpenChange={setWebhookOpen}
        onSubmit={(name) => createWebhookMut.mutate({ name })}
        pending={createWebhookMut.isPending}
      />

      {/* Reveal webhook URL dialog */}
      {createdWebhook && (
        <Dialog open onOpenChange={(v) => { if (!v) setCreatedWebhook(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Webhook className="h-4 w-4" /> Webhook URL · {createdWebhook.name}
              </DialogTitle>
              <DialogDescription>
                Paste this as the Webhook URL in your TradingView alert. Set the alert message to the same
                signal format Hermes already understands, e.g. <code className="rounded bg-muted px-1 py-0.5 text-[11px]">BTCUSDT LONG entry {"{{close}}"} SL 66800 TP1 68000 TP2 69000 lev 10x</code>.
                Generic JSON webhooks are also accepted — put the signal text in a <code className="rounded bg-muted px-1 py-0.5 text-[11px]">text</code> or <code className="rounded bg-muted px-1 py-0.5 text-[11px]">message</code> field.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Webhook URL</p>
                <code className="block break-all text-xs">{webhookUrl(createdWebhook.token)}</code>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="gap-1" onClick={() => copy(webhookUrl(createdWebhook.token), "URL copied")}>
                  <Copy className="h-3.5 w-3.5" /> Copy URL
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(createdWebhook.token, "Token copied")}>
                  Copy token
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep this URL private — anyone with it can post signals to this channel. You can regenerate it any time.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreatedWebhook(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Curated — plan-gated by admin */}
      <SectionHeader
        title="AGENT TRED channels"
        subtitle="Platform sources. Access depends on your subscription plan (set by admin)."
      />
      {platform.length === 0 ? (
        <EmptyState title="No curated sources yet" description="Admin-managed channels will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {platform.map((s) => {
            const locked = Boolean((s as { locked?: boolean }).locked);
            const planLabel = (s as { plan_required_label?: string | null }).plan_required_label;
            const channelRef = (s as { channel_ref?: string | null }).channel_ref;
            return (
              <Card key={s.id} className={locked ? "opacity-80" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.source_type} · {s.code}
                      {planLabel ? ` · plan: ${planLabel}+` : " · all plans"}
                    </p>
                    {s.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
                    )}
                    {channelRef && !locked && (
                      <p className="mt-1 font-mono text-xs text-primary">{channelRef}</p>
                    )}
                    {locked && (
                      <p className="mt-2 text-xs text-amber-400">
                        Locked — upgrade to {planLabel ?? "a higher plan"} to unlock this channel.
                      </p>
                    )}
                  </div>
                  {s.win_rate !== null && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {Number(s.win_rate).toFixed(0)}% win
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  {locked ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/app/billing">Upgrade plan</Link>
                    </Button>
                  ) : (
                    <EnableSourceButton sourceId={s.id} />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {community.length > 0 && (
        <>
          <SectionHeader title="Community Sources" subtitle="Other published signal channels." />
          <div className="grid gap-3 sm:grid-cols-2">
            {community.map((s) => (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.source_type} · {s.code}</p>
                    {s.description && <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>}
                  </div>
                  {s.win_rate !== null && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {Number(s.win_rate).toFixed(0)}% win
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {riskChannel && (
        <RiskDialog channel={riskChannel} exchanges={exchanges} onClose={() => setRiskChannel(null)} />
      )}

      {publishChannel && (
        <PublishDialog
          channel={publishChannel}
          onClose={() => setPublishChannel(null)}
          onSubmit={(name, description) =>
            publishMut.mutate({ channelId: publishChannel.id, name, description })
          }
          pending={publishMut.isPending}
        />
      )}
    </>
  );
}

function RiskDialog({ channel, exchanges, onClose }: {
  channel: { id: string; name: string };
  exchanges: Array<{ id: string; label: string; exchange_code: string; status: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getChannelRiskSettings);
  const saveFn = useServerFn(upsertChannelRiskSettings);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["channel-risk", channel.id],
    queryFn: () => getFn({ data: { channelId: channel.id } }),
  });

  const [alloc, setAlloc] = useState("2");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [leverage, setLeverage] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [exchangeId, setExchangeId] = useState<string>("default");
  const [seeded, setSeeded] = useState(false);

  if (existing && !seeded) {
    setAlloc(String(existing.allocation_percent ?? 2));
    setSl(existing.stop_loss_percent != null ? String(existing.stop_loss_percent) : "");
    setTp(existing.take_profit_percent != null ? String(existing.take_profit_percent) : "");
    setLeverage(String(existing.leverage ?? 1));
    setIsActive(existing.is_active ?? true);
    setExchangeId(existing.exchange_account_id ?? "default");
    setSeeded(true);
  }

  const saveMut = useMutation({
    mutationFn: (vars: {
      channelId: string;
      allocation_percent: number;
      stop_loss_percent: number | null;
      take_profit_percent: number | null;
      leverage: number;
      is_active: boolean;
      exchange_account_id: string | null;
    }) => saveFn({ data: vars }),
    onSuccess: () => {
      toast.success("Risk settings saved.");
      qc.invalidateQueries({ queryKey: ["channel-risk", channel.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Risk settings · {channel.name}</DialogTitle>
          <DialogDescription>
            Define how trades from this channel are sized and protected. Channel-level SL/TP
            percentages override the signal's raw values.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate({
              channelId: channel.id,
              allocation_percent: Number(alloc),
              stop_loss_percent: sl.trim() ? Number(sl) : null,
              take_profit_percent: tp.trim() ? Number(tp) : null,
              leverage: Number(leverage),
              is_active: isActive,
              exchange_account_id: exchangeId === "default" ? null : exchangeId,
            });
          }}>
            <div className="space-y-1.5">
              <Label htmlFor="alloc">Trade allocation (% of balance)</Label>
              <Input id="alloc" type="number" step="0.1" min="0.01" max="100"
                value={alloc} onChange={(e) => setAlloc(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Per-trade notional = balance × allocation × leverage.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sl">Stop loss %</Label>
                <Input id="sl" type="number" step="0.1" min="0" max="100" placeholder="e.g. 2"
                  value={sl} onChange={(e) => setSl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp">Take profit %</Label>
                <Input id="tp" type="number" step="0.1" min="0" max="1000" placeholder="e.g. 5"
                  value={tp} onChange={(e) => setTp(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lev">Leverage</Label>
              <Input id="lev" type="number" step="1" min="1" max="125"
                value={leverage} onChange={(e) => setLeverage(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Exchange</Label>
              <Select value={exchangeId} onValueChange={setExchangeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Use account default</SelectItem>
                  {exchanges.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>{ex.label} · {ex.exchange_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
              <Label htmlFor="active" className="cursor-pointer">Auto-execute trades from this channel</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WebhookCreateDialog({
  open, onOpenChange, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create webhook signal source</DialogTitle>
          <DialogDescription>
            Give this source a name so you can recognize it in your list. On the next screen you'll get a
            unique webhook URL to paste into TradingView (or any webhook-capable service).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onSubmit(trimmed);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Name</Label>
            <Input
              id="wh-name"
              placeholder="e.g. TradingView – BTC breakout"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PublishDialog({
  channel, onClose, onSubmit, pending,
}: {
  channel: { id: string; name: string };
  onClose: () => void;
  onSubmit: (name: string, description: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState("");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Store className="h-4 w-4" /> Publish as strategy</DialogTitle>
          <DialogDescription>
            Publish this channel to the marketplace so other traders can subscribe. Your track record
            (win rate, P&amp;L, drawdown) is computed from real executions, not self-reported numbers.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          onSubmit(n, description.trim());
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="pub-name">Strategy name</Label>
            <Input id="pub-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-desc">Description (optional)</Label>
            <Textarea id="pub-desc" value={description} onChange={(e) => setDescription(e.target.value)}
              maxLength={1000} rows={4} placeholder="Briefly describe your approach, markets you trade, timeframes…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
