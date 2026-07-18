// Server-only helper: load adaptive risk context for a user from recent orders.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdaptiveContext {
  consecutiveLosses: number;
  consecutiveWins: number;
  recentWinRate: number | null;
  dailyLossPercent: number;
  drawdownPercent: number;
  minutesSinceLastLoss: number | null;
}

/**
 * Pulls recent closed orders for the user and derives streaks + win-rate
 * + day PnL %. Cheap (single query, 50-row window).
 */
export async function loadAdaptiveContext(
  supabase: SupabaseClient,
  userId: string,
  balance: number,
): Promise<AdaptiveContext> {
  const { data: closed } = await supabase
    .from("orders")
    .select("pnl, updated_at, status")
    .eq("user_id", userId)
    .in("status", ["closed", "filled"])
    .not("pnl", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  const rows = (closed ?? []) as Array<{ pnl: number | null; updated_at: string }>;

  // Streaks from most recent backwards
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  for (const r of rows) {
    const p = Number(r.pnl ?? 0);
    if (p < 0) {
      if (consecutiveWins > 0) break;
      consecutiveLosses++;
    } else if (p > 0) {
      if (consecutiveLosses > 0) break;
      consecutiveWins++;
    } else {
      break;
    }
  }

  // Recent win-rate over last 20 closed
  const window = rows.slice(0, 20);
  const wins = window.filter((r) => Number(r.pnl ?? 0) > 0).length;
  const recentWinRate = window.length >= 5 ? wins / window.length : null;

  // Day PnL %
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayPnl = rows
    .filter((r) => new Date(r.updated_at) >= dayStart)
    .reduce((s, r) => s + Number(r.pnl ?? 0), 0);
  const dailyLossPercent = balance > 0 && todayPnl < 0 ? (Math.abs(todayPnl) / balance) * 100 : 0;

  // Rough drawdown: worst cumulative dip over last 50
  let peak = 0;
  let cum = 0;
  let maxDD = 0;
  for (const r of [...rows].reverse()) {
    cum += Number(r.pnl ?? 0);
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  const drawdownPercent = balance > 0 ? (maxDD / balance) * 100 : 0;

  // Minutes since last loss
  const lastLoss = rows.find((r) => Number(r.pnl ?? 0) < 0);
  const minutesSinceLastLoss = lastLoss
    ? Math.floor((Date.now() - new Date(lastLoss.updated_at).getTime()) / 60000)
    : null;

  return {
    consecutiveLosses,
    consecutiveWins,
    recentWinRate,
    dailyLossPercent,
    drawdownPercent,
    minutesSinceLastLoss,
  };
}
