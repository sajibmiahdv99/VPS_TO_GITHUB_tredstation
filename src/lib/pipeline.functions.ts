// Ingest pipeline: raw signal text -> parsed signals row -> risk check
// per subscriber -> queued orders rows. Called from the Telegram webhook
// and exposed manually for admins/testing via runIngestForText.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSignal, PARSER_VERSION, type ParsedSignal } from "@/lib/parser/signalParser";
import { evaluateRisk } from "@/lib/risk/riskEngine";

// ============ Entry ladder helper ============
// Pure function. Splits a risk-sized quantity across N limit entries stepping
// away from the signal price. Returns a single-level result for the default
// "single" mode so behaviour is byte-identical to the pre-ladder pipeline.
export type EntryLadderMode = "single" | "scale_in";
export type EntryLadderDistribution = "equal" | "front_loaded" | "back_loaded";

export function buildEntryLadder(params: {
  entry: number;
  side: "long" | "short";
  totalQty: number;
  mode: EntryLadderMode | string | null | undefined;
  levels: number | null | undefined;
  rangePercent: number | null | undefined;
  distribution: EntryLadderDistribution | string | null | undefined;
}): Array<{ price: number; qty: number }> {
  const { entry, side, totalQty } = params;
  const single = [{ price: entry, qty: totalQty }];
  const levels = Math.floor(Number(params.levels ?? 1));
  const rangePct = params.rangePercent == null ? null : Number(params.rangePercent);
  if (
    params.mode !== "scale_in" ||
    levels <= 1 ||
    rangePct == null ||
    !Number.isFinite(rangePct) ||
    rangePct <= 0 ||
    !Number.isFinite(entry) ||
    entry <= 0 ||
    totalQty <= 0
  ) {
    return single;
  }

  const dir = side === "long" ? -1 : 1;
  const far = entry * (1 + (dir * rangePct) / 100);
  const step = (far - entry) / (levels - 1);

  // Weights per level (level 0 = nearest to entry).
  const weights: number[] = [];
  if (params.distribution === "front_loaded") {
    for (let i = 0; i < levels; i++) weights.push(levels - i);
  } else if (params.distribution === "back_loaded") {
    for (let i = 0; i < levels; i++) weights.push(i + 1);
  } else {
    for (let i = 0; i < levels; i++) weights.push(1);
  }
  const wSum = weights.reduce((a, b) => a + b, 0);
  if (wSum <= 0) return single;

  const out: Array<{ price: number; qty: number }> = [];
  let allocated = 0;
  for (let i = 0; i < levels; i++) {
    const price = entry + step * i;
    if (!Number.isFinite(price) || price <= 0) return single;
    let qty: number;
    if (i === levels - 1) {
      qty = totalQty - allocated; // absorb rounding drift
    } else {
      qty = (totalQty * weights[i]) / wSum;
      allocated += qty;
    }
    if (!Number.isFinite(qty) || qty <= 0) return single;
    out.push({ price, qty });
  }
  return out;
}

