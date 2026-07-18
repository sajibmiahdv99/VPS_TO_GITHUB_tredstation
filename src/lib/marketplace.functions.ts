import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================================
// Marketplace: verified track-record stats + publish/subscribe server fns.
//
// Stats reads owners' private signals/orders via the service-role client,
// but returns ONLY per-source aggregates -- never raw trades, never PII
// beyond the source's public display name and the owner's profile.full_name.
// ============================================================================

export type StrategyStats = {
  source_id: string;
  total_signals: number;
  closed_trades: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  total_pnl: number;
  avg_pnl_per_trade: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number | null;
  subscriber_count: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
  active_days: number;
};

async function computeStatsForSources(sourceIds: string[]): Promise<Record<string, StrategyStats>> {
  const out: Record<string, StrategyStats> = {};
  if (sourceIds.length === 0) return out;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Signals per source: id, source_id, created_at
  const { data: signals, error: sigErr } = await supabaseAdmin
    .from("signals")
    .select("id,source_id,created_at")
    .in("source_id", sourceIds);
  if (sigErr) throw new Error(sigErr.message);

  const signalsBySource = new Map<string, { id: string; created_at: string | null }[]>();
  const signalToSource = new Map<string, string>();
  for (const s of signals ?? []) {
    if (!s.source_id) continue;
    signalToSource.set(s.id, s.source_id);
    const arr = signalsBySource.get(s.source_id) ?? [];
    arr.push({ id: s.id, created_at: s.created_at });
    signalsBySource.set(s.source_id, arr);
  }

  // Orders joined via signal_id -> those signals. Terminal statuses; only rows with pnl count as trades.
  const signalIds = Array.from(signalToSource.keys());
  let orders: Array<{ signal_id: string | null; status: string; pnl: number | string | null; updated_at: string | null; created_at: string | null }> = [];
  if (signalIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("signal_id,status,pnl,updated_at,created_at")
      .in("signal_id", signalIds);
    if (error) throw new Error(error.message);
    orders = data ?? [];
  }

  // Subscribers: count user_risk_settings rows where allowed_source_ids @> [sourceId]
  // We do a single fetch and count in JS to keep it one query.
  const { data: riskRows, error: riskErr } = await supabaseAdmin
    .from("user_risk_settings")
    .select("allowed_source_ids");
  if (riskErr) throw new Error(riskErr.message);
  const subscriberCount = new Map<string, number>();
  for (const r of riskRows ?? []) {
    const arr = (r as { allowed_source_ids: string[] | null }).allowed_source_ids ?? [];
    for (const id of arr) {
      if (sourceIds.includes(id)) subscriberCount.set(id, (subscriberCount.get(id) ?? 0) + 1);
    }
  }

  const TERMINAL = new Set(["filled", "FILLED", "closed", "CLOSED"]);
  const REJECTED = new Set(["rejected", "REJECTED", "cancelled", "CANCELLED"]);

  for (const sid of sourceIds) {
    const sigs = signalsBySource.get(sid) ?? [];
    const sigIds = new Set(sigs.map((s) => s.id));
    const sourceOrders = orders.filter((o) => o.signal_id && sigIds.has(o.signal_id));

    // Closed trades: terminal status AND realized pnl present
    const closed = sourceOrders
      .filter((o) => TERMINAL.has(o.status) && o.pnl !== null && o.pnl !== undefined)
      .map((o) => ({
        pnl: typeof o.pnl === "string" ? Number(o.pnl) : (o.pnl as number),
        at: o.updated_at ?? o.created_at ?? null,
      }))
      .filter((o) => Number.isFinite(o.pnl))
      .sort((a, b) => {
        const ta = a.at ? Date.parse(a.at) : 0;
        const tb = b.at ? Date.parse(b.at) : 0;
        return ta - tb;
      });

    // Note: REJECTED/CANCELLED intentionally not counted as trades (kept for future audit surfaces).
    void REJECTED;

    let wins = 0, losses = 0, totalPnl = 0, sumWins = 0, sumLosses = 0;
    let peak = 0, cumulative = 0, maxDrawdown = 0, maxPeakSoFar = 0;
    for (const t of closed) {
      totalPnl += t.pnl;
      if (t.pnl > 0) { wins++; sumWins += t.pnl; }
      else if (t.pnl < 0) { losses++; sumLosses += Math.abs(t.pnl); }
      cumulative += t.pnl;
      if (cumulative > peak) peak = cumulative;
      if (peak > maxPeakSoFar) maxPeakSoFar = peak;
      const dd = peak - cumulative;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    const closedCount = closed.length;
    const winRate = closedCount > 0 ? wins / closedCount : null;
    const avgPnl = closedCount > 0 ? totalPnl / closedCount : null;
    const profitFactor = sumLosses > 0 ? sumWins / sumLosses : null;
    // Drawdown as percentage of peak equity high; if no positive peak yet, null.
    const maxDrawdownPct = maxPeakSoFar > 0 ? (maxDrawdown / maxPeakSoFar) * 100 : null;

    const dates = sigs.map((s) => (s.created_at ? Date.parse(s.created_at) : 0)).filter((n) => n > 0);
    const firstAt = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
    const lastAt = dates.length ? new Date(Math.max(...dates)).toISOString() : null;
    const activeDays = firstAt && lastAt
      ? Math.max(1, Math.ceil((Date.parse(lastAt) - Date.parse(firstAt)) / (1000 * 60 * 60 * 24)))
      : 0;

    out[sid] = {
      source_id: sid,
      total_signals: sigs.length,
      closed_trades: closedCount,
      wins,
      losses,
      win_rate: winRate,
      total_pnl: totalPnl,
      avg_pnl_per_trade: avgPnl,
      profit_factor: profitFactor,
      max_drawdown_pct: maxDrawdownPct,
      subscriber_count: subscriberCount.get(sid) ?? 0,
      first_signal_at: firstAt,
      last_signal_at: lastAt,
      active_days: activeDays,
    };
  }
  return out;
}

export const getStrategyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceIds: z.array(z.string().uuid()).max(500) }).parse(d))
  .handler(async ({ data }) => {
    return computeStatsForSources(data.sourceIds);
  });

