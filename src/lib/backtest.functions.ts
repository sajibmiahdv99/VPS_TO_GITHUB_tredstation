import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(1).max(120),
      start_date: z.string(),
      end_date: z.string(),
      initial_balance: z.number().positive().max(10_000_000),
      fee_pct: z.number().min(0).max(1).default(0.05),
      channel_ids: z.array(z.string().uuid()).optional(),
      symbols: z.array(z.string()).optional(),
      risk_per_trade_percent: z.number().min(0.01).max(20).optional(),
      max_trade_size_percent: z.number().min(0.1).max(100).optional(),
      max_open_positions: z.number().int().min(1).max(50).optional(),
      hold_timeout_hours: z.number().int().min(1).max(168).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (end <= start) throw new Error("end_date must be after start_date");
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (days > 90) throw new Error("Maximum range is 90 days");

    const { data: row, error } = await context.supabase
      .from("backtest_runs")
      .insert({
        user_id: context.userId,
        name: data.name,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        initial_balance: data.initial_balance,
        fee_pct: data.fee_pct,
        config: {
          channel_ids: data.channel_ids ?? [],
          symbols: data.symbols ?? [],
          risk_per_trade_percent: data.risk_per_trade_percent ?? 1,
          max_trade_size_percent: data.max_trade_size_percent ?? 10,
          max_open_positions: data.max_open_positions ?? 5,
          hold_timeout_hours: data.hold_timeout_hours ?? 48,
        },
        status: "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listBacktests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("backtest_runs")
      .select("id, name, status, start_date, end_date, initial_balance, progress, summary, error, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getBacktest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [run, trades] = await Promise.all([
      context.supabase.from("backtest_runs").select("*").eq("id", data.id).single(),
      context.supabase.from("backtest_trades").select("*").eq("run_id", data.id).order("entry_time"),
    ]);
    if (run.error) throw new Error(run.error.message);
    return { run: run.data, trades: trades.data ?? [] };
  });

