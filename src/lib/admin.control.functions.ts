import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getAllSettings,
  upsertSetting,
  SETTING_META,
  type Json,
} from "@/lib/platform/settings.server";
import {
  KNOWN_SECRET_KEYS,
  SECRET_CATALOG,
  clearPlatformSecret,
  getPlatformSecret,
  listSecretStatus,
  setPlatformSecret,
} from "@/lib/platform/secrets.server";
import { listHealth, reportHealth } from "@/lib/platform/health.server";
import { applyPaidInvoice } from "@/lib/payments/service";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertCapability } from "@/lib/auth/role.functions";
import type { Capability } from "@/lib/auth/permissions";

async function assertAdmin(
  sb: SupabaseClient<Database>,
  userId: string,
  cap: Capability = "emergency_controls",
) {
  await assertCapability(sb as never, userId, cap);
}

const CRON_HOOKS = [
  { id: "process-orders", path: "/api/public/hooks/process-orders", label: "Process orders" },
  { id: "monitor-positions", path: "/api/public/hooks/monitor-positions", label: "Monitor positions" },
  { id: "sync-positions", path: "/api/public/hooks/sync-positions", label: "Sync positions" },
  { id: "sync-balances", path: "/api/public/hooks/sync-balances", label: "Sync balances" },
  { id: "dispatch-notifications", path: "/api/public/hooks/dispatch-notifications", label: "Dispatch notifications" },
  { id: "monitor-anomalies", path: "/api/public/hooks/monitor-anomalies", label: "Monitor anomalies" },
  { id: "run-backtests", path: "/api/public/hooks/run-backtests", label: "Run backtests" },
  { id: "reconcile-orders", path: "/api/public/hooks/reconcile-orders", label: "Reconcile orders" },
] as const;

export const adminGetControlPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId, "emergency_controls");
    const [settings, secrets, health] = await Promise.all([
      getAllSettings(),
      listSecretStatus([...KNOWN_SECRET_KEYS]),
      listHealth(),
    ]);

    const publicAppUrl = process.env.PUBLIC_APP_URL || null;
    const domain = process.env.DOMAIN || null;

    // Lightweight DB counts for overview
    const [usersC, ordersC, paymentsC, sourcesC, subsC] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("payments").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("signal_sources").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

    const secretsByCategory = SECRET_CATALOG.reduce(
      (acc, m) => {
        acc[m.category] = (acc[m.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const configuredSecrets = secrets.filter((s) => s.configured).length;

    return {
      settings,
      settingMeta: SETTING_META,
      secrets,
      secretCatalog: SECRET_CATALOG,
      health,
      publicAppUrl,
      domain,
      system: {
        node: process.version,
        uptime_s: Math.floor(process.uptime()),
        env: process.env.NODE_ENV || "production",
        supabase_url: process.env.SUPABASE_URL || null,
        vite_supabase_public: process.env.VITE_SUPABASE_URL || null,
        has_platform_secrets_key: Boolean(
          process.env.PLATFORM_SECRETS_KEY || process.env.EXCHANGE_ENCRYPTION_KEY,
        ),
        has_cron_secret: Boolean(process.env.CRON_SECRET),
        sadmin_ip_allowlist: Boolean(process.env.SADMIN_IP_ALLOWLIST),
        sadmin_require_mfa: (process.env.SADMIN_REQUIRE_MFA || "1") !== "0",
      },
      stats: {
        users: usersC.count ?? 0,
        orders: ordersC.count ?? 0,
        payments: paymentsC.count ?? 0,
        sources: sourcesC.count ?? 0,
        active_subs: subsC.count ?? 0,
        secrets_configured: configuredSecrets,
        secrets_total: secrets.length,
      },
      secretsByCategory,
      webhookUrls: {
        payment: "/api/public/payment-webhook",
        telegram: "/api/public/telegram-webhook",
        health: "/api/public/health",
        priceTick: "/api/public/hooks/price-tick",
        cron: Object.fromEntries(CRON_HOOKS.map((h) => [h.id, h.path])),
      },
      cronHooks: CRON_HOOKS.map((h) => ({ ...h })),
    };
  });

export const adminUpsertPlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        key: z.string().min(1).max(120),
        value: z.unknown(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "feature_flags");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();
    await upsertSetting(data.key, data.value as Json, context.userId);
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "platform_setting_upsert",
        entity_type: "platform_settings",
        entity_id: data.key,
        meta: { key: data.key },
      } as never);
    } catch {
      /* audit optional */
    }
    return { ok: true };
  });

export const adminUpsertSettingsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        items: z.array(z.object({ key: z.string().min(1), value: z.unknown() })).min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "feature_flags");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();
    for (const item of data.items) {
      await upsertSetting(item.key, item.value as Json, context.userId);
    }
    return { ok: true, count: data.items.length };
  });

export const adminSetPlatformSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        key: z.string().min(1).max(120),
        value: z.string().min(1).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();
    if (!process.env.EXCHANGE_ENCRYPTION_KEY && !process.env.PLATFORM_SECRETS_KEY) {
      throw new Error("PLATFORM_SECRETS_KEY or EXCHANGE_ENCRYPTION_KEY must be set to store secrets");
    }
    await setPlatformSecret(data.key, data.value, context.userId);
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "platform_secret_set",
        entity_type: "platform_secrets",
        entity_id: data.key,
        meta: { key: data.key },
      } as never);
    } catch {
      /* optional */
    }
    return { ok: true };
  });

