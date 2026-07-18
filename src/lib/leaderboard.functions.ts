import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LeaderboardRow = {
  sourceId: string;
  name: string;
  code: string;
  winRate: number | null;
  trades: number;
  realizedPnl: number;
  qualityScore: number;
  status: string;
};

/**
 * Marketplace leaderboard: score sources by win rate, sample size, and realized PnL.
 * Joins orders → signals.source_id.
 */
export const getLeaderboard = createServerFn({ method: "GET" }).handler(async (): Promise<LeaderboardRow[]> => {
  const { data: sources, error } = await supabaseAdmin
    .from("signal_sources")
    .select("id,name,code,win_rate,status")
    .in("status", ["active", "paused"])
    .order("win_rate", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  // Batch: signals per source
  const sourceIds = (sources ?? []).map((s) => s.id);
  const signalToSource = new Map<string, string>();
  if (sourceIds.length) {
    const { data: sigs } = await supabaseAdmin
      .from("signals")
      .select("id,source_id")
      .in("source_id", sourceIds)
      .limit(5000);
    for (const s of sigs ?? []) {
      if (s.source_id) signalToSource.set(s.id, s.source_id);
    }
  }

  const signalIds = Array.from(signalToSource.keys());
  const bySource = new Map<string, { trades: number; pnl: number; wins: number }>();
  for (const id of sourceIds) bySource.set(id, { trades: 0, pnl: 0, wins: 0 });

  if (signalIds.length) {
    // chunk to avoid huge IN lists
    const chunk = 200;
    for (let i = 0; i < signalIds.length; i += chunk) {
      const slice = signalIds.slice(i, i + chunk);
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("signal_id,pnl,status")
        .in("signal_id", slice)
        .in("status", ["filled", "closed", "FILLED", "CLOSED"]);
      for (const o of orders ?? []) {
        const sid = o.signal_id ? signalToSource.get(o.signal_id) : null;
        if (!sid) continue;
        const row = bySource.get(sid);
        if (!row) continue;
        row.trades += 1;
        const p = Number(o.pnl ?? 0);
        row.pnl += p;
        if (p > 0) row.wins += 1;
      }
    }
  }

  const rows: LeaderboardRow[] = (sources ?? []).map((s) => {
    const stats = bySource.get(s.id) ?? { trades: 0, pnl: 0, wins: 0 };
    const winRate =
      s.win_rate != null
        ? Number(s.win_rate)
        : stats.trades
          ? (stats.wins / stats.trades) * 100
          : null;
    const sampleScore = Math.min(100, (Math.log10(stats.trades + 1) / 3) * 100);
    const wrScore = winRate != null ? Math.max(0, Math.min(100, winRate)) : 40;
    const pnlScore =
      stats.pnl <= 0 ? Math.max(0, 50 + stats.pnl / 100) : Math.min(100, 50 + stats.pnl / 50);
    const qualityScore = Math.round(
      wrScore * 0.4 + sampleScore * 0.3 + Math.max(0, Math.min(100, pnlScore)) * 0.3,
    );
    return {
      sourceId: s.id,
      name: s.name,
      code: s.code,
      winRate,
      trades: stats.trades,
      realizedPnl: Math.round(stats.pnl * 100) / 100,
      qualityScore,
      status: s.status,
    };
  });

  rows.sort((a, b) => b.qualityScore - a.qualityScore || b.trades - a.trades);
  return rows.slice(0, 50);
});