export const deleteBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("backtest_runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Risk Optimizer ============

export type BTSummaryForScore = {
  total_trades?: number;
  total_pnl_pct?: number;
  max_drawdown_pct?: number;
};

export function scoreBacktestSummary(
  summary: BTSummaryForScore | null | undefined,
  minTrades = 5,
): { score: number | null; eligible: boolean } {
  const totalTrades = Number(summary?.total_trades ?? 0);
  const eligible = totalTrades >= minTrades;
  if (!eligible) return { score: null, eligible: false };
  const pnlPct = Number(summary?.total_pnl_pct ?? 0);
  const ddPct = Number(summary?.max_drawdown_pct ?? 0);
  const score = pnlPct / Math.max(ddPct, 1);
  return { score, eligible: true };
}

const gridSchema = z
  .object({
    risk_per_trade_percent: z.array(z.number().min(0.01).max(20)).min(1).max(5).optional(),
    max_trade_size_percent: z.array(z.number().min(0.1).max(100)).min(1).max(5).optional(),
    max_open_positions: z.array(z.number().int().min(1).max(50)).min(1).max(5).optional(),
    hold_timeout_hours: z.array(z.number().int().min(1).max(168)).min(1).max(5).optional(),
  })
  .refine((g) => Object.values(g).some((v) => Array.isArray(v) && v.length > 0), {
    message: "Grid must vary at least one parameter",
  });

const MAX_COMBOS = 24;

type GridKey = "risk_per_trade_percent" | "max_trade_size_percent" | "max_open_positions" | "hold_timeout_hours";

const DEFAULTS: Record<GridKey, number> = {
  risk_per_trade_percent: 1,
  max_trade_size_percent: 10,
  max_open_positions: 5,
  hold_timeout_hours: 48,
};

function cartesianCombos(grid: Partial<Record<GridKey, number[]>>): Array<Record<GridKey, number>> {
  const keys: GridKey[] = ["risk_per_trade_percent", "max_trade_size_percent", "max_open_positions", "hold_timeout_hours"];
  const dims = keys.map((k) => (grid[k]?.length ? grid[k]! : [DEFAULTS[k]]));
  const out: Array<Record<GridKey, number>> = [];
  const rec = (i: number, acc: Partial<Record<GridKey, number>>) => {
    if (i === keys.length) { out.push(acc as Record<GridKey, number>); return; }
    for (const v of dims[i]) rec(i + 1, { ...acc, [keys[i]]: v });
  };
  rec(0, {});
  return out;
}

export const createRiskOptimization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(1).max(120),
      start_date: z.string(),
      end_date: z.string(),
      initial_balance: z.number().positive().max(10_000_000),
      fee_pct: z.number().min(0).max(1).default(0.05),
      channel_ids: z.array(z.string().uuid()).optional(),
      symbols: z.array(z.string()).optional(),
      grid: gridSchema,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (end <= start) throw new Error("end_date must be after start_date");
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (days > 90) throw new Error("Maximum range is 90 days");

    const combos = cartesianCombos(data.grid as Partial<Record<GridKey, number[]>>);
    if (combos.length > MAX_COMBOS) {
      throw new Error(`This grid produces ${combos.length} configurations, but the maximum is ${MAX_COMBOS} (~${MAX_COMBOS} minutes at 1 backtest/minute). Narrow the ranges and try again.`);
    }

    const baseConfig = {
      channel_ids: data.channel_ids ?? [],
      symbols: data.symbols ?? [],
    };

    const { data: optRow, error: optErr } = await context.supabase
      .from("risk_optimizer_runs")
      .insert({
        user_id: context.userId,
        name: data.name,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        initial_balance: data.initial_balance,
        fee_pct: data.fee_pct,
        config: baseConfig,
        grid: data.grid,
        objective: "return_over_drawdown",
        status: "queued",
        total_combos: combos.length,
      })
      .select("id")
      .single();
    if (optErr) throw new Error(optErr.message);

    const rows = combos.map((c, i) => ({
      user_id: context.userId,
      name: `${data.name} — combo ${i + 1}/${combos.length}`,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      initial_balance: data.initial_balance,
      fee_pct: data.fee_pct,
      config: { ...baseConfig, ...c },
      status: "queued",
      optimizer_run_id: optRow.id,
    }));
    const { error: btErr } = await context.supabase.from("backtest_runs").insert(rows);
    if (btErr) {
      await context.supabase.from("risk_optimizer_runs").delete().eq("id", optRow.id);
      throw new Error(btErr.message);
    }
    return { id: optRow.id, total_combos: combos.length };
  });

export const listRiskOptimizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("risk_optimizer_runs")
      .select("id, name, status, start_date, end_date, initial_balance, total_combos, completed_combos, best_backtest_run_id, error, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getRiskOptimization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [run, children] = await Promise.all([
      context.supabase.from("risk_optimizer_runs").select("*").eq("id", data.id).single(),
      context.supabase
        .from("backtest_runs")
        .select("id, name, status, progress, config, summary, error")
        .eq("optimizer_run_id", data.id)
        .order("created_at"),
    ]);
    if (run.error) throw new Error(run.error.message);
    return { run: run.data, children: children.data ?? [] };
  });

export const deleteRiskOptimization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("risk_optimizer_runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applyOptimizedConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ backtest_run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("backtest_runs")
      .select("id, user_id, config")
      .eq("id", data.backtest_run_id)
      .single();
    if (error) throw new Error(error.message);
    if (row.user_id !== context.userId) throw new Error("Forbidden");
    const cfg = (row.config ?? {}) as {
      risk_per_trade_percent?: number;
      max_trade_size_percent?: number;
      max_open_positions?: number;
    };
    const patch: {
      risk_per_trade_percent?: number;
      max_trade_size_percent?: number;
      max_open_positions?: number;
    } = {};
    if (typeof cfg.risk_per_trade_percent === "number") patch.risk_per_trade_percent = cfg.risk_per_trade_percent;
    if (typeof cfg.max_trade_size_percent === "number") patch.max_trade_size_percent = cfg.max_trade_size_percent;
    if (typeof cfg.max_open_positions === "number") patch.max_open_positions = cfg.max_open_positions;
    if (Object.keys(patch).length === 0) throw new Error("No applicable fields to apply");

    const { error: upErr } = await context.supabase
      .from("user_risk_settings")
      .update(patch)
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, applied: patch };
  });