// Shared subscriber fan-out. Given an already-inserted signal row and a
// non-null sourceId, load subscribers whose user_risk_settings allow this
// source, run the per-subscriber risk check, and queue orders. Behavior is
// copied verbatim from the original inline fan-out inside
// ingestSignalForSource — no sizing/leverage/SL-TP changes.
export async function fanOutToSubscribers(params: {
  signalId: string;
  parsed: ParsedSignal;
  sourceId: string;
  excludeUserId?: string;
}): Promise<{ queued: number; rejected: number }> {
  const { signalId, parsed, sourceId, excludeUserId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!parsed.symbol || !parsed.side || parsed.entry == null) {
    return { queued: 0, rejected: 0 };
  }

  // Platform-wide kill switch (Admin Control Center)
  try {
    const { isTradingGloballyPaused } = await import("@/lib/platform/settings.server");
    if (await isTradingGloballyPaused()) {
      return { queued: 0, rejected: 0 };
    }
  } catch {
    /* settings table may not exist yet */
  }

  // Ultimate: auto-mute low-quality signal sources
  try {
    const { shouldMuteSource } = await import("@/lib/signalQuality.server");
    if (await shouldMuteSource(sourceId)) {
      return { queued: 0, rejected: 0 };
    }
  } catch {
    /* quality gate optional */
  }

  // Find subscribers that allow this source. Filter in SQL to avoid loading every user.
  let subQuery = supabaseAdmin
    .from("user_risk_settings")
    .select("*")
    .or("auto_trade_enabled.is.null,auto_trade_enabled.eq.true");
  subQuery = subQuery.or(`allowed_source_ids.is.null,allowed_source_ids.cs.{${sourceId}}`);
  const { data: settings } = await subQuery;

  // Load source plan gate
  const { data: sourceRow } = await supabaseAdmin
    .from("signal_sources")
    .select("id,plan_minimum,status")
    .eq("id", sourceId)
    .maybeSingle();
  if (sourceRow && sourceRow.status !== "active") {
    return { queued: 0, rejected: 0 };
  }
  const planMinimum = sourceRow?.plan_minimum ?? null;

  // Batch per-user lookups into maps.
  const userIds = (settings ?? []).map((s) => s.user_id);
  const balanceMap = new Map<string, number>();
  const openCountMap = new Map<string, number>();
  const blockMap = new Map<string, string>();
  const planOk = new Map<string, boolean>();
  if (userIds.length > 0) {
    const [{ data: balRows }, { data: orderRows }, { data: blockRows }] = await Promise.all([
      supabaseAdmin.from("user_balances").select("user_id,available_balance").in("user_id", userIds),
      supabaseAdmin
        .from("orders")
        .select("id,user_id")
        .in("user_id", userIds)
        .in("status", ["queued", "open", "filled"]),
      supabaseAdmin.from("trade_blocks").select("user_id,blocked_until").in("user_id", userIds),
    ]);
    for (const b of balRows ?? []) balanceMap.set(b.user_id, Number(b.available_balance ?? 0));
    for (const o of orderRows ?? []) openCountMap.set(o.user_id, (openCountMap.get(o.user_id) ?? 0) + 1);
    for (const b of blockRows ?? []) if (b.blocked_until) blockMap.set(b.user_id, b.blocked_until);

    // Plan entitlement for this source
    if (planMinimum) {
      await Promise.all(
        userIds.map(async (uid) => {
          const { data: ok } = await supabaseAdmin.rpc("user_has_plan_at_least", {
            _user_id: uid,
            _min: planMinimum,
          });
          planOk.set(uid, Boolean(ok));
        }),
      );
    } else {
      for (const uid of userIds) planOk.set(uid, true);
    }
  }

  let queued = 0;
  let rejected = 0;

  for (const s of settings ?? []) {
    if (excludeUserId && s.user_id === excludeUserId) continue;
    if (s.auto_trade_enabled === false) {
      rejected++;
      continue;
    }
    // Plan gate: only users with sufficient plan receive this channel's signals
    if (planOk.get(s.user_id) === false) {
      rejected++;
      continue;
    }
    if (s.allowed_source_ids && !s.allowed_source_ids.includes(sourceId)) continue;

    // Symbol allow/deny customization
    const sym = parsed.symbol.toUpperCase();
    if (Array.isArray(s.symbol_denylist) && s.symbol_denylist.map((x) => x.toUpperCase()).includes(sym)) {
      rejected++;
      continue;
    }
    if (
      Array.isArray(s.symbol_allowlist) &&
      s.symbol_allowlist.length > 0 &&
      !s.symbol_allowlist.map((x) => x.toUpperCase()).includes(sym)
    ) {
      rejected++;
      continue;
    }

    const balance = balanceMap.get(s.user_id) ?? 0;
    if (balance <= 0) {
      rejected++;
      continue;
    }

    const openCount = openCountMap.get(s.user_id) ?? 0;

    // Per-user concurrent-trade override
    if (
      s.max_concurrent_trades != null &&
      openCount >= Number(s.max_concurrent_trades)
    ) {
      rejected++;
      continue;
    }

    const blockedUntil = blockMap.get(s.user_id);
    const isBlocked = !!(blockedUntil && new Date(blockedUntil) > new Date());


    const { loadAdaptiveContext } = await import("@/lib/risk/adaptiveContext.server");
    const adaptive = await loadAdaptiveContext(supabaseAdmin, s.user_id, balance);

    // Apply user-defined leverage caps to the signal before evaluating risk.
    let signalLeverage = parsed.leverage;
    if (s.min_leverage != null && (signalLeverage == null || signalLeverage < Number(s.min_leverage))) {
      signalLeverage = Number(s.min_leverage);
    }
    if (s.max_leverage != null && signalLeverage != null && signalLeverage > Number(s.max_leverage)) {
      signalLeverage = Number(s.max_leverage);
    }

    const decision = evaluateRisk({
      balance,
      side: parsed.side,
      entry: parsed.entry,
      stopLoss: parsed.stopLoss,
      leverage: signalLeverage,
      settings: s,
      context: {
        openPositions: openCount,
        dailyLossPercent: adaptive.dailyLossPercent,
        drawdownPercent: adaptive.drawdownPercent,
        consecutiveLosses: adaptive.consecutiveLosses,
        consecutiveWins: adaptive.consecutiveWins,
        recentWinRate: adaptive.recentWinRate,
        minutesSinceLastLoss: adaptive.minutesSinceLastLoss,
        isBlocked,
      },
    });

    if (!decision.allow) {
      await supabaseAdmin.from("trade_logs").insert({
        user_id: s.user_id,
        action: "risk_rejected",
        details: { reason: decision.reason, signal_id: signalId, adaptive } as never,
      });
      rejected++;
      continue;
    }

    // Pick the user's first active exchange account.
    const { data: acct } = await supabaseAdmin
      .from("exchange_accounts")
      .select("id,exchange_code,status,last_error")
      .eq("user_id", s.user_id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!acct) {
      await supabaseAdmin.from("trade_logs").insert({
        user_id: s.user_id,
        action: "risk_rejected",
        details: {
          reason: "no active exchange account — connect one and verify keys to start trading",
          signal_id: signalId,
        } as never,
      });
      rejected++;
      continue;
    }

    const ladder = buildEntryLadder({
      entry: parsed.entry,
      side: parsed.side,
      totalQty: decision.quantity,
      mode: (s as { entry_mode?: string | null }).entry_mode,
      levels: (s as { entry_levels_count?: number | null }).entry_levels_count,
      rangePercent: (s as { entry_range_percent?: number | string | null }).entry_range_percent as number | null | undefined,
      distribution: (s as { entry_distribution?: string | null }).entry_distribution,
    });
    const isSingle = ladder.length === 1;
    let anyInserted = false;
    let orderFailed = false;
    for (let i = 0; i < ladder.length; i++) {
      const lvl = ladder[i];
      const key = isSingle
        ? `sig:${signalId}:${s.user_id}`
        : `sig:${signalId}:${s.user_id}:L${i}`;
      const { data: inserted, error: orderErr } = await supabaseAdmin
        .from("orders")
        .upsert(
          {
            user_id: s.user_id,
            signal_id: signalId,
            exchange_account_id: acct.id,
            symbol: parsed.symbol,
            side: parsed.side === "long" ? "buy" : "sell",
            order_type: isSingle ? "market" : "limit",
            quantity: lvl.qty,
            price: lvl.price,
            stop_loss: parsed.stopLoss,
            take_profit: parsed.takeProfit[0] ?? null,
            leverage: decision.leverage,
            status: "queued",
            idempotency_key: key,
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        )
        .select("id");
      if (orderErr) { orderFailed = true; break; }
      if (inserted && inserted.length > 0) { anyInserted = true; queued++; }
    }
    if (orderFailed && !anyInserted) rejected++;
  }

  return { queued, rejected };
}

export async function ingestSignalForSource(
  rawText: string,
  sourceId: string | null,
): Promise<{ signalId: string; queued: number; rejected: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseSignalHybrid } = await import("@/lib/parser/aiParser.server");
  const regex = parseSignal(rawText);
  const parsed = await parseSignalHybrid(rawText, regex);

  const { data: signalRow, error: signalErr } = await supabaseAdmin
    .from("signals")
    .insert({
      raw_text: rawText,
      source_id: sourceId,
      symbol: parsed.symbol,
      side: parsed.side,
      entry_price: parsed.entry,
      stop_loss: parsed.stopLoss,
      take_profit: parsed.takeProfit.length ? parsed.takeProfit : null,
      leverage: parsed.leverage,
      confidence: parsed.confidence,
      parser_version: parsed.parserVersion ?? PARSER_VERSION,
      status: parsed.error ? "rejected" : "parsed",
      error: parsed.error ?? null,
    })
    .select("id")
    .single();

  if (signalErr || !signalRow) throw new Error(signalErr?.message ?? "signal insert failed");

  if (parsed.error || !parsed.symbol || !parsed.side || parsed.entry == null || !sourceId) {
    return { signalId: signalRow.id, queued: 0, rejected: 0 };
  }

  const { queued, rejected } = await fanOutToSubscribers({
    signalId: signalRow.id,
    parsed,
    sourceId,
  });

  await supabaseAdmin
    .from("signals")
    .update({ status: "dispatched" })
    .eq("id", signalRow.id);

  return { signalId: signalRow.id, queued, rejected };
}

