import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertCapability } from "@/lib/auth/role.functions";
import type { Capability } from "@/lib/auth/permissions";

async function assertAdmin(
  sb: SupabaseClient<Database>,
  userId: string,
  cap: Capability = "access_admin_area",
) {
  await assertCapability(sb as never, userId, cap);
}

// ============ Overview ============
export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "all_dashboards");
    const sb = context.supabase;
    const [users, activeSubs, openOrders, openTickets, signals24h] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "open", "partial", "submitted"]),
      sb.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
      sb.from("signals").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    ]);
    return {
      users: users.count ?? 0,
      activeSubscriptions: activeSubs.count ?? 0,
      openOrders: openOrders.count ?? 0,
      openTickets: openTickets.count ?? 0,
      signals24h: signals24h.count ?? 0,
    };
  });

// ============ Users ============
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "ops_user_state");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,is_active,created_at,last_login_at,referral_code")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const roles = await supabaseAdmin.from("user_roles").select("user_id,role");
    if (roles.error) throw new Error(roles.error.message);
    const roleMap = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    }
    return (data ?? []).map((u) => ({ ...u, roles: roleMap.get(u.id) ?? [] }));
  });

export const adminSetUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "suspend_users");
    const { error } = await context.supabase.from("profiles").update({ is_active: data.is_active }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGrantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(["admin", "super_admin", "finance_admin", "operations_admin", "moderator", "user"]),
      grant: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "manage_admins");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ============ Subscriptions ============
export const adminListSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "view_revenue");
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("id,user_id,plan_code,status,billing_interval,current_period_starts_at,current_period_ends_at,auto_renew,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ Payments ============
export const adminListPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "view_payments");
    const { data, error } = await context.supabase
      .from("payments")
      .select("id,user_id,invoice_id,amount,currency,provider,status,external_payment_ref,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ Sources (plan-gated channels) ============
export const adminListSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "source_status");
    const { data, error } = await context.supabase
      .from("signal_sources")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional().nullable(),
        source_type: z.string().min(1).max(32),
        status: z.enum(["active", "paused", "disabled"]).default("active"),
        is_platform_managed: z.boolean().default(true),
        win_rate: z.number().min(0).max(100).optional().nullable(),
        /** Minimum plan code required (starter / premium / professional). null = all plans */
        plan_minimum: z.string().min(1).max(32).optional().nullable(),
        channel_ref: z.string().max(200).optional().nullable(),
        channel_url: z.string().max(500).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "signal_sources");
    const { id, ...rest } = data;
    const payload = {
      ...rest,
      plan_minimum: rest.plan_minimum === "" || rest.plan_minimum === "any" ? null : rest.plan_minimum,
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { error } = await context.supabase.from("signal_sources").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("signal_sources").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Grant a platform source to one user (adds to allowed_source_ids). */
export const adminAssignSourceToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        source_id: z.string().uuid(),
        user_id: z.string().uuid(),
        grant: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "signal_sources");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("user_risk_settings")
      .select("allowed_source_ids")
      .eq("user_id", data.user_id)
      .maybeSingle();
    const current = (existing?.allowed_source_ids ?? []) as string[];
    let next: string[];
    if (data.grant) {
      next = current.includes(data.source_id) ? current : [...current, data.source_id];
    } else {
      next = current.filter((id) => id !== data.source_id);
    }
    const { error } = await supabaseAdmin.from("user_risk_settings").upsert(
      { user_id: data.user_id, allowed_source_ids: next },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, allowed_source_ids: next };
  });

/**
 * Give this source to every user currently on plan_code (or higher if include_higher).
 * Syncs allowed_source_ids so fan-out can trade for them.
 */
