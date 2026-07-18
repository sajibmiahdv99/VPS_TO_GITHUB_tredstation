// Backtest simulator. Pure TS, Worker-safe.
// Walks historical candles and simulates entry → TP/SL/trail/timeout exits.

import { evaluateRisk } from "@/lib/risk/riskEngine";
import { fetchCandles, intervalForRange, type Candle, type Interval } from "./historicalData.server";

export type BTSignal = {
  id?: string;
  symbol: string;          // e.g. BTCUSDT
  side: "long" | "short";
  entry: number;
  stopLoss: number | null;
  takeProfit: number[];    // ladder
  leverage: number | null;
  ts: number;              // signal time in ms
};

export type BTTrade = {
  signalId?: string;
  symbol: string;
  side: "long" | "short";
  entry_time: number;
  exit_time: number | null;
  entry_price: number;
  exit_price: number | null;
  qty: number;
  leverage: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: "tp1" | "tp2" | "tp3" | "sl" | "timeout" | "rejected";
  risk_snapshot: Record<string, unknown>;
};

export type BTSummary = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_pct: number;
  max_drawdown_pct: number;
  profit_factor: number;
  ending_balance: number;
  equity_curve: { t: number; balance: number }[];
};

export type BTConfig = {
  initial_balance: number;
  fee_pct: number;             // per side, %
  risk_per_trade_percent?: number;
  max_trade_size_percent?: number;
  max_open_positions?: number;
  hold_timeout_hours?: number; // close after N hours if neither TP nor SL hit
};

/** Walk candles to find which level hit first. */
function resolveExit(
  candles: Candle[],
  startIdx: number,
  side: "long" | "short",
  entry: number,
  sl: number | null,
  tps: number[],
  timeoutAt: number,
): { idx: number; price: number; reason: BTTrade["exit_reason"] } {
  for (let i = startIdx; i < candles.length; i++) {
    const k = candles[i];
    if (k.t > timeoutAt) return { idx: i, price: k.o, reason: "timeout" };

    if (side === "long") {
      // Conservative: if both SL and TP within same candle, assume SL first.
      if (sl != null && k.l <= sl) return { idx: i, price: sl, reason: "sl" };
      for (let t = 0; t < tps.length; t++) {
        if (k.h >= tps[t]) {
          const reason = (t === 0 ? "tp1" : t === 1 ? "tp2" : "tp3") as BTTrade["exit_reason"];
          return { idx: i, price: tps[t], reason };
        }
      }
    } else {
      if (sl != null && k.h >= sl) return { idx: i, price: sl, reason: "sl" };
      for (let t = 0; t < tps.length; t++) {
        if (k.l <= tps[t]) {
          const reason = (t === 0 ? "tp1" : t === 1 ? "tp2" : "tp3") as BTTrade["exit_reason"];
          return { idx: i, price: tps[t], reason };
        }
      }
    }
  }
  const last = candles[candles.length - 1];
  return { idx: candles.length - 1, price: last.c, reason: "timeout" };
}