export const adminClearPlatformSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();
    await clearPlatformSecret(data.key);
    return { ok: true };
  });

/** Manually fire a cron hook from the panel (uses server CRON_SECRET). */
export const adminTriggerCronHook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        hookId: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "emergency_controls");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();

    const hook = CRON_HOOKS.find((h) => h.id === data.hookId);
    if (!hook) throw new Error("Unknown hook");

    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET not configured on server");

    const base =
      process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `http://127.0.0.1:${process.env.PORT || 3000}`;
    // Prefer loopback for reliability
    const url = `http://127.0.0.1:${process.env.PORT || 3000}${hook.path}`;

    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": secret,
      },
      body: "{}",
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }

    await reportHealth(
      `cron:${hook.id}`,
      res.ok,
      { status: res.status, ms: Date.now() - started, public: base + hook.path },
      res.ok ? undefined : text.slice(0, 200),
    );

    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      body,
      path: hook.path,
    };
  });

/** Test external integrations (NOWPayments, Resend, Telegram, AI). */
export const adminTestIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target: z.enum(["nowpayments", "resend", "telegram", "ai", "health"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "platform_settings");

    if (data.target === "health") {
      const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
      const res = await fetch(`${base}/api/public/health`);
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok, detail: j };
    }

    if (data.target === "nowpayments") {
      const key = await getPlatformSecret("nowpayments_api_key");
      if (!key) return { ok: false, detail: "nowpayments_api_key not configured" };
      const res = await fetch("https://api.nowpayments.io/v1/status", {
        headers: { "x-api-key": key },
      });
      const text = await res.text();
      return { ok: res.ok, detail: text.slice(0, 300), status: res.status };
    }

    if (data.target === "resend") {
      const key = await getPlatformSecret("resend_api_key");
      if (!key) return { ok: false, detail: "resend_api_key not configured" };
      const res = await fetch("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${key}` },
      });
      return { ok: res.ok, detail: `Resend API ${res.status}`, status: res.status };
    }

    if (data.target === "telegram") {
      const token = await getPlatformSecret("telegram_bot_token");
      if (!token) return { ok: false, detail: "telegram_bot_token not configured" };
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const j = (await res.json()) as { ok?: boolean; result?: { username?: string } };
      return {
        ok: Boolean(j.ok),
        detail: j.result?.username ? `@${j.result.username}` : JSON.stringify(j).slice(0, 200),
      };
    }

    if (data.target === "ai") {
      const key = await getPlatformSecret("ai_api_key");
      const url =
        (await getPlatformSecret("ai_gateway_url")) ||
        process.env.AI_GATEWAY_URL ||
        "https://openrouter.ai/api/v1/chat/completions";
      if (!key) return { ok: false, detail: "ai_api_key not configured" };
      // Lightweight models list or minimal ping
      const modelsUrl = url.replace(/\/chat\/completions\/?$/, "/models");
      const res = await fetch(modelsUrl, {
        headers: { authorization: `Bearer ${key}` },
      });
      return {
        ok: res.ok || res.status === 404,
        detail: res.ok
          ? "AI gateway reachable"
          : `Gateway ${res.status} (key present; endpoint may not list models)`,
        status: res.status,
      };
    }

    return { ok: false, detail: "unknown target" };
  });

export const adminGrantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        plan_code: z.string().min(1),
        interval: z.enum(["monthly", "yearly"]).default("monthly"),
        months: z.number().int().min(1).max(36).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "view_revenue");
    const start = new Date();
    const end = new Date(start);
    if (data.interval === "yearly") end.setFullYear(end.getFullYear() + data.months);
    else end.setMonth(end.getMonth() + data.months);

    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", data.user_id)
      .eq("status", "active");

    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: data.user_id,
      plan_code: data.plan_code,
      status: "active",
      billing_interval: data.interval,
      current_period_starts_at: start.toISOString(),
      current_period_ends_at: end.toISOString(),
      auto_renew: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminConfirmPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        invoice_id: z.string().uuid().optional(),
        invoice_number: z.string().optional(),
        action: z.enum(["confirm", "reject"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, "view_payments");
    if (data.action === "reject") {
      if (data.invoice_id) {
        await supabaseAdmin.from("invoices").update({ status: "cancelled" }).eq("id", data.invoice_id);
        await supabaseAdmin
          .from("payments")
          .update({ status: "failed" })
          .eq("invoice_id", data.invoice_id);
      } else if (data.invoice_number) {
        const { data: inv } = await supabaseAdmin
          .from("invoices")
          .select("id")
          .eq("invoice_number", data.invoice_number)
          .maybeSingle();
        if (inv) {
          await supabaseAdmin.from("invoices").update({ status: "cancelled" }).eq("id", inv.id);
          await supabaseAdmin.from("payments").update({ status: "failed" }).eq("invoice_id", inv.id);
        }
      }
      return { ok: true };
    }
    const result = await applyPaidInvoice({
      invoiceId: data.invoice_id,
      invoiceNumber: data.invoice_number,
      provider: "manual_usdt",
    });
    if (!result.ok) throw new Error(result.reason ?? "confirm failed");
    return result;
  });
