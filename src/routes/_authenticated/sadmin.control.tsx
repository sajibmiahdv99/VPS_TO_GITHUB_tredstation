import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Bot,
  Cable,
  CheckCircle2,
  Copy,
  CreditCard,
  FlaskConical,
  KeyRound,
  Mail,
  PauseCircle,
  Play,
  Radio,
  Settings2,
  Shield,
  SlidersHorizontal,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  adminClearPlatformSecret,
  adminGetControlPanel,
  adminSetPlatformSecret,
  adminTestIntegration,
  adminTriggerCronHook,
  adminUpsertPlatformSetting,
  adminUpsertSettingsBatch,
} from "@/lib/admin.control.functions";

const opts = queryOptions({
  queryKey: ["admin", "control"],
  queryFn: () => adminGetControlPanel(),
});

export const Route = createFileRoute("/_authenticated/sadmin/control")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
});

type TabId =
  | "overview"
  | "apis"
  | "features"
  | "payments"
  | "workers"
  | "affiliate"
  | "brand"
  | "emergency";

const TABS: { id: TabId; label: string; icon: typeof Settings2 }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "apis", label: "API keys", icon: KeyRound },
  { id: "features", label: "Features", icon: SlidersHorizontal },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "workers", label: "Workers & webhooks", icon: Cable },
  { id: "affiliate", label: "Affiliate & risk", icon: Users },
  { id: "brand", label: "Brand & contact", icon: Mail },
  { id: "emergency", label: "Emergency", icon: Shield },
];