// ============================================================================
// Publish / unpublish
// ============================================================================

function shortId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const publishChannelAsStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      channelId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify caller owns the channel and read its type.
    const { data: channel, error: chErr } = await context.supabase
      .from("personal_signal_channels")
      .select("id,name,channel_type,published_source_id,user_id")
      .eq("id", data.channelId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!channel) throw new Error("Channel not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If the channel already links a source, reuse it (re-publish path).
    if (channel.published_source_id) {
      const { data: existing } = await supabaseAdmin
        .from("signal_sources")
        .select("*")
        .eq("id", channel.published_source_id)
        .maybeSingle();
      if (existing && existing.owner_user_id === context.userId) {
        const { data: updated, error: uErr } = await supabaseAdmin
          .from("signal_sources")
          .update({
            name: data.name,
            description: data.description ?? "",
            is_published: true,
            published_at: existing.published_at ?? new Date().toISOString(),
            status: "active",
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (uErr) throw new Error(uErr.message);
        return updated;
      }
    }

    const code = `strat-${shortId()}`;
    const { data: created, error: insErr } = await supabaseAdmin
      .from("signal_sources")
      .insert({
        code,
        name: data.name,
        description: data.description ?? "",
        source_type: (channel as { channel_type?: string | null }).channel_type ?? "telegram",
        status: "active",
        is_platform_managed: false,
        owner_user_id: context.userId,
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    const { error: linkErr } = await context.supabase
      .from("personal_signal_channels")
      .update({ published_source_id: created.id })
      .eq("id", channel.id)
      .eq("user_id", context.userId);
    if (linkErr) throw new Error(linkErr.message);

    return created;
  });

export const unpublishStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src, error } = await supabaseAdmin
      .from("signal_sources")
      .select("id,owner_user_id")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src || src.owner_user_id !== context.userId) throw new Error("Not authorized");

    const { error: uErr } = await supabaseAdmin
      .from("signal_sources")
      .update({ is_published: false })
      .eq("id", data.sourceId);
    if (uErr) throw new Error(uErr.message);

    // Clear the linked channel's back-reference (best effort; only touches caller's own rows via RLS).
    await context.supabase
      .from("personal_signal_channels")
      .update({ published_source_id: null })
      .eq("user_id", context.userId)
      .eq("published_source_id", data.sourceId);

    return { ok: true };
  });

