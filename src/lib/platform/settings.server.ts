// Platform settings + feature flags. Server-only.
// Resolution: process.env overrides for bootstrap, then platform_settings table.

import { adminDb } from "./db.server";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

const DEFAULTS: Record<string, Json> = {
  "payments.enabled_providers": ["nowpayments", "manual_usdt"],
  "payments.stripe_enabled": false,
  "payments.paddle_enabled": false,
  "payments.manual_usdt": {
    network: "TRC20",
    address: "",
    memo_required: false,
  },
  "features.kyc_required": false,
  "features.marketplace": true,
  "features.oauth_exchange": false,
  "features.mt5_bridge": true,
  "features.dex_bridge": true,
  "features.email_notifications": true,
  "features.telegram_notifications": true,
  "features.public_stats": true,
  "features.onboarding": true,
  "features.leaderboard": true,
  "features.affiliate": true,
  "features.backtest": true,
  "features.heatmap": true,
  "features.risk_optimizer": true,
  "features.paper_trading": true,
  "features.signup_open": true,
  "features.maintenance_mode": false,
  "trading.global_pause": false,
  "trading.max_leverage_cap": 20,
  "trading.default_paper": true,
  "ai.parser_enabled": true,
  "ai.gateway_url": "",
  "ai.model": "",
  "affiliate.rates": [0.3, 0.1, 0.05, 0.02, 0.01, 0.005, 0.005],
  "affiliate.rank_bonus_be": 0.02,
  "affiliate.rank_bonus_sbe": 0.01,
  "features.signal_quality_gate": true,
  "signal_quality.min_score": 25,
  "signal_quality.min_sample": 10,
  "brand.support_email": "",
  "brand.telegram_support": "",
  "brand.twitter": "",
  "rate_limit.webhook_per_min": 60,
  "rate_limit.payment_per_min": 30,
  "email.subject_prefix": "AGENT TRED",
};

/** Human labels for control panel */
export const SETTING_META: Record<
  string,
  { label: string; description: string; type: "boolean" | "number" | "string" | "json" | "rates" }