export const adminAssignSourceToPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        source_id: z.string().uuid(),
        plan_code: z.string().min(1).max(32),
        include_higher: z.boolean().default(true),
        also_set_plan_minimum: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "signal_sources");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.also_set_plan_minimum) {
      const { error: upErr } = await supabaseAdmin
        .from("signal_sources")
        .update({
          plan_minimum: data.plan_code,
          is_platform_managed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.source_id);
      if (upErr) throw new Error(upErr.message);
    }

    // Active subscribers on this plan (or higher)
    const { data: subs, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id,plan_code,status")
      .in("status", ["active", "trialing"]);
    if (sErr) throw new Error(sErr.message);

    const { data: plans } = await supabaseAdmin.from("plans").select("code,sort_order");
    const rank = (code: string) =>
      plans?.find((p) => p.code === code)?.sort_order ??
      ({ starter: 1, premium: 2, professional: 3 } as Record<string, number>)[code] ??
      0;
    const minR = rank(data.plan_code);

    const userIds = Array.from(
      new Set(
        (subs ?? [])
          .filter((s) => {
            const r = rank(s.plan_code);
            return data.include_higher ? r >= minR : s.plan_code === data.plan_code;
          })
          .map((s) => s.user_id),
      ),
    );

    let granted = 0;
    for (const uid of userIds) {
      const { data: existing } = await supabaseAdmin
        .from("user_risk_settings")
        .select("allowed_source_ids")
        .eq("user_id", uid)
        .maybeSingle();
      const current = (existing?.allowed_source_ids ?? []) as string[];
      if (current.includes(data.source_id)) continue;
      const next = [...current, data.source_id];
      const { error } = await supabaseAdmin.from("user_risk_settings").upsert(
        { user_id: uid, allowed_source_ids: next },
        { onConflict: "user_id" },
      );
      if (!error) granted++;
    }

    return { ok: true, users_matched: userIds.length, granted };
  });

// ============ Parsed Signals ============
export const adminListSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "parsed_signals");
    const { data, error } = await context.supabase
      .from("signals")
      .select("id,symbol,side,entry_price,stop_loss,take_profit,leverage,confidence,status,error,parser_version,created_at,source_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminReparseSignalAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { signalId: string }) => z.object({ signalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "parsed_signals");
    const { data: row, error } = await context.supabase
      .from("signals")
      .select("id,raw_text")
      .eq("id", data.signalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("signal not found");

    const { parseSignalAI } = await import("@/lib/parser/aiParser.server");
    const ai = await parseSignalAI(row.raw_text ?? "");
    if (!ai) throw new Error("AI parser unavailable or returned no result");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("signals")
      .update({
        symbol: ai.symbol,
        side: ai.side,
        entry_price: ai.entry,
        stop_loss: ai.stopLoss,
        take_profit: ai.takeProfit.length ? ai.takeProfit : null,
        leverage: ai.leverage,
        confidence: ai.confidence,
        parser_version: ai.parserVersion,
        status: ai.error ? "rejected" : "parsed",
        error: ai.error ?? null,
      })
      .eq("id", row.id);
    return { ok: true, confidence: ai.confidence, symbol: ai.symbol, side: ai.side };
  });

// ============ Trades (orders) ============
export const adminListTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "trade_monitoring");
    const { data, error } = await context.supabase
      .from("orders")
      .select("id,user_id,symbol,side,order_type,price,quantity,fill_price,leverage,status,pnl,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ Risk templates (plans) ============
export const adminListPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { data, error } = await context.supabase
      .from("plans")
      .select("*")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      code: z.string().min(1).max(32),
      name: z.string().min(1).max(64),
      description: z.string().max(500).optional().nullable(),
      monthly_price: z.number().min(0).max(100000).optional().nullable(),
      yearly_price: z.number().min(0).max(1000000).optional().nullable(),
      max_open_positions: z.number().int().min(0).max(1000).optional().nullable(),
      max_daily_trades: z.number().int().min(0).max(10000).optional().nullable(),
      max_trade_size_percentage: z.number().min(0).max(100).optional().nullable(),
      is_active: z.boolean().default(true),
      sort_order: z.number().int().min(0).max(1000).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("plans").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("plans").insert(rest);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ============ Affiliates ============
export const adminListAffiliates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "affiliate_eligibility");
    const { data, error } = await context.supabase
      .from("affiliates")
      .select("id,user_id,referral_code,rank,is_approved,direct_referrals,total_earned,total_paid,total_pending,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminApproveAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approved: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "affiliate_eligibility");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("affiliates")
      .update({ is_approved: data.approved })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };

  });

// ============ Payouts ============
export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "review_payouts");
    const { data, error } = await context.supabase
      .from("payouts")
      .select("id,user_id,amount,method,status,notes,requested_at,processed_at")
      .order("requested_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ Rank bonuses (manual finance pay) ============
export const adminListRankBonuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "review_payouts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("affiliate_rank_bonuses" as "affiliates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      // table may not exist yet on old deploys
      const { data: d2, error: e2 } = await (supabaseAdmin as any)
        .from("affiliate_rank_bonuses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (e2) throw new Error(e2.message);
      return d2 ?? [];
    }
    return data ?? [];
  });