const SECRET_CAT_LABEL: Record<string, string> = {
  payments: "Payments",
  email: "Email",
  telegram: "Telegram",
  ai: "AI / parser",
  security: "Security",
  exchange: "Exchange OAuth",
  observability: "Observability",
  kyc: "KYC",
};

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertPlatformSetting);
  const batchFn = useServerFn(adminUpsertSettingsBatch);
  const setSecretFn = useServerFn(adminSetPlatformSecret);
  const clearSecretFn = useServerFn(adminClearPlatformSecret);
  const triggerFn = useServerFn(adminTriggerCronHook);
  const testFn = useServerFn(adminTestIntegration);

  const [tab, setTab] = useState<TabId>("overview");
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [secretFilter, setSecretFilter] = useState("");
  const [walletAddress, setWalletAddress] = useState(
    String((data.settings["payments.manual_usdt"] as { address?: string })?.address ?? ""),
  );
  const [walletNetwork, setWalletNetwork] = useState(
    String((data.settings["payments.manual_usdt"] as { network?: string })?.network ?? "TRC20"),
  );
  const rates = (data.settings["affiliate.rates"] as number[]) ?? [0.3, 0.1, 0.05];
  const [rateDraft, setRateDraft] = useState(rates.map((r) => String(Math.round(r * 10000) / 100)));
  const [stringDrafts, setStringDrafts] = useState<Record<string, string>>({
    "brand.support_email": String(data.settings["brand.support_email"] ?? ""),
    "brand.telegram_support": String(data.settings["brand.telegram_support"] ?? ""),
    "brand.twitter": String(data.settings["brand.twitter"] ?? ""),
    "ai.model": String(data.settings["ai.model"] ?? ""),
    "ai.gateway_url": String(data.settings["ai.gateway_url"] ?? ""),
    "email.subject_prefix": String(data.settings["email.subject_prefix"] ?? "AGENT TRED"),
    "trading.max_leverage_cap": String(data.settings["trading.max_leverage_cap"] ?? 20),
    "signal_quality.min_score": String(data.settings["signal_quality.min_score"] ?? 25),
    "signal_quality.min_sample": String(data.settings["signal_quality.min_sample"] ?? 10),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "control"] });
  const base = data.publicAppUrl || (typeof window !== "undefined" ? window.location.origin : "");

  const setBool = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      upsertFn({ data: { key, value } }),
    onSuccess: () => {
      toast.success("Setting saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveWallet = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          key: "payments.manual_usdt",
          value: { network: walletNetwork, address: walletAddress, memo_required: false },
        },
      }),
    onSuccess: () => {
      toast.success("Manual USDT wallet saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSecret = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      setSecretFn({ data: { key, value } }),
    onSuccess: (_, v) => {
      toast.success("API key / secret stored (encrypted)");
      setSecretDrafts((d) => ({ ...d, [v.key]: "" }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearSecret = useMutation({
    mutationFn: (key: string) => clearSecretFn({ data: { key } }),
    onSuccess: () => {
      toast.success("Secret cleared from vault");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trigger = useMutation({
    mutationFn: (hookId: string) => triggerFn({ data: { hookId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Hook OK (${r.status}) in ${r.ms}ms`);
      else toast.error(`Hook failed ${r.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testInt = useMutation({
    mutationFn: (target: "nowpayments" | "resend" | "telegram" | "ai" | "health") =>
      testFn({ data: { target } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(String(r.detail ?? "OK"));
      else toast.error(String(r.detail ?? "Failed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRates = useMutation({
    mutationFn: () => {
      const parsed = rateDraft.map((s) => {
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Rates must be 0–100%");
        return n / 100;
      });
      return upsertFn({ data: { key: "affiliate.rates", value: parsed } });
    },
    onSuccess: () => {
      toast.success("Affiliate rates saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveStrings = useMutation({
    mutationFn: async (keys: string[]) => {
      const items = keys.map((key) => {
        const raw = stringDrafts[key] ?? "";
        const meta = data.settingMeta[key];
        let value: unknown = raw;
        if (meta?.type === "number") value = Number(raw);
        return { key, value };
      });
      return batchFn({ data: { items } });
    },
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bool = (key: string) => Boolean(data.settings[key]);
  const providers = (data.settings["payments.enabled_providers"] as string[]) ?? [];

  const filteredSecrets = useMemo(() => {
    const q = secretFilter.trim().toLowerCase();
    return data.secrets.filter(
      (s) =>
        !q ||
        s.key.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.category.includes(q),
    );
  }, [data.secrets, secretFilter]);

  const secretsByCat = useMemo(() => {
    const m = new Map<string, typeof data.secrets>();
    for (const s of filteredSecrets) {
      const list = m.get(s.category) ?? [];
      list.push(s);
      m.set(s.category, list);
    }
    return m;
  }, [filteredSecrets]);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed"),
    );
  }

  const Toggle = ({
    label,
    desc,
    settingKey,
  }: {
    label: string;
    desc: string;
    settingKey: string;
  }) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/40 p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch
        checked={bool(settingKey)}
        onCheckedChange={(v) => setBool.mutate({ key: settingKey, value: v })}
      />
    </div>
  );

  function setProviders(list: string[]) {
    upsertFn({ data: { key: "payments.enabled_providers", value: list } })
      .then(() => {
        toast.success("Payment providers updated");
        invalidate();
      })
      .catch((e: Error) => toast.error(e.message));
  }

  return (
    <>
      <PageHeader
        title="Control Center"
        subtitle="Full super-admin cockpit — APIs, features, payments, workers, and kill switches."
      />

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card/50 p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm",
                active
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { l: "Users", v: data.stats.users, i: Users },
              { l: "Active subs", v: data.stats.active_subs, i: CreditCard },
              { l: "Orders", v: data.stats.orders, i: Activity },
              { l: "Sources", v: data.stats.sources, i: Radio },
              {
                l: "API keys set",
                v: `${data.stats.secrets_configured}/${data.stats.secrets_total}`,
                i: KeyRound,
              },
            ].map((s) => (
              <Card key={s.l} className="!p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.l}</p>
                  <s.i className="h-4 w-4 text-violet-400" />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{s.v}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-semibold">Platform</p>
              <dl className="space-y-2 text-xs">
                <Row k="Public URL" v={data.publicAppUrl || "—"} copyable onCopy={copy} />
                <Row k="Domain" v={data.domain || "—"} />
                <Row k="Supabase (server)" v={data.system.supabase_url || "—"} />
                <Row k="Supabase (client)" v={data.system.vite_supabase_public || "—"} />
                <Row k="Node" v={data.system.node} />
                <Row k="Uptime" v={`${Math.floor(data.system.uptime_s / 60)} min`} />
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant={data.system.has_cron_secret ? "default" : "destructive"}>
                    cron secret {data.system.has_cron_secret ? "OK" : "missing"}
                  </Badge>
                  <Badge variant={data.system.has_platform_secrets_key ? "default" : "destructive"}>
                    vault key {data.system.has_platform_secrets_key ? "OK" : "missing"}
                  </Badge>
                  <Badge variant={bool("trading.global_pause") ? "destructive" : "default"}>
                    trading {bool("trading.global_pause") ? "PAUSED" : "live"}
                  </Badge>
                  <Badge variant={bool("features.maintenance_mode") ? "destructive" : "outline"}>
                    maintenance {bool("features.maintenance_mode") ? "ON" : "off"}
                  </Badge>
                </div>
              </dl>
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold">Quick tests</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["health", "App health", Zap],
                    ["nowpayments", "NOWPayments", Wallet],
                    ["resend", "Resend email", Mail],
                    ["telegram", "Telegram bot", Bot],
                    ["ai", "AI gateway", FlaskConical],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <Button
                    key={id}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    disabled={testInt.isPending}
                    onClick={() => testInt.mutate(id)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    Test {label}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Uses keys from env or encrypted vault. Failures show a toast with the reason.
              </p>
            </Card>
          </div>

          <Card>
            <p className="mb-3 text-sm font-semibold">Worker health</p>
            {data.health.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No reports yet — cron and price-relay populate this.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.health.map((h) => (
                  <div key={h.component} className="rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      {h.last_error ? (
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                      <p className="font-mono text-xs font-medium">{h.component}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      last ok: {h.last_ok_at ? new Date(h.last_ok_at).toLocaleString() : "—"}
                    </p>
                    {h.last_error && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-destructive">{h.last_error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* API KEYS */}
      {tab === "apis" && (
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">API keys & secrets vault</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Encrypted at rest. Env vars override vault when both exist. Values never re-display after save.
                </p>
              </div>
              <Input
                className="max-w-xs"
                placeholder="Filter keys…"
                value={secretFilter}
                onChange={(e) => setSecretFilter(e.target.value)}
              />
            </div>

            {!data.system.has_platform_secrets_key && (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                PLATFORM_SECRETS_KEY / EXCHANGE_ENCRYPTION_KEY missing — vault writes will fail. Set in server .env.
              </div>
            )}

            {[...secretsByCat.entries()].map(([cat, list]) => (
              <div key={cat} className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-400">
                  {SECRET_CAT_LABEL[cat] ?? cat}
                </p>
                <div className="space-y-2">
                  {list.map((s) => (
                    <div
                      key={s.key}
                      className="grid gap-2 rounded-xl border border-border p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] lg:items-end"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{s.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{s.key}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{s.description}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge variant={s.configured ? "default" : "outline"} className="text-[10px]">
                            {s.configured ? s.source : "not set"}
                          </Badge>
                          {s.hint && (
                            <span className="font-mono text-[10px] text-muted-foreground">{s.hint}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px]">New value</Label>
                        <Input
                          type="password"
                          autoComplete="off"
                          value={secretDrafts[s.key] ?? ""}
                          onChange={(e) =>
                            setSecretDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                          }
                          placeholder="paste…"
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!secretDrafts[s.key] || saveSecret.isPending}
                        onClick={() =>
                          saveSecret.mutate({ key: s.key, value: secretDrafts[s.key] })
                        }
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!s.configured || s.source === "env" || clearSecret.isPending}
                        onClick={() => {
                          if (confirm(`Clear vault secret ${s.key}?`)) clearSecret.mutate(s.key);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* FEATURES */}
      {tab === "features" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-3 text-sm font-semibold">Product modules</p>
            <div className="space-y-2">
              <Toggle label="Marketplace" desc="Copy-trading marketplace" settingKey="features.marketplace" />
              <Toggle label="Affiliate program" desc="Referrals & commissions" settingKey="features.affiliate" />
              <Toggle label="Leaderboard" desc="Source quality ranking" settingKey="features.leaderboard" />
              <Toggle label="Onboarding wizard" desc="Setup checklist" settingKey="features.onboarding" />
              <Toggle label="Backtesting" desc="Historical replay" settingKey="features.backtest" />
              <Toggle label="Heatmap" desc="Exposure heatmap" settingKey="features.heatmap" />
              <Toggle label="Risk optimizer" desc="AI risk suggestions" settingKey="features.risk_optimizer" />
              <Toggle label="Paper trading" desc="Allow paper mode" settingKey="features.paper_trading" />
              <Toggle label="Public landing stats" desc="Live counts on homepage" settingKey="features.public_stats" />
              <Toggle label="Open signups" desc="Allow new registrations" settingKey="features.signup_open" />
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold">Trading & intelligence</p>
            <div className="space-y-2">
              <Toggle label="AI signal parser" desc="LLM fallback parser" settingKey="ai.parser_enabled" />
              <Toggle label="Signal quality gate" desc="Auto-mute weak sources" settingKey="features.signal_quality_gate" />
              <Toggle label="Email notifications" desc="Resend dispatch" settingKey="features.email_notifications" />
              <Toggle label="Telegram notifications" desc="Bot dispatch" settingKey="features.telegram_notifications" />
              <Toggle label="KYC required" desc="Before live trading" settingKey="features.kyc_required" />
              <Toggle label="Exchange OAuth" desc="OAuth connect UI" settingKey="features.oauth_exchange" />
              <Toggle label="MT5 bridge" desc="Show MT5 option" settingKey="features.mt5_bridge" />
              <Toggle label="DEX bridge" desc="Show DEX option" settingKey="features.dex_bridge" />
              <Toggle label="Default paper mode" desc="New accounts start paper" settingKey="trading.default_paper" />
            </div>
            <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
              {(["signal_quality.min_score", "signal_quality.min_sample", "trading.max_leverage_cap"] as const).map(
                (k) => (
                  <div key={k}>
                    <Label className="text-xs">{data.settingMeta[k]?.label ?? k}</Label>
                    <Input
                      value={stringDrafts[k] ?? ""}
                      onChange={(e) => setStringDrafts((d) => ({ ...d, [k]: e.target.value }))}
                    />
                  </div>
                ),
              )}
              <div className="sm:col-span-2">
                <Button
                  size="sm"
                  onClick={() =>
                    saveStrings.mutate([
                      "signal_quality.min_score",
                      "signal_quality.min_sample",
                      "trading.max_leverage_cap",
                    ])
                  }
                  disabled={saveStrings.isPending}
                >
                  Save numeric limits
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* PAYMENTS */}
      {tab === "payments" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-3 text-sm font-semibold">Providers</p>
            <div className="space-y-2">
              {(
                [
                  ["nowpayments", "NOWPayments", "Crypto auto-invoice + IPN"],
                  ["manual_usdt", "Manual USDT", "Show wallet; admin confirms"],
                ] as const
              ).map(([id, label, desc]) => {
                const on = providers.includes(id);
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) => {
                        const next = new Set(providers);
                        if (v) next.add(id);
                        else next.delete(id);
                        setProviders(Array.from(next));
                      }}
                    />
                  </div>
                );
              })}
              <Toggle label="Show Stripe" desc="Card billing UI (needs keys)" settingKey="payments.stripe_enabled" />
              <Toggle label="Show Paddle" desc="Paddle UI (needs keys)" settingKey="payments.paddle_enabled" />
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium">Manual USDT wallet</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Network</Label>
                  <Input value={walletNetwork} onChange={(e) => setWalletNetwork(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} />
                </div>
              </div>
              <Button size="sm" onClick={() => saveWallet.mutate()} disabled={saveWallet.isPending}>
                Save wallet
              </Button>
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold">Webhook endpoints</p>
            <div className="space-y-3 text-xs">
              <Endpoint base={base} path={data.webhookUrls.payment} label="Payment IPN" onCopy={copy} />
              <Endpoint base={base} path={data.webhookUrls.telegram} label="Telegram bot" onCopy={copy} />
              <Endpoint base={base} path={data.webhookUrls.health} label="Health check" onCopy={copy} />
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Paste API keys under the <strong>API keys</strong> tab (NOWPayments, Stripe, Resend, etc.).
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={testInt.isPending}
              onClick={() => testInt.mutate("nowpayments")}
            >
              Test NOWPayments key
            </Button>
          </Card>
        </div>
      )}

      {/* WORKERS */}
      {tab === "workers" && (
        <div className="space-y-4">
          <Card>
            <p className="mb-1 text-sm font-semibold">Cron hooks</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Run workers manually. Header <code className="text-[10px]">x-cron-secret</code> is applied
              server-side.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.cronHooks.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{h.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{h.path}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => copy(base + h.path)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={trigger.isPending}
                      onClick={() => trigger.mutate(h.id)}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" />
                      Run
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold">Price relay</p>
            <Endpoint base={base} path={data.webhookUrls.priceTick} label="Price tick" onCopy={copy} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              systemd unit <code>hermes-price-relay</code> posts here with{" "}
              <code>x-relay-secret</code>.
            </p>
          </Card>
        </div>
      )}

      {/* AFFILIATE */}
      {tab === "affiliate" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-3 text-sm font-semibold">Generation rates (G1–G7)</p>
            <p className="mb-3 text-xs text-muted-foreground">Enter percent, e.g. 30 for 30%.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {rateDraft.map((v, i) => (
                <div key={i}>
                  <Label className="text-[10px]">G{i + 1} %</Label>
                  <Input
                    value={v}
                    onChange={(e) => {
                      const next = [...rateDraft];
                      next[i] = e.target.value;
                      setRateDraft(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => saveRates.mutate()}
              disabled={saveRates.isPending}
            >
              Save rates
            </Button>
            <Button
              className="ml-2 mt-3"
              size="sm"
              variant="outline"
              onClick={() =>
                setRateDraft(["30", "10", "5", "2", "1", "0.5", "0.5"])
              }
            >
              Reset defaults
            </Button>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-semibold">AI model (settings override)</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Model id</Label>
                <Input
                  value={stringDrafts["ai.model"] ?? ""}
                  onChange={(e) => setStringDrafts((d) => ({ ...d, "ai.model": e.target.value }))}
                  placeholder="google/gemini-2.0-flash-001"
                />
              </div>
              <div>
                <Label className="text-xs">Gateway URL</Label>
                <Input
                  value={stringDrafts["ai.gateway_url"] ?? ""}
                  onChange={(e) =>
                    setStringDrafts((d) => ({ ...d, "ai.gateway_url": e.target.value }))
                  }
                  placeholder="https://openrouter.ai/api/v1/chat/completions"
                />
              </div>
              <Button
                size="sm"
                onClick={() => saveStrings.mutate(["ai.model", "ai.gateway_url"])}
                disabled={saveStrings.isPending}
              >
                Save AI settings
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Prefer vault secrets for the API key under <strong>API keys → AI</strong>.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* BRAND */}
      {tab === "brand" && (
        <Card>
          <p className="mb-3 text-sm font-semibold">Brand & support contact</p>
          <div className="grid max-w-xl gap-3">
            {(
              [
                ["brand.support_email", "Support email"],
                ["brand.telegram_support", "Support Telegram"],
                ["brand.twitter", "Twitter / X"],
                ["email.subject_prefix", "Email subject prefix"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <Label className="text-xs">{label}</Label>
                <Input
                  value={stringDrafts[k] ?? ""}
                  onChange={(e) => setStringDrafts((d) => ({ ...d, [k]: e.target.value }))}
                />
              </div>
            ))}
            <Button
              size="sm"
              className="w-fit"
              onClick={() =>
                saveStrings.mutate([
                  "brand.support_email",
                  "brand.telegram_support",
                  "brand.twitter",
                  "email.subject_prefix",
                ])
              }
              disabled={saveStrings.isPending}
            >
              Save brand
            </Button>
          </div>
        </Card>
      )}

      {/* EMERGENCY */}
      {tab === "emergency" && (
        <div className="space-y-4">
          <Card className="border-destructive/40">
            <div className="mb-3 flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm font-semibold text-destructive">Emergency controls</p>
            </div>
            <div className="space-y-2">
              <Toggle
                label="GLOBAL TRADING PAUSE"
                desc="Immediately blocks new signal → order fan-out"
                settingKey="trading.global_pause"
              />
              <Toggle
                label="Maintenance mode"
                desc="Platform maintenance flag for UI / soft blocks"
                settingKey="features.maintenance_mode"
              />
              <Toggle
                label="Close signups"
                desc="Turn OFF open registrations"
                settingKey="features.signup_open"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBool.mutate({ key: "trading.global_pause", value: true })}
              >
                Pause all trading now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBool.mutate({ key: "trading.global_pause", value: false })}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Resume trading
              </Button>
            </div>
          </Card>
          <Card>
            <p className="mb-2 text-sm font-semibold">Security posture</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                IP allowlist:{" "}
                {data.system.sadmin_ip_allowlist ? (
                  <span className="text-emerald-400">configured</span>
                ) : (
                  <span className="text-amber-400">open (set SADMIN_IP_ALLOWLIST in .env)</span>
                )}
              </li>
              <li>
                MFA for /sadmin:{" "}
                {data.system.sadmin_require_mfa ? (
                  <span className="text-emerald-400">required when enrolled</span>
                ) : (
                  "optional"
                )}
              </li>
              <li>All secret writes are IP-checked when allowlist is set and audit-logged.</li>
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

function Row({
  k,
  v,
  copyable,
  onCopy,
}: {
  k: string;
  v: string;
  copyable?: boolean;
  onCopy?: (t: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right font-mono">
        <span className="truncate">{v}</span>
        {copyable && onCopy && v !== "—" && (
          <button type="button" className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onCopy(v)}>
            <Copy className="h-3 w-3" />
          </button>
        )}
      </dd>
    </div>
  );
}

function Endpoint({
  base,
  path,
  label,
  onCopy,
}: {
  base: string;
  path: string;
  label: string;
  onCopy: (t: string) => void;
}) {
  const full = `${base}${path}`;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <button type="button" onClick={() => onCopy(full)} className="text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <code className="mt-1 block break-all text-[11px]">{full}</code>
    </div>
  );
}
