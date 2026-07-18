import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, ArrowLeft, Zap, KeyRound, ExternalLink, RefreshCw } from "lucide-react";
import {
  listExchangeAccounts,
  addExchangeAccount,
  deleteExchangeAccount,
  revalidateExchangeAccount,
  setExchangeAccountExecutionMode,
} from "@/lib/user.functions";
import { listExchangeBalances, syncExchangeBalance } from "@/lib/balances.functions";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, ShieldAlert } from "lucide-react";

const opts = queryOptions({
  queryKey: ["exchange-accounts"],
  queryFn: () => listExchangeAccounts(),
});
const balanceOpts = queryOptions({
  queryKey: ["exchange-balances"],
  queryFn: () => listExchangeBalances({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/app/exchanges")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

type ExchangeMeta = {
  code: string;
  name: string;
  initials: string;
  color: string;
  requiresPassphrase?: boolean;
  oauthSupported?: boolean;
  bridge?: boolean;
  bridgeHint?: string;
};

const EXCHANGES: ExchangeMeta[] = [
  { code: "binance", name: "Binance", initials: "BN", color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30", oauthSupported: true },
  { code: "bybit", name: "Bybit", initials: "BY", color: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  { code: "okx", name: "OKX", initials: "OK", color: "bg-zinc-500/15 text-zinc-200 border-zinc-500/30", requiresPassphrase: true, oauthSupported: true },
  { code: "kucoin", name: "KuCoin", initials: "KC", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", requiresPassphrase: true },
  { code: "mexc", name: "MEXC", initials: "MX", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { code: "bitget", name: "Bitget (soon)", initials: "BG", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { code: "gateio", name: "Gate.io (soon)", initials: "GT", color: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  { code: "coinbase", name: "Coinbase (soon)", initials: "CB", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  { code: "kraken", name: "Kraken (soon)", initials: "KR", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { code: "mt5_bridge", name: "MetaTrader 5", initials: "MT", color: "bg-sky-500/15 text-sky-400 border-sky-500/30", bridge: true, bridgeHint: "Run the MT5 bridge EA on your terminal and expose its HTTP endpoint." },
  { code: "dex_bridge", name: "DEX Wallet", initials: "DX", color: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30", bridge: true, bridgeHint: "Self-hosted DEX signer bridge (Hyperliquid, GMX, dYdX, etc.)." },
];

type Step = "grid" | "method" | "manual";

const OAUTH_ENABLED = false;

function Page() {
  const { data } = useSuspenseQuery(opts);
  const qc = useQueryClient();
  const addFn = useServerFn(addExchangeAccount);
  const delFn = useServerFn(deleteExchangeAccount);
  const syncFn = useServerFn(syncExchangeBalance);
  const revalFn = useServerFn(revalidateExchangeAccount);
  const modeFn = useServerFn(setExchangeAccountExecutionMode);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const modeM = useMutation({
    mutationFn: (v: { id: string; mode: "live" | "paper" }) =>
      modeFn({ data: { exchange_account_id: v.id, execution_mode: v.mode } }),
    onSuccess: (_d, v) => {
      toast.success(v.mode === "paper" ? "Switched to paper trading" : "Switched to live trading");
      qc.invalidateQueries({ queryKey: ["exchange-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balances = useQuery(balanceOpts);

  // Live-update balances via Realtime
  useEffect(() => {
    const ch = supabase
      .channel("exchange-balances-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exchange_balances" },
        () => {
          qc.invalidateQueries({ queryKey: ["exchange-balances"] });
          qc.invalidateQueries({ queryKey: ["exchange-accounts"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("grid");
  const [selected, setSelected] = useState<ExchangeMeta | null>(null);
  const [form, setForm] = useState({ label: "", api_key: "", api_secret: "", passphrase: "" });
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const reset = () => {
    setStep("grid");
    setSelected(null);
    setForm({ label: "", api_key: "", api_secret: "", passphrase: "" });
  };

  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          exchange_code: selected!.code,
          label: form.label,
          api_key: form.api_key,
          api_secret: form.api_secret,
          passphrase: form.passphrase || undefined,
        },
      }),
    onSuccess: async (_d, _v, ctx) => {
      toast.success("Exchange connected");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["exchange-accounts"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      void ctx;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["exchange-accounts"] });
      qc.invalidateQueries({ queryKey: ["exchange-balances"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncM = useMutation({
    mutationFn: (id: string) => syncFn({ data: { exchange_account_id: id } }),
    onMutate: (id) => setSyncingId(id),
    onSettled: () => setSyncingId(null),
    onSuccess: (res) => {
      toast.success(`Balance synced (${res.count} assets)`);
      qc.invalidateQueries({ queryKey: ["exchange-balances"] });
      qc.invalidateQueries({ queryKey: ["exchange-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revalM = useMutation({
    mutationFn: (id: string) => revalFn({ data: { id } }),
    onMutate: (id) => setVerifyingId(id),
    onSettled: () => setVerifyingId(null),
    onSuccess: (res) => {
      if (res.ok) toast.success("API keys verified — account is active");
      else toast.error(res.error ?? "Verification failed");
      qc.invalidateQueries({ queryKey: ["exchange-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  type BalanceRow = NonNullable<typeof balances.data>[number];
  const balancesByAcc: Record<string, BalanceRow[]> = {};
  for (const b of balances.data ?? []) {
    (balancesByAcc[b.exchange_account_id] ||= []).push(b);
  }
  const totalUsdByAcc: Record<string, number> = {};
  for (const [k, rows] of Object.entries(balancesByAcc)) {
    totalUsdByAcc[k] = rows.reduce((s, r) => s + Number(r.usd_value ?? 0), 0);
  }

  return (
    <>
      <PageHeader
        title="Exchanges"
        subtitle="Connect and manage exchange API keys."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button>Add exchange</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              {step === "grid" && (
                <>
                  <DialogHeader>
                    <DialogTitle>Choose an exchange</DialogTitle>
                    <DialogDescription>
                      Select the exchange you want to connect your account to.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {EXCHANGES.map((ex) => (
                      <button
                        key={ex.code}
                        type="button"
                        onClick={() => {
                          setSelected(ex);
                          setStep(OAUTH_ENABLED ? "method" : "manual");
                        }}
                        className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                      >
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-full border text-sm font-semibold ${ex.color}`}
                        >
                          {ex.initials}
                        </div>
                        <span className="text-sm font-medium">{ex.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === "method" && selected && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setStep("grid")}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <DialogTitle>Connect {selected.name}</DialogTitle>
                    </div>
                    <DialogDescription>
                      Choose how you'd like to link your {selected.name} account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={!selected.oauthSupported}
                      onClick={() => {
                        if (selected.oauthSupported) {
                          toast.info("Direct connect is coming soon. Use manual API keys for now.");
                        }
                      }}
                      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Direct connection</p>
                        <p className="text-xs text-muted-foreground">
                          {selected.oauthSupported
                            ? "One-click OAuth login via the exchange."
                            : "Not available for this exchange yet."}
                        </p>
                      </div>
                      {selected.oauthSupported && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                          Continue <ExternalLink className="h-3 w-3" />
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep("manual")}
                      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Manual API keys</p>
                        <p className="text-xs text-muted-foreground">
                          Paste your API Key and Secret from the exchange.
                        </p>
                      </div>
                    </button>
                  </div>
                </>
              )}

              {step === "manual" && selected && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setStep("method")}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <DialogTitle>{selected.name} API keys</DialogTitle>
                    </div>
                    <DialogDescription>
                      Keys are encrypted at rest. Use a read+trade key, never withdraw.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Label</Label>
                      <Input
                        value={form.label}
                        onChange={(e) => setForm({ ...form, label: e.target.value })}
                        placeholder="Main account"
                      />
                    </div>
                    <div>
                      <Label>{selected.bridge ? "Bridge URL" : "API Key"}</Label>
                      <Input
                        value={form.api_key}
                        placeholder={selected.bridge ? "https://my-bridge.example.com" : undefined}
                        onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                      />
                      {selected.bridge && selected.bridgeHint && (
                        <p className="mt-1 text-xs text-muted-foreground">{selected.bridgeHint}</p>
                      )}
                    </div>
                    <div>
                      <Label>{selected.bridge ? "Bridge Bearer Token" : "API Secret"}</Label>
                      <Input
                        type="password"
                        value={form.api_secret}
                        onChange={(e) => setForm({ ...form, api_secret: e.target.value })}
                      />
                    </div>
                    {selected.requiresPassphrase && (
                      <div>
                        <Label>Passphrase</Label>
                        <Input
                          type="password"
                          value={form.passphrase}
                          onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => addM.mutate()}
                      disabled={
                        addM.isPending ||
                        !form.label ||
                        !form.api_key ||
                        !form.api_secret ||
                        (selected.requiresPassphrase && !form.passphrase)
                      }
                    >
                      {addM.isPending ? "Saving..." : "Save"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      {data.length === 0 ? (
        <EmptyState
          title="No exchanges yet"
          description="Connect a Binance, Bybit or OKX account to start trading."
        />
      ) : (
        <div className="grid gap-3">
          {data.map((acc) => {
            const meta = EXCHANGES.find((e) => e.code === acc.exchange_code);
            const rows = balancesByAcc[acc.id] ?? [];
            const totalUsd = totalUsdByAcc[acc.id] ?? 0;
            const top = [...rows].sort((a, b) => Number(b.usd_value ?? 0) - Number(a.usd_value ?? 0)).slice(0, 4);
            return (
              <Card key={acc.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {meta && (
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold ${meta.color}`}>
                        {meta.initials}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">
                        {acc.label}{" "}
                        <span className="ml-2 text-xs uppercase text-muted-foreground">{acc.exchange_code}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <StatusBadge status={acc.status} />
                        <ModeToggle
                          mode={(acc as { execution_mode?: string }).execution_mode === "paper" ? "paper" : "live"}
                          disabled={modeM.isPending}
                          onChange={(m) => modeM.mutate({ id: acc.id, mode: m })}
                        />
                        <span className="text-muted-foreground">
                          Added {new Date(acc.created_at).toLocaleDateString()}
                        </span>
                        {acc.validated_at && (
                          <span className="text-muted-foreground">
                            · Verified {new Date(acc.validated_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {acc.last_error && (
                        <p className="mt-1 text-xs text-destructive">{acc.last_error}</p>
                      )}
                      {acc.status === "invalid" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Re-generate API keys with <strong>Futures Trading</strong> enabled, then click Verify.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revalM.mutate(acc.id)}
                      disabled={verifyingId === acc.id}
                      title="Re-verify API keys with the exchange"
                    >
                      <ShieldCheck className={`mr-1 h-4 w-4 ${verifyingId === acc.id ? "animate-pulse" : ""}`} />
                      Verify
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Refresh balance"
                      onClick={() => syncM.mutate(acc.id)}
                      disabled={syncingId === acc.id}
                    >
                      <RefreshCw className={`h-4 w-4 ${syncingId === acc.id ? "animate-spin" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => delM.mutate(acc.id)} disabled={delM.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated value</p>
                    <p className="text-lg font-semibold">
                      ${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  {top.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {top.map((b) => (
                        <span key={b.id} className="rounded-md border border-border px-2 py-1 text-xs">
                          <span className="font-semibold">{b.asset}</span>{" "}
                          <span className="text-muted-foreground">
                            {Number(b.total).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
    active:  { label: "Active",   cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", Icon: ShieldCheck },
    pending: { label: "Pending",  cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",       Icon: ShieldAlert },
    invalid: { label: "Invalid",  cls: "border-destructive/50 bg-destructive/10 text-destructive", Icon: ShieldAlert },
  };
  const m = map[status] ?? { label: status, cls: "border-border bg-muted text-muted-foreground", Icon: ShieldAlert };
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function ModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: "live" | "paper";
  disabled?: boolean;
  onChange: (m: "live" | "paper") => void;
}) {
  const next: "live" | "paper" = mode === "live" ? "paper" : "live";
  const cls =
    mode === "paper"
      ? "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/15"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(next)}
      title={`Click to switch to ${next} trading`}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition disabled:opacity-50 ${cls}`}
    >
      {mode === "paper" ? "Paper" : "Live"}
    </button>
  );
}