// Admin/testing helper: run the pipeline against arbitrary text.
export const runIngestForText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; sourceId?: string | null }) =>
    z
      .object({ text: z.string().min(1).max(8000), sourceId: z.string().uuid().nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    return ingestSignalForSource(data.text, data.sourceId ?? null);
  });

// ============ Personal-channel pipeline ============
//
// Used when a signal arrives on a user's own Telegram channel (via the
// external MTProto worker). Sizes the owner's order from the channel's
// allocation %, then — if the channel is published as a marketplace
// strategy — fans out the same signal to subscribers via the shared helper.
export async function ingestSignalForPersonalChannel(
  rawText: string,
  channelId: string,
): Promise<{ signalId: string; queued: boolean; reason?: string; fanOutQueued?: number; fanOutRejected?: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseSignalHybrid } = await import("@/lib/parser/aiParser.server");
  const regex = parseSignal(rawText);
  const parsed = await parseSignalHybrid(rawText, regex);


  const { data: channel } = await supabaseAdmin
    .from("personal_signal_channels")
    .select("id,user_id,name,is_active,is_signal_source,published_source_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) throw new Error("channel not found");

  const { data: signalRow, error: signalErr } = await supabaseAdmin
    .from("signals")
    .insert({
      raw_text: rawText,
      source_id: channel.published_source_id ?? null,
      symbol: parsed.symbol,
      side: parsed.side,
      entry_price: parsed.entry,
      stop_loss: parsed.stopLoss,
      take_profit: parsed.takeProfit.length ? parsed.takeProfit : null,
      leverage: parsed.leverage,
      confidence: parsed.confidence,
      parser_version: parsed.parserVersion ?? PARSER_VERSION,
      status: parsed.error ? "rejected" : "parsed",
      error: parsed.error ?? null,
    })
    .select("id")
    .single();
  if (signalErr || !signalRow) throw new Error(signalErr?.message ?? "signal insert failed");

  const { data: prev } = await supabaseAdmin
    .from("personal_signal_channels")
    .select("signals_count")
    .eq("id", channel.id)
    .single();
  await supabaseAdmin
    .from("personal_signal_channels")
    .update({
      signals_count: (prev?.signals_count ?? 0) + 1,
      last_signal_at: new Date().toISOString(),
    })
    .eq("id", channel.id);

  if (parsed.error || !parsed.symbol || !parsed.side || parsed.entry == null) {
    return { signalId: signalRow.id, queued: false, reason: parsed.error ?? "incomplete signal" };
  }
  if (!channel.is_active || !channel.is_signal_source) {
    return { signalId: signalRow.id, queued: false, reason: "channel disabled as signal source" };
  }

  const { data: risk } = await supabaseAdmin
    .from("channel_risk_settings")
    .select("allocation_percent,stop_loss_percent,take_profit_percent,leverage,is_active,exchange_account_id")
    .eq("channel_id", channel.id)
    .eq("user_id", channel.user_id)
    .maybeSingle();
  if (!risk || !risk.is_active) {
    return { signalId: signalRow.id, queued: false, reason: "no active risk settings for channel" };
  }

  const { data: bal } = await supabaseAdmin
    .from("user_balances")
    .select("available_balance")
    .eq("user_id", channel.user_id)
    .maybeSingle();
  const balance = Number(bal?.available_balance ?? 0);
  if (balance <= 0) {
    return { signalId: signalRow.id, queued: false, reason: "no available balance" };
  }

  // Exchange selection priority: channel override -> user default -> first active.
  const { data: userRisk } = await supabaseAdmin
    .from("user_risk_settings")
    .select("default_exchange_account_id,entry_mode,entry_levels_count,entry_range_percent,entry_distribution")
    .eq("user_id", channel.user_id)
    .maybeSingle();

  let acct: { id: string } | null = null;
  const tryIds = [risk.exchange_account_id, userRisk?.default_exchange_account_id].filter(
    (v): v is string => !!v,
  );
  for (const id of tryIds) {
    const { data } = await supabaseAdmin
      .from("exchange_accounts")
      .select("id")
      .eq("id", id)
      .eq("user_id", channel.user_id)
      .eq("status", "active")
      .maybeSingle();
    if (data) {
      acct = data;
      break;
    }
  }
  if (!acct) {
    const { data } = await supabaseAdmin
      .from("exchange_accounts")
      .select("id")
      .eq("user_id", channel.user_id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    acct = data ?? null;
  }
  if (!acct) {
    return { signalId: signalRow.id, queued: false, reason: "no active exchange account" };
  }

  const allocPct = Number(risk.allocation_percent) / 100;
  const leverage = Math.max(1, Number(risk.leverage ?? 1));
  const notional = balance * allocPct * leverage;
  const quantity = notional / parsed.entry;

  // Channel-level % overrides for SL/TP take precedence over the signal's raw levels.
  const dir = parsed.side === "long" ? 1 : -1;
  const sl = risk.stop_loss_percent != null
    ? parsed.entry * (1 - dir * Number(risk.stop_loss_percent) / 100)
    : parsed.stopLoss;
  const tp = risk.take_profit_percent != null
    ? parsed.entry * (1 + dir * Number(risk.take_profit_percent) / 100)
    : parsed.takeProfit[0] ?? null;

  const ownerLadder = buildEntryLadder({
    entry: parsed.entry,
    side: parsed.side,
    totalQty: quantity,
    mode: (userRisk as { entry_mode?: string | null } | null)?.entry_mode,
    levels: (userRisk as { entry_levels_count?: number | null } | null)?.entry_levels_count,
    rangePercent: (userRisk as { entry_range_percent?: number | string | null } | null)?.entry_range_percent as number | null | undefined,
    distribution: (userRisk as { entry_distribution?: string | null } | null)?.entry_distribution,
  });
  const ownerIsSingle = ownerLadder.length === 1;
  let ownerAnyInserted = false;
  for (let i = 0; i < ownerLadder.length; i++) {
    const lvl = ownerLadder[i];
    const key = ownerIsSingle
      ? `ch:${channel.id}:${signalRow.id}`
      : `ch:${channel.id}:${signalRow.id}:L${i}`;
    const { data: inserted, error: orderErr } = await supabaseAdmin
      .from("orders")
      .upsert(
        {
          user_id: channel.user_id,
          signal_id: signalRow.id,
          exchange_account_id: acct.id,
          symbol: parsed.symbol,
          side: parsed.side === "long" ? "buy" : "sell",
          order_type: ownerIsSingle ? "market" : "limit",
          quantity: lvl.qty,
          price: lvl.price,
          stop_loss: sl,
          take_profit: tp,
          leverage,
          status: "queued",
          idempotency_key: key,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      )
      .select("id");
    if (orderErr) {
      if (!ownerAnyInserted) {
        return { signalId: signalRow.id, queued: false, reason: orderErr.message };
      }
      break;
    }
    if (inserted && inserted.length > 0) ownerAnyInserted = true;
  }
  if (!ownerAnyInserted) {
    return { signalId: signalRow.id, queued: false, reason: "duplicate signal (already queued)" };
  }

  await supabaseAdmin.from("signals").update({ status: "dispatched" }).eq("id", signalRow.id);

  // Marketplace fan-out. Only runs if this channel is published as a
  // strategy. The owner is excluded so they never double-fill. Errors are
  // logged and swallowed so subscriber processing cannot roll back or block
  // the owner's already-queued order above.
  let fanOutQueued: number | undefined;
  let fanOutRejected: number | undefined;
  if (channel.published_source_id) {
    try {
      const result = await fanOutToSubscribers({
        signalId: signalRow.id,
        parsed,
        sourceId: channel.published_source_id,
        excludeUserId: channel.user_id,
      });
      fanOutQueued = result.queued;
      fanOutRejected = result.rejected;
    } catch (err) {
      console.error("marketplace fan-out failed", {
        signalId: signalRow.id,
        sourceId: channel.published_source_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { signalId: signalRow.id, queued: true, fanOutQueued, fanOutRejected };
}


// Auth-protected RPC for the user's external MTProto worker to push a
// captured channel message into the pipeline.
export const ingestPersonalChannelSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channelId: string; text: string }) =>
    z.object({ channelId: z.string().uuid(), text: z.string().min(1).max(8000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owns } = await supabaseAdmin
      .from("personal_signal_channels")
      .select("id")
      .eq("id", data.channelId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!owns) throw new Error("channel not found");
    return ingestSignalForPersonalChannel(data.text, data.channelId);
  });
