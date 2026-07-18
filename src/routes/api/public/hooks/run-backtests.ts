// Cron hook: runs queued backtests one at a time.
// Auth: requires CRON_SECRET in `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

async function finalizeOptimizerIfDone(optimizerRunId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { scoreBacktestSummary } = await import("@/lib/backtest.functions");

  // Race-safe: only finalize when there are no non-terminal children remaining.
  const { count: pending } = await supabaseAdmin
    .from("backtest_runs")
    .select("id", { count: "exact", head: true })
    .eq("optimizer_run_id", optimizerRunId)
    .in("status", ["queued", "running"]);

  // Bump completed_combos count (re-derive from DB to be race-safe).
  const { count: doneCount } = await supabaseAdmin
    .from("backtest_runs")
    .select("id", { count: "exact", head: true })
    .eq("optimizer_run_id", optimizerRunId)
    .in("status", ["completed", "failed"]);
  await supabaseAdmin
    .from("risk_optimizer_runs")
    .update({ completed_combos: doneCount ?? 0, status: "running" })
    .eq("id", optimizerRunId);

  if ((pending ?? 0) > 0) return;

  const { data: children } = await supabaseAdmin
    .from("backtest_runs")
    .select("id, status, config, summary, error")
    .eq("optimizer_run_id", optimizerRunId);

  type ChildRow = {
    id: string; status: string; config: unknown; summary: unknown; error: string | null;
  };
  const results = (children as ChildRow[] | null ?? []).map((c) => {
    if (c.status !== "completed") {
      return { backtest_run_id: c.id, config: c.config, summary: c.summary, score: null, eligible: false, error: c.error };
    }
    const { score, eligible } = scoreBacktestSummary(c.summary as { total_trades?: number; total_pnl_pct?: number; max_drawdown_pct?: number });
    return { backtest_run_id: c.id, config: c.config, summary: c.summary, score, eligible };
  });

  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const r of results) {
    if (r.eligible && r.score != null && r.score > bestScore) {
      bestScore = r.score;
      bestId = r.backtest_run_id;
    }
  }

  await supabaseAdmin
    .from("risk_optimizer_runs")
    .update({
      status: "completed",
      best_backtest_run_id: bestId,
      results: results as unknown as never,
      completed_at: new Date().toISOString(),
    })
    .eq("id", optimizerRunId);
}


export const Route = createFileRoute("/api/public/hooks/run-backtests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBacktest } = await import("@/lib/backtest/engine.server");
        type BTSignal = import("@/lib/backtest/engine.server").BTSignal;

        // Claim one queued run atomically.
        const { data: queued } = await supabaseAdmin
          .from("backtest_runs")
          .select("*")
          .eq("status", "queued")
          .order("created_at")
          .limit(1);

        if (!queued?.length) {
          return Response.json({ ran: 0 });
        }
        const run = queued[0] as {
          id: string;
          user_id: string;
          start_date: string;
          end_date: string;
          initial_balance: number;
          fee_pct: number;
          config: {
            channel_ids?: string[];
            symbols?: string[];
            risk_per_trade_percent?: number;
            max_trade_size_percent?: number;
            max_open_positions?: number;
            hold_timeout_hours?: number;
          };
          optimizer_run_id?: string | null;
        };

        const { error: claimErr } = await supabaseAdmin
          .from("backtest_runs")
          .update({ status: "running", started_at: new Date().toISOString(), progress: 0 })
          .eq("id", run.id)
          .eq("status", "queued");
        if (claimErr) return Response.json({ ran: 0, error: claimErr.message });

        try {
          // Pull historical signals for this user/period.
          let q = supabaseAdmin
            .from("signals")
            .select("id, symbol, side, entry_price, stop_loss, take_profit, leverage, created_at, source_id")
            .gte("created_at", run.start_date)
            .lte("created_at", run.end_date)
            .eq("status", "parsed")
            .order("created_at");

          if (run.config.channel_ids?.length) {
            q = q.in("source_id", run.config.channel_ids);
          }
          if (run.config.symbols?.length) {
            q = q.in("symbol", run.config.symbols.map((s) => s.toUpperCase()));
          }

          const { data: rawSignals, error: sigErr } = await q.limit(5000);
          if (sigErr) throw new Error(sigErr.message);

          const sigs: BTSignal[] = (rawSignals ?? [])
            .filter((r) => r.symbol && r.side && r.entry_price)
            .map((r) => ({
              id: r.id,
              symbol: r.symbol as string,
              side: (r.side as string).toLowerCase() === "short" ? "short" : "long",
              entry: Number(r.entry_price),
              stopLoss: r.stop_loss != null ? Number(r.stop_loss) : null,
              takeProfit: Array.isArray(r.take_profit)
                ? (r.take_profit as unknown[]).map((x) => Number(x)).filter((x) => Number.isFinite(x))
                : [],
              leverage: r.leverage != null ? Number(r.leverage) : null,
              ts: new Date(r.created_at as string).getTime(),
            }));

          const { trades, summary } = await runBacktest(
            sigs,
            {
              initial_balance: Number(run.initial_balance),
              fee_pct: Number(run.fee_pct),
              risk_per_trade_percent: run.config.risk_per_trade_percent,
              max_trade_size_percent: run.config.max_trade_size_percent,
              max_open_positions: run.config.max_open_positions,
              hold_timeout_hours: run.config.hold_timeout_hours,
            },
            async (pct) => {
              await supabaseAdmin.from("backtest_runs").update({ progress: pct }).eq("id", run.id);
            },
          );

          if (trades.length) {
            const rows = trades.map((t) => ({
              run_id: run.id,
              symbol: t.symbol,
              side: t.side,
              entry_time: new Date(t.entry_time).toISOString(),
              exit_time: t.exit_time ? new Date(t.exit_time).toISOString() : null,
              entry_price: t.entry_price,
              exit_price: t.exit_price,
              qty: t.qty,
              leverage: t.leverage,
              pnl: t.pnl,
              pnl_pct: t.pnl_pct,
              exit_reason: t.exit_reason,
              risk_snapshot: t.risk_snapshot as unknown as never,
            }));
            // Chunked insert to keep payloads small
            for (let i = 0; i < rows.length; i += 500) {
              await supabaseAdmin.from("backtest_trades").insert(rows.slice(i, i + 500));
            }
          }

          await supabaseAdmin
            .from("backtest_runs")
            .update({
              status: "completed",
              progress: 100,
              summary: summary as unknown as never,
              completed_at: new Date().toISOString(),
            })
            .eq("id", run.id);

          if (run.optimizer_run_id) await finalizeOptimizerIfDone(run.optimizer_run_id);
          return Response.json({ ran: 1, id: run.id, trades: trades.length });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin
            .from("backtest_runs")
            .update({
              status: "failed",
              error: msg.slice(0, 500),
              completed_at: new Date().toISOString(),
            })
            .eq("id", run.id);
          if (run.optimizer_run_id) await finalizeOptimizerIfDone(run.optimizer_run_id);
          return Response.json({ ran: 0, error: msg }, { status: 500 });
        }
      },
    },
  },
});
