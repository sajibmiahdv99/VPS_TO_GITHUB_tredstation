// Pure TS risk engine. No I/O; callers pass in everything required.
// Used by the ingest pipeline before enqueuing an order.

export type AssetClass = "BTC" | "ETH" | "ALT" | "STABLE" | "FOREX" | "INDEX" | "COMMODITY";

export interface SymbolRiskCap {
  symbol: string | null;       // exact pair like "BTCUSDT"
  asset_class: AssetClass | null;
  max_exposure_pct: number | null;   // % of balance
  max_open_positions: number | null;
  max_leverage: number | null;
  enabled: boolean;
}

/** Classify a symbol into an asset class. Cheap heuristic. */
export function classifySymbol(symbol: string): AssetClass {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC") || s.endsWith("BTC")) return "BTC";
  if (s.startsWith("ETH") || s.endsWith("ETH")) return "ETH";
  if (/^(USDT|USDC|DAI|TUSD|BUSD|FDUSD)/.test(s)) return "STABLE";
  if (/^(EUR|GBP|JPY|AUD|CAD|CHF|NZD|USD)(USD|EUR|GBP|JPY)?$/.test(s)) return "FOREX";
  if (/^(XAU|XAG|WTI|BRENT|OIL|GOLD|SILVER)/.test(s)) return "COMMODITY";
  if (/^(SPX|NDX|DJI|US30|NAS100|SPX500)/.test(s)) return "INDEX";
  return "ALT";
}

export interface RiskInputs {
  balance: number; // user's account balance (USDT)
  side: "long" | "short";
  entry: number;
  stopLoss: number | null;
  leverage: number | null;
  symbol?: string;
  settings: {
    risk_per_trade_percent: number | null;
    max_trade_size_percent: number | null;
    max_open_positions: number | null;
    daily_loss_limit_percent: number | null;
    max_drawdown_percent: number | null;
    cooldown_minutes_after_loss: number | null;
    auto_stop_after_losses: number | null;
  };
  context: {
    openPositions: number;
    dailyLossPercent: number;
    drawdownPercent: number;
    consecutiveLosses: number;
    minutesSinceLastLoss: number | null;
    isBlocked: boolean;
    /** Currently open positions grouped by symbol. */
    openBySymbol?: Record<string, number>;
    /** Current notional exposure per symbol in USDT. */
    exposureBySymbol?: Record<string, number>;
  };
  /** Per-symbol / per-asset-class caps applicable to the user. */
  symbolCaps?: SymbolRiskCap[];
}

export interface RiskDecision {
  allow: boolean;
  reason?: string;
  quantity: number; // sized in base currency units
  notional: number;
  leverage: number;
  adaptiveMultiplier?: number; // applied scaling factor (1 = neutral)
  effectiveRiskPercent?: number;
  appliedSymbolCap?: { scope: "symbol" | "asset_class"; key: string } | null;
}

/** Find caps matching a symbol — exact match first, then asset class. */
function matchingCaps(symbol: string | undefined, caps: SymbolRiskCap[] | undefined): SymbolRiskCap[] {
  if (!symbol || !caps?.length) return [];
  const cls = classifySymbol(symbol);
  return caps.filter((c) => c.enabled && (
    (c.symbol && c.symbol.toUpperCase() === symbol.toUpperCase()) ||
    (c.asset_class && c.asset_class === cls)
  ));
}


/**
 * Adaptive risk multiplier based on recent performance.
 * - Penalises consecutive losses (each loss → -15%, floor 0.25x)
 * - Rewards a hot streak (≥3 consecutive wins → +20%, cap 1.5x)
 * - Scales by recent win-rate (linear from 0.6x @ 30% → 1.3x @ 70%)
 */
export function adaptiveRiskMultiplier(ctx: {
  consecutiveLosses: number;
  consecutiveWins: number;
  recentWinRate: number | null; // 0..1 over last N closed trades
}): number {
  let m = 1;
  if (ctx.consecutiveLosses > 0) m *= Math.max(0.25, 1 - 0.15 * ctx.consecutiveLosses);
  if (ctx.consecutiveWins >= 3) m *= Math.min(1.5, 1 + 0.1 * (ctx.consecutiveWins - 2));
  if (ctx.recentWinRate != null) {
    const wr = Math.max(0, Math.min(1, ctx.recentWinRate));
    // 0.3 → 0.6x, 0.5 → 1.0x, 0.7 → 1.3x
    const wrFactor = 1 + (wr - 0.5) * 1.5;
    m *= Math.max(0.5, Math.min(1.4, wrFactor));
  }
  return Math.max(0.2, Math.min(1.6, m));
}