export async function runBacktest(
  signals: BTSignal[],
  config: BTConfig,
  onProgress?: (pct: number) => Promise<void> | void,
): Promise<{ trades: BTTrade[]; summary: BTSummary }> {
  const trades: BTTrade[] = [];
  let balance = config.initial_balance;
  let peak = balance;
  let maxDD = 0;
  const equity: { t: number; balance: number }[] = [{ t: signals[0]?.ts ?? Date.now(), balance }];

  // Sort signals chronologically
  const sigs = [...signals].sort((a, b) => a.ts - b.ts);
  if (!sigs.length) {
    return {
      trades,
      summary: emptySummary(balance),
    };
  }

  const rangeStart = sigs[0].ts;
  const rangeEnd = sigs[sigs.length - 1].ts + (config.hold_timeout_hours ?? 24) * 3_600_000;
  const days = (rangeEnd - rangeStart) / 86_400_000;
  const interval: Interval = intervalForRange(days);

  // Track open positions count for risk engine context
  let openPositions = 0;
  let consecutiveLosses = 0;
  let consecutiveWins = 0;
  const recent: boolean[] = []; // true=win

  for (let i = 0; i < sigs.length; i++) {
    const sig = sigs[i];
    const recentWinRate = recent.length >= 5 ? recent.slice(-20).filter(Boolean).length / Math.min(recent.length, 20) : null;

    const decision = evaluateRisk({
      balance,
      side: sig.side,
      entry: sig.entry,
      stopLoss: sig.stopLoss,
      leverage: sig.leverage,
      symbol: sig.symbol,
      settings: {
        risk_per_trade_percent: config.risk_per_trade_percent ?? 1,
        max_trade_size_percent: config.max_trade_size_percent ?? 10,
        max_open_positions: config.max_open_positions ?? 5,
        daily_loss_limit_percent: null,
        max_drawdown_percent: null,
        cooldown_minutes_after_loss: null,
        auto_stop_after_losses: null,
      },
      context: {
        openPositions,
        dailyLossPercent: 0,
        drawdownPercent: maxDD,
        consecutiveLosses,
        minutesSinceLastLoss: null,
        isBlocked: false,
        consecutiveWins,
        recentWinRate,
      },
    });

    if (!decision.allow) {
      trades.push({
        signalId: sig.id,
        symbol: sig.symbol,
        side: sig.side,
        entry_time: sig.ts,
        exit_time: null,
        entry_price: sig.entry,
        exit_price: null,
        qty: 0,
        leverage: 1,
        pnl: 0,
        pnl_pct: 0,
        exit_reason: "rejected",
        risk_snapshot: { reason: decision.reason },
      });
      continue;
    }

    // Fetch candles from signal time forward
    const winEnd = sig.ts + (config.hold_timeout_hours ?? 24) * 3_600_000;
    let candles: Candle[];
    try {
      candles = await fetchCandles(sig.symbol, interval, sig.ts, winEnd);
    } catch (e) {
      trades.push({
        signalId: sig.id,
        symbol: sig.symbol,
        side: sig.side,
        entry_time: sig.ts,
        exit_time: null,
        entry_price: sig.entry,
        exit_price: null,
        qty: 0,
        leverage: 1,
        pnl: 0,
        pnl_pct: 0,
        exit_reason: "rejected",
        risk_snapshot: { reason: e instanceof Error ? e.message : "data fetch failed" },
      });
      continue;
    }
    if (!candles.length) {
      trades.push({
        signalId: sig.id,
        symbol: sig.symbol,
        side: sig.side,
        entry_time: sig.ts,
        exit_time: null,
        entry_price: sig.entry,
        exit_price: null,
        qty: 0,
        leverage: 1,
        pnl: 0,
        pnl_pct: 0,
        exit_reason: "rejected",
        risk_snapshot: { reason: "no candle data" },
      });
      continue;
    }

    const exit = resolveExit(
      candles,
      0,
      sig.side,
      sig.entry,
      sig.stopLoss,
      sig.takeProfit,
      winEnd,
    );

    const fee = (config.fee_pct / 100) * decision.notional * 2; // entry + exit
    const direction = sig.side === "long" ? 1 : -1;
    const grossPnl = (exit.price - sig.entry) * direction * decision.quantity;
    const pnl = grossPnl - fee;
    const pnlPct = (pnl / balance) * 100;
    balance += pnl;
    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > maxDD) maxDD = dd;

    const win = pnl > 0;
    recent.push(win);
    if (win) {
      consecutiveWins++;
      consecutiveLosses = 0;
    } else {
      consecutiveLosses++;
      consecutiveWins = 0;
    }

    trades.push({
      signalId: sig.id,
      symbol: sig.symbol,
      side: sig.side,
      entry_time: sig.ts,
      exit_time: candles[exit.idx].t,
      entry_price: sig.entry,
      exit_price: exit.price,
      qty: decision.quantity,
      leverage: decision.leverage,
      pnl,
      pnl_pct: pnlPct,
      exit_reason: exit.reason,
      risk_snapshot: {
        notional: decision.notional,
        adaptive: decision.adaptiveMultiplier,
        effective_risk_pct: decision.effectiveRiskPercent,
      },
    });
    equity.push({ t: candles[exit.idx].t, balance });

    if (onProgress && (i % 5 === 0 || i === sigs.length - 1)) {
      await onProgress(Math.round(((i + 1) / sigs.length) * 100));
    }
  }

  const closed = trades.filter((t) => t.exit_reason !== "rejected");
  const wins = closed.filter((t) => t.pnl > 0).length;
  const losses = closed.filter((t) => t.pnl <= 0).length;
  const grossWin = closed.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(closed.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const totalPnl = balance - config.initial_balance;

  const summary: BTSummary = {
    total_trades: closed.length,
    wins,
    losses,
    win_rate: closed.length ? wins / closed.length : 0,
    total_pnl: totalPnl,
    total_pnl_pct: (totalPnl / config.initial_balance) * 100,
    max_drawdown_pct: maxDD,
    profit_factor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    ending_balance: balance,
    equity_curve: equity,
  };

  return { trades, summary };
}

function emptySummary(balance: number): BTSummary {
  return {
    total_trades: 0, wins: 0, losses: 0, win_rate: 0,
    total_pnl: 0, total_pnl_pct: 0, max_drawdown_pct: 0,
    profit_factor: 0, ending_balance: balance,
    equity_curve: [{ t: Date.now(), balance }],
  };
}