// ============================================================================
// Subscribe / unsubscribe
// ============================================================================




export const subscribeToStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify source is published and not owned by caller.
    const { data: src, error: sErr } = await context.supabase
      .from("signal_sources")
      .select("id,owner_user_id,is_published")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!src || !src.is_published) throw new Error("Strategy not available");
    if (src.owner_user_id === context.userId) throw new Error("You can't subscribe to your own strategy");

    // Fetch existing allowed_source_ids (may be null if the row doesn't exist).
    const { data: existing } = await context.supabase
      .from("user_risk_settings")
      .select("allowed_source_ids")
      .eq("user_id", context.userId)
      .maybeSingle();
    const current = ((existing as { allowed_source_ids: string[] | null } | null)?.allowed_source_ids ?? []) as string[];
    const next = Array.from(new Set([...current, data.sourceId]));

    const { error: uErr } = await context.supabase
      .from("user_risk_settings")
      .upsert(
        { user_id: context.userId, allowed_source_ids: next },
        { onConflict: "user_id" },
      );
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const unsubscribeFromStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("user_risk_settings")
      .select("allowed_source_ids")
      .eq("user_id", context.userId)
      .maybeSingle();
    const current = (((existing as { allowed_source_ids: string[] | null } | null)?.allowed_source_ids) ?? []) as string[];
    const next = current.filter((id) => id !== data.sourceId);
    const { error } = await context.supabase
      .from("user_risk_settings")
      .upsert(
        { user_id: context.userId, allowed_source_ids: next },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Listings
// ============================================================================

export type PublishedStrategy = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source_type: string;
  owner_user_id: string | null;
  owner_display_name: string;
  published_at: string | null;
  is_owner: boolean;
  is_subscribed: boolean;
  stats: StrategyStats;
};

export const listPublishedStrategies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublishedStrategy[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sources, error } = await supabaseAdmin
      .from("signal_sources")
      .select("id,code,name,description,source_type,owner_user_id,published_at,is_published")
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = sources ?? [];
    const sourceIds = rows.map((r) => r.id);
    const stats = await computeStatsForSources(sourceIds);

    // Owner display names (public: only full_name, never email).
    const ownerIds = Array.from(new Set(rows.map((r) => r.owner_user_id).filter(Boolean))) as string[];
    const ownerNames = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .in("id", ownerIds);
      for (const p of profiles ?? []) {
        ownerNames.set(p.id, (p.full_name ?? "").trim() || "Trader");
      }
    }

    const mySubs = await getMySubscribedIds(context.userId);

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      source_type: r.source_type,
      owner_user_id: r.owner_user_id,
      owner_display_name: r.owner_user_id ? (ownerNames.get(r.owner_user_id) ?? "Trader") : "AGENT TRED",
      published_at: r.published_at,
      is_owner: r.owner_user_id === context.userId,
      is_subscribed: mySubs.has(r.id),
      stats: stats[r.id] ?? emptyStats(r.id),
    }));
  });

export const listMyPublishedStrategies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublishedStrategy[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sources, error } = await supabaseAdmin
      .from("signal_sources")
      .select("id,code,name,description,source_type,owner_user_id,published_at,is_published")
      .eq("owner_user_id", context.userId)
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = sources ?? [];
    const stats = await computeStatsForSources(rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      source_type: r.source_type,
      owner_user_id: r.owner_user_id,
      owner_display_name: "You",
      published_at: r.published_at,
      is_owner: true,
      is_subscribed: false,
      stats: stats[r.id] ?? emptyStats(r.id),
    }));
  });

async function getMySubscribedIds(userId: string): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_risk_settings")
    .select("allowed_source_ids")
    .eq("user_id", userId)
    .maybeSingle();
  const arr = ((data as { allowed_source_ids: string[] | null } | null)?.allowed_source_ids ?? []) as string[];
  return new Set(arr);
}

function emptyStats(sourceId: string): StrategyStats {
  return {
    source_id: sourceId,
    total_signals: 0,
    closed_trades: 0,
    wins: 0,
    losses: 0,
    win_rate: null,
    total_pnl: 0,
    avg_pnl_per_trade: null,
    profit_factor: null,
    max_drawdown_pct: null,
    subscriber_count: 0,
    first_signal_at: null,
    last_signal_at: null,
    active_days: 0,
  };
}