export function evaluateRisk(
  input: RiskInputs & { context: RiskInputs["context"] & { consecutiveWins?: number; recentWinRate?: number | null } },
): RiskDecision {
  const s = input.settings;
  const c = input.context;

  if (c.isBlocked) return reject("user is in a trade-block window");
  if (s.max_open_positions != null && c.openPositions >= s.max_open_positions)
    return reject("max open positions reached");
  if (s.daily_loss_limit_percent != null && c.dailyLossPercent >= s.daily_loss_limit_percent)
    return reject("daily loss limit hit");
  if (s.max_drawdown_percent != null && c.drawdownPercent >= s.max_drawdown_percent)
    return reject("max drawdown breached");
  if (
    s.auto_stop_after_losses != null &&
    c.consecutiveLosses >= s.auto_stop_after_losses
  )
    return reject("consecutive-loss auto-stop active");
  if (
    s.cooldown_minutes_after_loss != null &&
    c.minutesSinceLastLoss != null &&
    c.minutesSinceLastLoss < s.cooldown_minutes_after_loss
  )
    return reject("cooldown after loss");

  // Per-symbol / per-asset-class pre-checks (open-positions & leverage caps)
  const caps = matchingCaps(input.symbol, input.symbolCaps);
  let appliedCap: RiskDecision["appliedSymbolCap"] = null;
  const sym = input.symbol?.toUpperCase();
  const openSym = sym ? (c.openBySymbol?.[sym] ?? 0) : 0;
  for (const cap of caps) {
    if (cap.max_open_positions != null && openSym >= cap.max_open_positions) {
      return reject(`max open positions reached for ${cap.symbol ?? cap.asset_class}`);
    }
  }

  const baseRiskPct = (s.risk_per_trade_percent ?? 1) / 100;
  const multiplier = adaptiveRiskMultiplier({
    consecutiveLosses: c.consecutiveLosses,
    consecutiveWins: c.consecutiveWins ?? 0,
    recentWinRate: c.recentWinRate ?? null,
  });
  const riskPct = baseRiskPct * multiplier;
  const maxSizePct = (s.max_trade_size_percent ?? 10) / 100;
  let leverage = Math.max(1, input.leverage ?? 1);
  for (const cap of caps) {
    if (cap.max_leverage != null && leverage > cap.max_leverage) {
      leverage = cap.max_leverage;
      appliedCap = { scope: cap.symbol ? "symbol" : "asset_class", key: (cap.symbol ?? cap.asset_class)! };
    }
  }

  let notional: number;
  if (input.stopLoss != null && input.stopLoss > 0) {
    const riskPerUnit = Math.abs(input.entry - input.stopLoss);
    if (riskPerUnit === 0) return reject("invalid stop loss");
    const riskUsd = input.balance * riskPct;
    const qty = riskUsd / riskPerUnit;
    notional = qty * input.entry;
  } else {
    notional = input.balance * riskPct * leverage;
  }

  const cap = input.balance * maxSizePct * leverage;
  notional = Math.min(notional, cap);

  // Per-symbol / per-asset-class exposure cap (applied AFTER global cap)
  const currentExposure = sym ? (c.exposureBySymbol?.[sym] ?? 0) : 0;
  for (const sc of caps) {
    if (sc.max_exposure_pct != null) {
      const allowed = input.balance * (sc.max_exposure_pct / 100);
      const remaining = Math.max(0, allowed - currentExposure);
      if (notional > remaining) {
        notional = remaining;
        appliedCap = { scope: sc.symbol ? "symbol" : "asset_class", key: (sc.symbol ?? sc.asset_class)! };
      }
    }
  }

  if (notional <= 0) return reject("computed size <= 0 (symbol cap exhausted)");

  const quantity = notional / input.entry;
  return {
    allow: true,
    quantity,
    notional,
    leverage,
    adaptiveMultiplier: multiplier,
    effectiveRiskPercent: riskPct * 100,
    appliedSymbolCap: appliedCap,
  };
}

function reject(reason: string): RiskDecision {
  return { allow: false, reason, quantity: 0, notional: 0, leverage: 1 };
}