export const adminCreateRankBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        amount: z.number().positive(),
        rate: z.number().min(0).max(1).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "approve_payouts");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: aff } = await supabaseAdmin
      .from("affiliates")
      .select("id,rank")
      .eq("user_id", data.user_id)
      .maybeSingle();
    const { error } = await (supabaseAdmin as any).from("affiliate_rank_bonuses").insert({
      user_id: data.user_id,
      affiliate_id: aff?.id ?? null,
      rank: aff?.rank ?? "Member",
      rate: data.rate ?? (aff?.rank === "Brand Executive" ? 0.02 : 0.01),
      base_amount: 0,
      bonus_amount: data.amount,
      status: "pending",
      notes: data.notes ?? "Manual rank bonus",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminPayRankBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.enum(["approved", "paid", "cancelled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "approve_payouts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "paid") {
      patch.paid_at = new Date().toISOString();
      patch.paid_by = context.userId;
    }
    const { error } = await (supabaseAdmin as any)
      .from("affiliate_rank_bonuses")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminProcessPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["approved", "paid", "rejected"]),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "approve_payouts");
    const { error } = await context.supabase
      .from("payouts")
      .update({
        status: data.status,
        notes: data.notes ?? null,
        processed_at: data.status === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Support ============
export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "support_tickets");
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("id,user_id,ticket_number,subject,category,priority,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpdateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "in_progress", "waiting_user", "resolved", "closed"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "support_tickets");
    const update: { status: string; resolved_at?: string | null } = { status: data.status };
    if (data.status === "resolved" || data.status === "closed") update.resolved_at = new Date().toISOString();
    const { error } = await context.supabase.from("support_tickets").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Audit logs ============
export const adminListAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "all_dashboards");
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("id,actor_email,actor_role,action,resource_type,resource_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ Settings (plans summary as system settings stand-in) ============
export const adminGetSystemStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const sb = context.supabase;
    const [plans, sources] = await Promise.all([
      sb.from("plans").select("id", { count: "exact", head: true }),
      sb.from("signal_sources").select("id", { count: "exact", head: true }),
    ]);
    return { plansCount: plans.count ?? 0, sourcesCount: sources.count ?? 0 };
  });

// ============ Monitoring dashboard ============
// Aggregates execution queue health: counts by status, recent orders,
// top failure reasons, and per-order retry counts (derived from trade_logs).
export const adminMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.string().optional(),
      userQuery: z.string().optional(),
      reasonQuery: z.string().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(2000).optional(),
    }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "trade_monitoring");
    const sb = context.supabase;
    const filters = data ?? {};
    const fromIso = filters.from ?? new Date(Date.now() - 86400000).toISOString();
    const toIso = filters.to ?? new Date().toISOString();
    const recentLimit = Math.min(filters.limit ?? 100, 2000);
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const since1h = new Date(Date.now() - 3600000).toISOString();

    // 1) Queue status counts (active + terminal in last 24h)
    const QUEUE_STATUSES = [
      "PENDING",
      "OPEN",
      "FILLED",
      "CANCELLED",
      "FAILED",
      "CLOSED",
    ] as const;
    const counts = await Promise.all(
      QUEUE_STATUSES.map(async (s) => {
        const { count } = await sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", s);
        return { status: s, count: count ?? 0 };
      }),
    );
    const { count: failed1h } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "FAILED")
      .gte("created_at", since1h);
    const { count: filled24h } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "FILLED")
      .gte("created_at", since24h);

    // 2) Recent executions with filters
    let recentQ = sb
      .from("orders")
      .select(
        "id,user_id,symbol,side,status,quantity,price,fill_price,error_message,created_at,updated_at",
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(recentLimit);
    if (filters.status) recentQ = recentQ.eq("status", filters.status);
    if (filters.reasonQuery) recentQ = recentQ.ilike("error_message", `%${filters.reasonQuery}%`);
    const recent = await recentQ;
    if (recent.error) throw new Error(recent.error.message);

    // Hydrate user profiles, then optionally apply userQuery filter (email/name)
    const userIds = Array.from(
      new Set((recent.data ?? []).map((o) => o.user_id).filter(Boolean)),
    );
    const { supabaseAdmin: sbAdminForProfiles } = await import("@/integrations/supabase/client.server");
    const profilesRes = userIds.length
      ? await sbAdminForProfiles.from("profiles").select("id,email,full_name").in("id", userIds)
      : { data: [] as Array<{ id: string; email: string; full_name: string }> };
    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p]),
    );
    const userQ = filters.userQuery?.trim().toLowerCase();
    const recentFiltered = (recent.data ?? []).filter((o) => {
      if (!userQ) return true;
      const p = profileMap.get(o.user_id);
      const hay = `${p?.email ?? ""} ${p?.full_name ?? ""} ${o.user_id ?? ""}`.toLowerCase();
      return hay.includes(userQ);
    });

    // 3) Top failure reasons (within selected window)
    let failedQ = sb
      .from("orders")
      .select("error_message")
      .eq("status", "FAILED")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(1000);
    if (filters.reasonQuery) failedQ = failedQ.ilike("error_message", `%${filters.reasonQuery}%`);
    const failedRows = await failedQ;
    const reasonCounts = new Map<string, number>();
    for (const r of failedRows.data ?? []) {
      const reason = (r.error_message ?? "Unknown").slice(0, 120);
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    const topReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 4) Retry counts — derived from trade_logs whose action contains
    // "retry" or "rejected" or "execution_". Group by order_id, take top 10.
    const logs = await sb
      .from("trade_logs")
      .select("order_id,action,created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(2000);
    const retryMap = new Map<string, { attempts: number; last: string }>();
    for (const l of logs.data ?? []) {
      if (!l.order_id) continue;
      const a = (l.action ?? "").toLowerCase();
      const isAttempt =
        a.includes("retry") || a.includes("rejected") || a.startsWith("execution_");
      if (!isAttempt) continue;
      const prev = retryMap.get(l.order_id) ?? { attempts: 0, last: l.created_at };
      prev.attempts += 1;
      if (l.created_at > prev.last) prev.last = l.created_at;
      retryMap.set(l.order_id, prev);
    }
    const retryEntries = Array.from(retryMap.entries())
      .map(([orderId, v]) => ({ orderId, attempts: v.attempts, lastAt: v.last }))
      .filter((r) => r.attempts > 1)
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 10);

    // Hydrate retry orders with symbol/status for display
    const retryIds = retryEntries.map((r) => r.orderId);
    const retryOrders = retryIds.length
      ? await sb
          .from("orders")
          .select("id,symbol,side,status,user_id")
          .in("id", retryIds)
      : { data: [] as Array<{ id: string; symbol: string; side: string; status: string; user_id: string }> };
    const retryOrderMap = new Map((retryOrders.data ?? []).map((o) => [o.id, o]));

    return {
      filters: { from: fromIso, to: toIso, status: filters.status ?? null, userQuery: filters.userQuery ?? null, reasonQuery: filters.reasonQuery ?? null, limit: recentLimit },
      queue: {
        byStatus: counts,
        failedLastHour: failed1h ?? 0,
        filledLast24h: filled24h ?? 0,
      },
      recent: recentFiltered.map((o) => ({
        ...o,
        user_email: profileMap.get(o.user_id)?.email ?? null,
        user_name: profileMap.get(o.user_id)?.full_name ?? null,
      })),
      topFailureReasons: topReasons,
      retries: retryEntries.map((r) => ({
        ...r,
        order: retryOrderMap.get(r.orderId) ?? null,
      })),
    };
  });

// ============ Blocked networks (regional signup gating) ============
export const adminListBlockedNetworks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { data, error } = await context.supabase
      .from("signup_blocked_networks")
      .select("id,cidr,country_code,reason,note,created_at,created_by")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, cidr: String(r.cidr ?? "") }));

  });

export const adminAddBlockedNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cidr: string; country_code?: string; reason?: string; note?: string }) =>
    z
      .object({
        cidr: z
          .string()
          .min(1)
          .regex(/^[0-9a-fA-F:.]+\/\d{1,3}$/, "CIDR must be like 1.2.3.0/24 or 2001:db8::/32"),
        country_code: z.string().max(8).optional(),
        reason: z.string().max(500).optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("signup_blocked_networks").insert({
      cidr: data.cidr,
      country_code: data.country_code ?? null,
      reason: data.reason ?? null,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteBlockedNetwork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("signup_blocked_networks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