> = {
  "trading.global_pause": {
    label: "Global trading pause",
    description: "Blocks all new order fan-out from signals",
    type: "boolean",
  },
  "features.maintenance_mode": {
    label: "Maintenance mode",
    description: "Show maintenance banner; soft-block trading UI",
    type: "boolean",
  },
  "features.signup_open": {
    label: "Open signups",
    description: "Allow new user registration",
    type: "boolean",
  },
  "ai.parser_enabled": {
    label: "AI signal parser",
    description: "OpenAI-compatible fallback when rules fail",
    type: "boolean",
  },
  "features.marketplace": {
    label: "Marketplace",
    description: "Copy-trading marketplace",
    type: "boolean",
  },
  "features.email_notifications": {
    label: "Email notifications",
    description: "Dispatch via Resend when configured",
    type: "boolean",
  },
  "features.telegram_notifications": {
    label: "Telegram notifications",
    description: "Dispatch via bot token when configured",
    type: "boolean",
  },
  "features.kyc_required": {
    label: "KYC required",
    description: "Require verification before live trading",
    type: "boolean",
  },
  "features.oauth_exchange": {
    label: "Exchange OAuth",
    description: "Show OAuth connect for supported CEXes",
    type: "boolean",
  },
  "features.mt5_bridge": {
    label: "MT5 bridge option",
    description: "Show MetaTrader 5 bridge in exchanges",
    type: "boolean",
  },
  "features.dex_bridge": {
    label: "DEX bridge option",
    description: "Show DEX wallet bridge in exchanges",
    type: "boolean",
  },
  "features.signal_quality_gate": {
    label: "Signal quality gate",
    description: "Auto-mute low-scoring sources",
    type: "boolean",
  },
  "features.public_stats": {
    label: "Public landing stats",
    description: "Show live counts on home page",
    type: "boolean",
  },
  "features.onboarding": {
    label: "Onboarding wizard",
    description: "Show setup checklist for new users",
    type: "boolean",
  },
  "features.leaderboard": {
    label: "Leaderboard",
    description: "Source quality leaderboard",
    type: "boolean",
  },
  "features.affiliate": {
    label: "Affiliate program",
    description: "Referral links and commissions",
    type: "boolean",
  },
  "features.backtest": {
    label: "Backtesting",
    description: "Historical strategy replay",
    type: "boolean",
  },
  "features.heatmap": {
    label: "Heatmap",
    description: "Symbol exposure heatmap",
    type: "boolean",
  },
  "features.risk_optimizer": {
    label: "Risk optimizer",
    description: "AI risk config suggestions",
    type: "boolean",
  },
  "features.paper_trading": {
    label: "Paper trading",
    description: "Allow paper execution mode",
    type: "boolean",
  },
  "payments.stripe_enabled": {
    label: "Show Stripe",
    description: "Enable Stripe in billing UI",
    type: "boolean",
  },
  "payments.paddle_enabled": {
    label: "Show Paddle",
    description: "Enable Paddle in billing UI",
    type: "boolean",
  },
  "trading.default_paper": {
    label: "Default paper mode",
    description: "New exchange accounts start in paper",
    type: "boolean",
  },
  "trading.max_leverage_cap": {
    label: "Max leverage cap",
    description: "Platform-wide max leverage",
    type: "number",
  },
  "signal_quality.min_score": {
    label: "Min quality score",
    description: "Auto-mute below this score",
    type: "number",
  },
  "signal_quality.min_sample": {
    label: "Min sample size",
    description: "Trades needed before quality mute",
    type: "number",
  },
  "rate_limit.webhook_per_min": {
    label: "Webhook rate limit / min",
    description: "Per-IP public webhook limit",
    type: "number",
  },
  "rate_limit.payment_per_min": {
    label: "Payment webhook rate / min",
    description: "Per-IP payment IPN limit",
    type: "number",
  },
  "brand.support_email": {
    label: "Support email",
    description: "Shown to users",
    type: "string",
  },
  "brand.telegram_support": {
    label: "Support Telegram",
    description: "e.g. @your_support",
    type: "string",
  },
  "brand.twitter": {
    label: "Twitter / X",
    description: "Public social link",
    type: "string",
  },
  "ai.model": {
    label: "AI model",
    description: "Default model id (override secret vault)",
    type: "string",
  },
  "ai.gateway_url": {
    label: "AI gateway URL",
    description: "Completions endpoint",
    type: "string",
  },
  "email.subject_prefix": {
    label: "Email subject prefix",
    description: "Bracket tag in subjects",
    type: "string",
  },
  "affiliate.rates": {
    label: "Affiliate generation rates",
    description: "Array of 7 rates (G1–G7)",
    type: "rates",
  },
};

let cache: { at: number; map: Map<string, Json> } | null = null;
const TTL_MS = 5_000;

export async function getSetting<T = Json>(key: string, fallback?: T): Promise<T> {
  const map = await loadAllSettings();
  if (map.has(key)) return map.get(key) as T;
  if (key in DEFAULTS) return DEFAULTS[key] as T;
  return fallback as T;
}

export async function getAllSettings(): Promise<Record<string, Json>> {
  const map = await loadAllSettings();
  const out: Record<string, Json> = { ...DEFAULTS };
  for (const [k, v] of map) out[k] = v;
  return out;
}

async function loadAllSettings(): Promise<Map<string, Json>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = new Map<string, Json>();
  try {
    const { data, error } = await adminDb.from("platform_settings").select("key,value");
    if (error) {
      console.warn("[platform_settings]", error.message);
    } else {
      for (const row of data ?? []) {
        map.set(row.key, row.value);
      }
    }
  } catch (e) {
    console.warn("[platform_settings] load failed", e);
  }
  cache = { at: Date.now(), map };
  return map;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function upsertSetting(key: string, value: Json, updatedBy?: string): Promise<void> {
  const { error } = await adminDb.from("platform_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
  invalidateSettingsCache();
}

export async function isTradingGloballyPaused(): Promise<boolean> {
  return Boolean(await getSetting("trading.global_pause", false));
}

export async function getEnabledPaymentProviders(): Promise<string[]> {
  const list = await getSetting<string[]>("payments.enabled_providers", ["nowpayments", "manual_usdt"]);
  const stripe = await getSetting<boolean>("payments.stripe_enabled", false);
  const paddle = await getSetting<boolean>("payments.paddle_enabled", false);
  const out = new Set((list ?? []).filter((x) => x !== "stripe" && x !== "paddle"));
  if (stripe) out.add("stripe");
  if (paddle) out.add("paddle");
  return Array.from(out);
}
