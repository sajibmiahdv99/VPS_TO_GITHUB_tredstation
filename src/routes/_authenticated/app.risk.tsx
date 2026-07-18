import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMyRiskSettings, upsertMyRiskSettings } from "@/lib/user.functions";
import { getMyKillSwitch, setMyKillSwitch } from "@/lib/killswitch.functions";

const opts = queryOptions({ queryKey: ["risk-settings"], queryFn: () => getMyRiskSettings() });
const ksOpts = queryOptions({ queryKey: ["kill-switch"], queryFn: () => getMyKillSwitch() });

export const Route = createFileRoute("/_authenticated/app/risk")({
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(opts), context.queryClient.ensureQueryData(ksOpts)]),
  component: Page,
  errorComponent: ({ error }) => <p className="text-sm text-destructive">{error.message}</p>,
  notFoundComponent: () => <p>Not found.</p>,
});

const DEFAULTS = {
  max_trade_size_percent: 5,
  risk_per_trade_percent: 1,
  max_open_positions: 5,
  daily_loss_limit_percent: 5,
  max_drawdown_percent: 20,
  cooldown_minutes_after_loss: 30,
  break_even_enabled: true,
  auto_trade_enabled: true,
  symbol_allowlist: "" as string,
  symbol_denylist: "" as string,
  min_leverage: "" as string,
  max_leverage: "" as string,
  max_concurrent_trades: "" as string,
  market_fallback: false,
  max_slippage_percent: "" as string,
  entry_mode: "single" as "single" | "scale_in",
  entry_levels_count: 3,
  entry_range_percent: "" as string,
  entry_distribution: "equal" as "equal" | "front_loaded" | "back_loaded",
};

function splitSymbols(s: string): string[] | null {
  const arr = s
    .split(/[,\s]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return arr.length ? arr : null;
}

function Page() {
  const { data } = useSuspenseQuery(opts);
  const { data: ks } = useSuspenseQuery(ksOpts);
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertMyRiskSettings);
  const ksFn = useServerFn(setMyKillSwitch);
  const [form, setForm] = useState({ ...DEFAULTS });

  const toggleKs = useMutation({
    mutationFn: (enabled: boolean) => ksFn({ data: { enabled, hours: 24 } }),
    onSuccess: () => { toast.success("Kill-switch updated"); qc.invalidateQueries({ queryKey: ["kill-switch"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (data) {
      setForm({
        max_trade_size_percent: Number(data.max_trade_size_percent ?? DEFAULTS.max_trade_size_percent),
        risk_per_trade_percent: Number(data.risk_per_trade_percent ?? DEFAULTS.risk_per_trade_percent),
        max_open_positions: Number(data.max_open_positions ?? DEFAULTS.max_open_positions),
        daily_loss_limit_percent: Number(data.daily_loss_limit_percent ?? DEFAULTS.daily_loss_limit_percent),
        max_drawdown_percent: Number(data.max_drawdown_percent ?? DEFAULTS.max_drawdown_percent),
        cooldown_minutes_after_loss: Number(data.cooldown_minutes_after_loss ?? DEFAULTS.cooldown_minutes_after_loss),
        break_even_enabled: Boolean(data.break_even_enabled ?? DEFAULTS.break_even_enabled),
        auto_trade_enabled: Boolean(data.auto_trade_enabled ?? true),
        symbol_allowlist: Array.isArray(data.symbol_allowlist) ? data.symbol_allowlist.join(", ") : "",
        symbol_denylist: Array.isArray(data.symbol_denylist) ? data.symbol_denylist.join(", ") : "",
        min_leverage: data.min_leverage != null ? String(data.min_leverage) : "",
        max_leverage: data.max_leverage != null ? String(data.max_leverage) : "",
        max_concurrent_trades: data.max_concurrent_trades != null ? String(data.max_concurrent_trades) : "",
        market_fallback: Boolean((data as { market_fallback?: boolean | null }).market_fallback ?? false),
        max_slippage_percent:
          (data as { max_slippage_percent?: number | string | null }).max_slippage_percent != null
            ? String((data as { max_slippage_percent?: number | string | null }).max_slippage_percent)
            : "",
        entry_mode: ((data as { entry_mode?: string | null }).entry_mode === "scale_in" ? "scale_in" : "single") as "single" | "scale_in",
        entry_levels_count: Number((data as { entry_levels_count?: number | null }).entry_levels_count ?? DEFAULTS.entry_levels_count),
        entry_range_percent:
          (data as { entry_range_percent?: number | string | null }).entry_range_percent != null
            ? String((data as { entry_range_percent?: number | string | null }).entry_range_percent)
            : "",
        entry_distribution: (((data as { entry_distribution?: string | null }).entry_distribution as "equal" | "front_loaded" | "back_loaded" | null) ?? "equal"),
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          max_trade_size_percent: form.max_trade_size_percent,
          risk_per_trade_percent: form.risk_per_trade_percent,
          max_open_positions: form.max_open_positions,
          daily_loss_limit_percent: form.daily_loss_limit_percent,
          max_drawdown_percent: form.max_drawdown_percent,
          cooldown_minutes_after_loss: form.cooldown_minutes_after_loss,
          break_even_enabled: form.break_even_enabled,
          auto_trade_enabled: form.auto_trade_enabled,
          symbol_allowlist: splitSymbols(form.symbol_allowlist),
          symbol_denylist: splitSymbols(form.symbol_denylist),
          min_leverage: form.min_leverage ? Number(form.min_leverage) : null,
          max_leverage: form.max_leverage ? Number(form.max_leverage) : null,
          max_concurrent_trades: form.max_concurrent_trades ? Number(form.max_concurrent_trades) : null,
          market_fallback: form.market_fallback,
          max_slippage_percent: form.max_slippage_percent ? Number(form.max_slippage_percent) : null,
          entry_mode: form.entry_mode,
          entry_levels_count: form.entry_mode === "scale_in" ? Math.max(2, Math.min(10, Number(form.entry_levels_count) || 2)) : 1,
          entry_range_percent: form.entry_mode === "scale_in" && form.entry_range_percent ? Number(form.entry_range_percent) : null,
          entry_distribution: form.entry_distribution,
        },
      }),
    onSuccess: () => { toast.success("Risk settings saved"); qc.invalidateQueries({ queryKey: ["risk-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (k: "max_trade_size_percent" | "risk_per_trade_percent" | "max_open_positions" | "daily_loss_limit_percent" | "max_drawdown_percent" | "cooldown_minutes_after_loss", label: string, hint?: string) => (
    <div>
      <Label>{label}</Label>
      <Input type="number" step="0.1" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const txt = (k: "symbol_allowlist" | "symbol_denylist" | "min_leverage" | "max_leverage" | "max_concurrent_trades", label: string, placeholder?: string, hint?: string) => (
    <div>
      <Label>{label}</Label>
      <Input value={form[k]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <>
      <PageHeader title="Risk & Customization" subtitle="Position sizing, daily limits, drawdown protection, and per-user trading rules." />

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">Kill switch</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Instantly pause all new orders for your account. Existing positions are unaffected.
            </p>
            {ks?.active && ks.block && (
              <p className="mt-2 text-xs text-destructive">
                Active — {ks.block.reason}. Auto-resumes {new Date(ks.block.blocked_until).toLocaleString()}.
              </p>
            )}
          </div>
          <Button
            variant={ks?.active ? "outline" : "destructive"}
            onClick={() => toggleKs.mutate(!ks?.active)}
            disabled={toggleKs.isPending}
          >
            {ks?.active ? "Resume trading" : "Engage kill switch"}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium">Auto-trading</h3>
        <label className="flex items-center gap-2">
          <Checkbox checked={form.auto_trade_enabled} onCheckedChange={(v) => setForm({ ...form, auto_trade_enabled: Boolean(v) })} />
          <span className="text-sm">Enable auto-trading from subscribed signal sources</span>
        </label>
        <p className="mt-1 text-xs text-muted-foreground">When off, no signals are queued for your account.</p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium">Position sizing & limits</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {num("max_trade_size_percent", "Max trade size (%)", "Per-trade % of account.")}
          {num("risk_per_trade_percent", "Risk per trade (%)", "Used to size stop-loss.")}
          {num("max_open_positions", "Max open positions")}
          {num("daily_loss_limit_percent", "Daily loss limit (%)")}
          {num("max_drawdown_percent", "Max drawdown (%)")}
          {num("cooldown_minutes_after_loss", "Cooldown after loss (min)")}
          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox checked={form.break_even_enabled} onCheckedChange={(v) => setForm({ ...form, break_even_enabled: Boolean(v) })} />
            <span className="text-sm">Move stop to break-even when first TP hits</span>
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium">Symbol & leverage filters</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {txt("symbol_allowlist", "Symbol allowlist", "BTCUSDT, ETHUSDT", "Only these symbols will be traded (empty = all).")}
          {txt("symbol_denylist", "Symbol denylist", "DOGEUSDT, SHIBUSDT", "Signals on these symbols are skipped.")}
          {txt("min_leverage", "Min leverage", "1", "Bumps signal leverage up to this floor.")}
          {txt("max_leverage", "Max leverage", "20", "Caps signal leverage to this ceiling.")}
          {txt("max_concurrent_trades", "Max concurrent trades", "10", "Hard cap on open + queued orders.")}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium">Execution</h3>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="market_fallback">Fill at market if price moved</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Place a market order instead of a limit at the signal price, so fast signals aren't missed.
            </p>
          </div>
          <Switch
            id="market_fallback"
            checked={form.market_fallback}
            onCheckedChange={(v) => setForm({ ...form, market_fallback: Boolean(v) })}
          />
        </div>
        {form.market_fallback && (
          <div className="mt-4">
            <Label>Max slippage %</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="e.g. 1.5"
              value={form.max_slippage_percent}
              onChange={(e) => setForm({ ...form, max_slippage_percent: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Skip the trade if price has moved more than this % from the signal entry. Leave blank for no cap.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium">Entry mode</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Mode</Label>
            <Select
              value={form.entry_mode}
              onValueChange={(v) => setForm({ ...form, entry_mode: v as "single" | "scale_in" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single entry (default)</SelectItem>
                <SelectItem value="scale_in">Scale-in (DCA ladder)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Single places one order at the signal price. Scale-in splits the position into multiple limit entries stepping away from the signal price, to average your entry.
            </p>
          </div>
          {form.entry_mode === "scale_in" && (
            <>
              <div>
                <Label>Levels</Label>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  step={1}
                  value={form.entry_levels_count}
                  onChange={(e) => setForm({ ...form, entry_levels_count: Number(e.target.value) })}
                />
                <p className="mt-1 text-xs text-muted-foreground">Number of limit entries (2–10).</p>
              </div>
              <div>
                <Label>Range %</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 3"
                  value={form.entry_range_percent}
                  onChange={(e) => setForm({ ...form, entry_range_percent: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">How far the ladder spans from entry (longs step down, shorts step up).</p>
              </div>
              <div className="sm:col-span-2">
                <Label>Distribution</Label>
                <Select
                  value={form.entry_distribution}
                  onValueChange={(v) => setForm({ ...form, entry_distribution: v as "equal" | "front_loaded" | "back_loaded" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equal">Equal — same size at each level</SelectItem>
                    <SelectItem value="front_loaded">Front-loaded — bigger near signal price</SelectItem>
                    <SelectItem value="back_loaded">Back-loaded — bigger at far end</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scale-in produces multiple entry orders — they appear as separate rows in Active Trades.
                </p>
              </div>
            </>
          )}
        </div>
      </Card>





      <div className="mt-5 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
      </div>
    </>
  );
}
