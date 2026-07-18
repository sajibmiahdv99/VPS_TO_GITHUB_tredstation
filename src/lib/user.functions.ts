import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Profile ============
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        full_name: z.string().min(1).max(120).optional(),
        timezone: z.string().max(64).optional(),
        locale: z.string().max(16).optional(),
        avatar_url: z.string().url().max(500).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update(data)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Exchange accounts ============
export const listExchangeAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exchange_accounts")
      .select("id,exchange_code,label,status,validated_at,last_error,created_at,execution_mode")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addExchangeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        exchange_code: z.string().min(1).max(32),
        label: z.string().min(1).max(64),
        api_key: z.string().min(4).max(256),
        api_secret: z.string().min(4).max(512),
        passphrase: z.string().max(128).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { encryptSecret } = await import("@/lib/crypto.server");
    const { validateExchangeCreds, isExchangeExecutable } = await import("@/lib/exchanges/executor.server");
    const { getUserEntitlements } = await import("@/lib/plans/entitlements.server");

    const ent = await getUserEntitlements(context.userId);
    const { count } = await context.supabase
      .from("exchange_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) >= ent.features.max_exchange_accounts) {
      throw new Error(
        `Your plan allows ${ent.features.max_exchange_accounts} exchange account(s). Upgrade to add more.`,
      );
    }

    // Validate before persisting so users get an immediate, clear error.
    if (isExchangeExecutable(data.exchange_code)) {
      const v = await validateExchangeCreds(data.exchange_code, {
        apiKey: data.api_key,
        apiSecret: data.api_secret,
        passphrase: data.passphrase,
      });
      if (!v.ok) throw new Error(v.error ?? "Could not reach exchange with these keys");
      if (!v.canTrade) {
        throw new Error(
          "Keys verified but missing futures trading permission. Enable 'Futures' on the API key and try again.",
        );
      }
    }

    const { error } = await context.supabase.from("exchange_accounts").insert({
      user_id: context.userId,
      exchange_code: data.exchange_code,
      label: data.label,
      encrypted_api_key: encryptSecret(data.api_key),
      encrypted_api_secret: encryptSecret(data.api_secret),
      passphrase: data.passphrase ? encryptSecret(data.passphrase) : null,
      status: isExchangeExecutable(data.exchange_code) ? "active" : "pending",
      validated_at: isExchangeExecutable(data.exchange_code) ? new Date().toISOString() : null,
      last_error: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revalidateExchangeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Sensitive credential columns are not SELECT-grantable to the client role;
    // read them server-side with the service-role client, scoped by user_id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error: lErr } = await supabaseAdmin
      .from("exchange_accounts")
      .select("exchange_code,encrypted_api_key,encrypted_api_secret,passphrase")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!acct) throw new Error("Account not found");

    const { decryptSecret } = await import("@/lib/crypto.server");
    const { validateExchangeCreds, isExchangeExecutable } = await import("@/lib/exchanges/executor.server");
    if (!isExchangeExecutable(acct.exchange_code)) {
      throw new Error(`Exchange ${acct.exchange_code} is not yet supported for live trading.`);
    }
    const v = await validateExchangeCreds(acct.exchange_code, {
      apiKey: decryptSecret(acct.encrypted_api_key),
      apiSecret: decryptSecret(acct.encrypted_api_secret),
      passphrase: acct.passphrase ? decryptSecret(acct.passphrase) : undefined,
    });

    const status = v.ok && v.canTrade ? "active" : "invalid";
    const last_error = v.ok && v.canTrade
      ? null
      : v.error ?? (v.ok ? "Missing futures trading permission on this API key." : "Could not reach exchange");
    await context.supabase
      .from("exchange_accounts")
      .update({
        status,
        last_error,
        validated_at: v.ok && v.canTrade ? new Date().toISOString() : null,
        permissions: v.permissions,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);

    return { ok: v.ok && v.canTrade, status, error: last_error, permissions: v.permissions };
  });

export const deleteExchangeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("exchange_accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Telegram accounts ============
export const listTelegramAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("telegram_accounts")
      .select("id,label,status,masked_phone,last_error,tg_username,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

function maskPhone(p: string): string {
  const digits = p.replace(/[^\d+]/g, "");
  if (digits.length < 4) return digits;
  const tail = digits.slice(-3);
  return `${digits.slice(0, 2)}••••${tail}`;
}

function normalizePhone(p: string): string {
  const cleaned = p.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export const startTelegramLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        label: z.string().min(1).max(64),
        phone: z.string().min(5).max(32).regex(/^\+?[\d\s\-()]+$/, "invalid phone"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getUserEntitlements } = await import("@/lib/plans/entitlements.server");
    const ent = await getUserEntitlements(context.userId);
    if (!ent.features.user_connected_telegram) {
      throw new Error(
        "Telegram account linking requires Pro or Premium VIP. Upgrade your plan to connect Telegram.",
      );
    }

    const { sendLoginCode, friendlyTelegramError } = await import("@/lib/telegram/mtproto.server");
    const { encryptSession } = await import("@/lib/crypto.server");
    const phone = normalizePhone(data.phone);

    let sent;
    try {
      sent = await sendLoginCode(phone);
    } catch (err) {
      throw new Error(friendlyTelegramError(err));
    }

    const row = {
      user_id: context.userId,
      label: data.label,
      masked_phone: maskPhone(phone),
      phone_e164: phone,
      phone_code_hash: sent.phoneCodeHash,
      session_ref: encryptSession(sent.sessionString),
      encrypted_session: null,
      status: "awaiting_code",
      last_error: null,
    };
    const { data: inserted, error } = await context.supabase
      .from("telegram_accounts")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const verifyTelegramLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        code: z.string().min(3).max(16),
        password: z.string().max(256).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { verifyLoginCode, verifyLoginPassword, friendlyTelegramError } = await import("@/lib/telegram/mtproto.server");
    const { encryptSession, decryptSession } = await import("@/lib/crypto.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: loadErr } = await supabaseAdmin
      .from("telegram_accounts")
      .select("id,phone_e164,phone_code_hash,session_ref")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!row || !row.phone_e164 || !row.phone_code_hash || !row.session_ref) {
      throw new Error("Login session expired. Please resend a code.");
    }

    const partialSession = decryptSession(row.session_ref);

    try {
      const result = await verifyLoginCode({
        partialSession,
        phone: row.phone_e164,
        phoneCodeHash: row.phone_code_hash,
        code: data.code,
      });

      if (result.kind === "needs_password") {
        // store updated partial session and require password
        await context.supabase
          .from("telegram_accounts")
          .update({
            session_ref: encryptSession(result.sessionString),
            requires_2fa: true,
            status: "awaiting_code",
          })
          .eq("id", row.id);

        if (!data.password) {
          return { ok: false as const, requires_2fa: true as const };
        }
        const pwResult = await verifyLoginPassword({
          partialSession: result.sessionString,
          password: data.password,
        });
        await markAccountActive(context.supabase, row.id, pwResult);
        return { ok: true as const, requires_2fa: false as const };
      }

      await markAccountActive(context.supabase, row.id, result);
      return { ok: true as const, requires_2fa: false as const };
    } catch (err) {
      const msg = friendlyTelegramError(err);
      await context.supabase
        .from("telegram_accounts")
        .update({ last_error: msg, status: "error" })
        .eq("id", row.id);
      throw new Error(msg);
    }
  });

async function markAccountActive(
  supabase: any,
  id: string,
  result: { sessionString: string; userId: string; username: string | null; firstName: string | null },
) {
  const { encryptSession } = await import("@/lib/crypto.server");
  await supabase
    .from("telegram_accounts")
    .update({
      encrypted_session: encryptSession(result.sessionString),
      session_ref: null,
      phone_code_hash: null,
      status: "active",
      requires_2fa: false,
      tg_user_id: result.userId ? Number(result.userId) : null,
      tg_username: result.username,
      last_error: null,
    })
    .eq("id", id);
}

export const resendTelegramCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendLoginCode, friendlyTelegramError } = await import("@/lib/telegram/mtproto.server");
    const { encryptSession } = await import("@/lib/crypto.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("telegram_accounts")
      .select("id,phone_e164")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.phone_e164) throw new Error("Account not found.");

    try {
      const sent = await sendLoginCode(row.phone_e164);
      await context.supabase
        .from("telegram_accounts")
        .update({
          phone_code_hash: sent.phoneCodeHash,
          session_ref: encryptSession(sent.sessionString),
          status: "awaiting_code",
          last_error: null,
        })
        .eq("id", row.id);
      return { ok: true };
    } catch (err) {
      throw new Error(friendlyTelegramError(err));
    }
  });

export const deleteTelegramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { logOutSession } = await import("@/lib/telegram/mtproto.server");
    const { decryptSession } = await import("@/lib/crypto.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("telegram_accounts")
      .select("encrypted_session")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (row?.encrypted_session) {
      try { await logOutSession(decryptSession(row.encrypted_session)); } catch { /* ignore */ }
    }

    const { error } = await context.supabase
      .from("telegram_accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Signal sources (filtered by plan entitlement) ============
export const listSignalSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    // User plan
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("plan_code,status")
      .eq("user_id", uid)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: plans } = await context.supabase.from("plans").select("code,sort_order,name");
    const rank = (code: string | null | undefined) => {
      if (!code) return 0;
      return (
        plans?.find((p) => p.code === code)?.sort_order ??
        ({ starter: 1, premium: 2, professional: 3 } as Record<string, number>)[code] ??
        0
      );
    };
    const userRank = rank(sub?.plan_code);

    // RLS already gates; we still enrich with locked state for higher-tier teasers
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getUserEntitlements } = await import("@/lib/plans/entitlements.server");
    const ent = await getUserEntitlements(uid);

    const { data: all, error } = await supabaseAdmin
      .from("signal_sources")
      .select(
        "id,code,name,description,source_type,status,win_rate,is_platform_managed,plan_minimum,channel_ref,channel_url,is_premium_source",
      )
      .eq("status", "active")
      .order("name");
    if (error) throw new Error(error.message);

    return (all ?? []).map((s) => {
      const need = rank(s.plan_minimum);
      let entitled = !s.plan_minimum || userRank >= need;
      const isPremium = Boolean((s as { is_premium_source?: boolean }).is_premium_source);
      if (isPremium && !ent.features.premium_source_access) entitled = false;
      const planLabel = plans?.find((p) => p.code === s.plan_minimum)?.name ?? s.plan_minimum;
      return {
        ...s,
        channel_ref: entitled ? s.channel_ref : null,
        channel_url: entitled ? s.channel_url : null,
        entitled,
        plan_required: s.plan_minimum,
        plan_required_label: planLabel,
        locked: !entitled,
        is_premium_source: isPremium,
      };
    });
  });

/** Subscribe (opt-in) to a platform source if plan allows */
export const enablePlatformSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ source_id: z.string().uuid(), enable: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src, error: sErr } = await supabaseAdmin
      .from("signal_sources")
      .select("id,plan_minimum,status")
      .eq("id", data.source_id)
      .maybeSingle();
    if (sErr || !src) throw new Error("Source not found");
    if (src.status !== "active") throw new Error("Source is not active");

    if (src.plan_minimum) {
      const { data: ok, error: rErr } = await context.supabase.rpc("user_has_plan_at_least", {
        _user_id: context.userId,
        _min: src.plan_minimum,
      });
      if (rErr) throw new Error(rErr.message);
      if (!ok) throw new Error(`Upgrade to ${src.plan_minimum} (or higher) to use this channel`);
    }

    const { data: existing } = await supabaseAdmin
      .from("user_risk_settings")
      .select("allowed_source_ids")
      .eq("user_id", context.userId)
      .maybeSingle();
    const current = (existing?.allowed_source_ids ?? []) as string[];
    let next: string[];
    if (data.enable) {
      next = current.includes(data.source_id) ? current : [...current, data.source_id];
    } else {
      next = current.filter((id) => id !== data.source_id);
    }
    const { error } = await supabaseAdmin.from("user_risk_settings").upsert(
      { user_id: context.userId, allowed_source_ids: next },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, allowed_source_ids: next };
  });

// ============ Personal signal channels ============
export const listPersonalSignalChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("personal_signal_channels")
      .select("id,name,username,description,win_rate,signals_count,last_signal_at,is_active,is_signal_source,tg_chat_id,telegram_account_id,channel_type,webhook_token,published_source_id")
      .eq("user_id", context.userId)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ Webhook signal sources (TradingView & generic) ============
function randomToken(): string {
  // 32 bytes -> 64 hex chars. Uses WebCrypto (Workers + browsers).
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createWebhookSignalSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const token = randomToken();
    const { data: row, error } = await context.supabase
      .from("personal_signal_channels")
      .insert({
        user_id: context.userId,
        name: data.name,
        channel_type: "webhook",
        webhook_token: token,
        is_active: true,
        is_signal_source: true,
      })
      .select("id,name,channel_type,webhook_token,is_active,is_signal_source,signals_count,last_signal_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regenerateWebhookToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const token = randomToken();
    const { data: row, error } = await context.supabase
      .from("personal_signal_channels")
      .update({ webhook_token: token })
      .eq("id", data.channelId)
      .eq("user_id", context.userId)
      .eq("channel_type", "webhook")
      .select("id,webhook_token")
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Webhook source not found");
    return row;
  });

export const deleteWebhookSignalSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personal_signal_channels")
      .delete()
      .eq("id", data.channelId)
      .eq("user_id", context.userId)
      .eq("channel_type", "webhook");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Pull the user's subscribed channels from Telegram (MTProto) and upsert
// them into personal_signal_channels keyed by (user_id, tg_chat_id).
export const syncTelegramChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ telegramAccountId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { listDialogChannels, friendlyTelegramError } = await import("@/lib/telegram/mtproto.server");
    const { decryptSession } = await import("@/lib/crypto.server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error: aerr } = await supabaseAdmin
      .from("telegram_accounts")
      .select("id,status,encrypted_session")
      .eq("id", data.telegramAccountId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (aerr) throw new Error(aerr.message);
    if (!acct || acct.status !== "active" || !acct.encrypted_session) {
      throw new Error("Telegram account not connected.");
    }

    let dialogs;
    try {
      dialogs = await listDialogChannels(decryptSession(acct.encrypted_session));
    } catch (err) {
      throw new Error(friendlyTelegramError(err));
    }

    if (dialogs.length === 0) return { synced: 0 };

    const rows = dialogs
      .filter((d) => d.chatId)
      .map((d) => ({
        user_id: context.userId,
        telegram_account_id: acct.id,
        tg_chat_id: Number(d.chatId),
        name: d.name,
        username: d.username,
        description: d.isBroadcast ? "Broadcast channel" : "Group / supergroup",
      }));

    const { error: upErr } = await context.supabase
      .from("personal_signal_channels")
      .upsert(rows, { onConflict: "user_id,tg_chat_id", ignoreDuplicates: false });
    if (upErr) throw new Error(upErr.message);

    return { synced: rows.length };
  });

export const toggleChannelSignalSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), is_signal_source: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personal_signal_channels")
      .update({ is_signal_source: data.is_signal_source })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getChannelRiskSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ channelId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("channel_risk_settings")
      .select("*")
      .eq("channel_id", data.channelId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertChannelRiskSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        channelId: z.string().uuid(),
        allocation_percent: z.number().min(0.01).max(100),
        stop_loss_percent: z.number().min(0).max(100).nullable(),
        take_profit_percent: z.number().min(0).max(1000).nullable(),
        leverage: z.number().int().min(1).max(125),
        is_active: z.boolean(),
        exchange_account_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.exchange_account_id) {
      const { data: own } = await context.supabase
        .from("exchange_accounts")
        .select("id")
        .eq("id", data.exchange_account_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!own) throw new Error("exchange account not found");
    }
    const { error } = await context.supabase
      .from("channel_risk_settings")
      .upsert(
        {
          user_id: context.userId,
          channel_id: data.channelId,
          allocation_percent: data.allocation_percent,
          stop_loss_percent: data.stop_loss_percent,
          take_profit_percent: data.take_profit_percent,
          leverage: data.leverage,
          is_active: data.is_active,
          exchange_account_id: data.exchange_account_id,
        },
        { onConflict: "user_id,channel_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyExchangeAccountsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exchange_accounts")
      .select("id,label,exchange_code,status")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setDefaultExchangeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ exchange_account_id: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.exchange_account_id) {
      const { data: own } = await context.supabase
        .from("exchange_accounts")
        .select("id")
        .eq("id", data.exchange_account_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!own) throw new Error("exchange account not found");
    }
    const { error } = await context.supabase
      .from("user_risk_settings")
      .upsert(
        { user_id: context.userId, default_exchange_account_id: data.exchange_account_id },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });



// ============ Risk settings ============
export const getMyRiskSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_risk_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertMyRiskSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        max_trade_size_percent: z.number().min(0).max(100),
        risk_per_trade_percent: z.number().min(0).max(100),
        max_open_positions: z.number().int().min(0).max(1000),
        daily_loss_limit_percent: z.number().min(0).max(100),
        max_drawdown_percent: z.number().min(0).max(100),
        cooldown_minutes_after_loss: z.number().int().min(0).max(10080),
        break_even_enabled: z.boolean(),
        auto_trade_enabled: z.boolean().optional(),
        symbol_allowlist: z.array(z.string().trim().min(1).max(40)).max(200).nullable().optional(),
        symbol_denylist: z.array(z.string().trim().min(1).max(40)).max(200).nullable().optional(),
        min_leverage: z.number().int().min(1).max(125).nullable().optional(),
        max_leverage: z.number().int().min(1).max(125).nullable().optional(),
        max_concurrent_trades: z.number().int().min(0).max(1000).nullable().optional(),
        default_order_type: z.enum(["market", "limit"]).optional(),
        slippage_tolerance_pct: z.number().min(0).max(10).optional(),
        partial_tp_enabled: z.boolean().optional(),
        trailing_sl_enabled: z.boolean().optional(),
        market_fallback: z.boolean().optional(),
        max_slippage_percent: z.number().min(0).max(100).nullable().optional(),
        entry_mode: z.enum(["single", "scale_in"]).optional(),
        entry_levels_count: z.number().int().min(1).max(10).optional(),
        entry_range_percent: z.number().min(0).max(100).nullable().optional(),
        entry_distribution: z.enum(["equal", "front_loaded", "back_loaded"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_risk_settings")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setExchangeAccountExecutionMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        exchange_account_id: z.string().uuid(),
        execution_mode: z.enum(["live", "paper"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("exchange_accounts")
      .update({ execution_mode: data.execution_mode })
      .eq("id", data.exchange_account_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Orders ============
const ACTIVE_STATUSES = ["pending", "open", "partial", "submitted"];

export const listActiveOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select(
        "id,symbol,side,order_type,price,quantity,filled_quantity,fill_price,leverage,status,stop_loss,take_profit,pnl,created_at",
      )
      .eq("user_id", context.userId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listOrderHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id,symbol,side,price,quantity,fill_price,leverage,status,pnl,created_at,updated_at")
      .eq("user_id", context.userId)
      .not("status", "in", `(${ACTIVE_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const exportTradeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { start_date?: string | null; end_date?: string | null; format?: "csv" | "json" }) =>
    z
      .object({
        start_date: z.string().datetime().nullish(),
        end_date: z.string().datetime().nullish(),
        format: z.enum(["csv", "json"]).default("csv"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("orders")
      .select("id,symbol,side,price,quantity,fill_price,leverage,status,pnl,created_at")
      .eq("user_id", context.userId)
      .not("status", "in", `(${ACTIVE_STATUSES.join(",")})`)
      .not("pnl", "is", null)
      .order("created_at", { ascending: false });
    if (data.start_date) q = q.gte("created_at", data.start_date);
    if (data.end_date) q = q.lte("created_at", data.end_date);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const wins = list.filter((r) => Number(r.pnl) > 0).length;
    const losses = list.filter((r) => Number(r.pnl) < 0).length;
    const totalPnl = list.reduce((s, r) => s + Number(r.pnl ?? 0), 0);
    const totalTrades = list.length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;
    return {
      rows: list,
      summary: { total_pnl: totalPnl, total_trades: totalTrades, wins, losses, win_rate: winRate },
    };
  });


export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("status,pnl,created_at,updated_at,symbol,side")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const closed = rows.filter((r) => r.pnl !== null);
    const wins = closed.filter((r) => Number(r.pnl) > 0).length;
    const losses = closed.filter((r) => Number(r.pnl) < 0).length;
    const totalPnl = closed.reduce((s, r) => s + Number(r.pnl ?? 0), 0);

    const bal = await context.supabase
      .from("user_balances")
      .select("available_balance")
      .eq("user_id", context.userId)
      .maybeSingle();
    const currentBalance = Number(bal.data?.available_balance ?? 0);
    const startingBalance = currentBalance - totalPnl;
    const chronological = [...closed].reverse();
    let cum = 0;
    const balanceSeries = chronological.map((r) => {
      cum += Number(r.pnl ?? 0);
      return {
        t: (r.updated_at ?? r.created_at) as string,
        balance: Number((startingBalance + cum).toFixed(2)),
        pnl: Number(Number(r.pnl).toFixed(2)),
      };
    });

    const bySymbol = new Map<string, { symbol: string; pnl: number; trades: number }>();
    for (const r of closed) {
      const key = (r.symbol as string) ?? "—";
      const cur = bySymbol.get(key) ?? { symbol: key, pnl: 0, trades: 0 };
      cur.pnl += Number(r.pnl ?? 0);
      cur.trades += 1;
      bySymbol.set(key, cur);
    }
    const pnlDistribution = Array.from(bySymbol.values())
      .map((d) => ({ ...d, pnl: Number(d.pnl.toFixed(2)) }))
      .sort((a, b) => b.pnl - a.pnl);

    return {
      totalOrders: rows.length,
      closedOrders: closed.length,
      wins,
      losses,
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
      totalPnl: Number(totalPnl.toFixed(2)),
      currentBalance,
      balanceSeries,
      pnlDistribution,
      recent: rows.slice(0, 10),
    };
  });

// ============ Overview ============
export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const uid = context.userId;
    const [exch, active, sub, balance] = await Promise.all([
      sb.from("exchange_accounts").select("id", { count: "exact", head: true }).eq("user_id", uid),
      sb.from("orders").select("id,pnl", { count: "exact" }).eq("user_id", uid).in("status", ACTIVE_STATUSES),
      sb.from("subscriptions").select("plan_code,status,current_period_ends_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("user_balances").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const openPnl = (active.data ?? []).reduce((s, r) => s + Number(r.pnl ?? 0), 0);
    return {
      exchangeCount: exch.count ?? 0,
      activeTradesCount: active.count ?? 0,
      openPnl,
      subscription: sub.data,
      balance: balance.data,
    };
  });

// ============ Billing ============
export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const uid = context.userId;
    const [sub, inv, plans] = await Promise.all([
      sb.from("subscriptions").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("invoices").select("id,invoice_number,amount,currency,status,issued_at,due_at,paid_at").eq("user_id", uid).order("issued_at", { ascending: false }).limit(50),
      sb
        .from("plans")
        .select(
          "code,name,description,monthly_price,yearly_price,max_open_positions,max_daily_trades,features,sort_order,is_public",
        )
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    const { getUserEntitlements } = await import("@/lib/plans/entitlements.server");
    const entitlements = await getUserEntitlements(uid);
    return {
      subscription: sub.data,
      invoices: inv.data ?? [],
      plans: (plans.data ?? []).filter((p) => (p as { is_public?: boolean }).is_public !== false),
      entitlements,
    };
  });

export const getMyEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getUserEntitlements } = await import("@/lib/plans/entitlements.server");
    return getUserEntitlements(context.userId);
  });

// ============ Referrals ============
export const getReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const uid = context.userId;
    const { getUserEntitlements } = await import("@/lib/plans/entitlements.server");
    const ent = await getUserEntitlements(uid);

    // Ensure affiliate row exists for entitled users
    let aff = await sb.from("affiliates").select("*").eq("user_id", uid).maybeSingle();
    if (aff.error) throw new Error(aff.error.message);
    if (!aff.data) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const profile = await sb.from("profiles").select("referral_code").eq("id", uid).maybeSingle();
      const code =
        profile.data?.referral_code ??
        Math.random().toString(36).slice(2, 12);
      await supabaseAdmin.from("affiliates").upsert(
        {
          user_id: uid,
          referral_code: code,
          rank: "Member",
          is_approved: true,
          status: "active",
        },
        { onConflict: "user_id" },
      );
      aff = await sb.from("affiliates").select("*").eq("user_id", uid).maybeSingle();
    }

    const cm = await sb
      .from("affiliate_commissions")
      .select("id,amount,level,status,created_at,rate,commission_type")
      .eq("referred_by_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    const profile = await sb.from("profiles").select("referral_code").eq("id", uid).maybeSingle();
    const { describeCommissionTable } = await import("@/lib/affiliates/commission.server");

    return {
      affiliate: aff.data,
      commissions: cm.data ?? [],
      referralCode: profile.data?.referral_code ?? aff.data?.referral_code ?? null,
      entitled: ent.features.affiliate_access,
      structure: describeCommissionTable(),
      l1Rate:
        Number(aff.data?.direct_referrals ?? 0) >= 15
          ? 20
          : Number(aff.data?.direct_referrals ?? 0) >= 10
            ? 15
            : 10,
    };
  });

// ============ Support ============
export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("id,ticket_number,subject,category,priority,status,created_at,updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        subject: z.string().min(1).max(200),
        description: z.string().min(1).max(5000),
        category: z.string().min(1).max(64),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ticketNumber = `T-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await context.supabase.from("support_tickets").insert({
      user_id: context.userId,
      ticket_number: ticketNumber,
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: "open",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Notification preferences ============
export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_notification_prefs")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().email().max(255).nullable().optional(),
        telegram_chat_id: z.string().trim().max(64).nullable().optional(),
        channel_email: z.boolean(),
        channel_telegram: z.boolean(),
        channel_inapp: z.boolean(),
        evt_fill: z.boolean(),
        evt_sl_tp: z.boolean(),
        evt_error: z.boolean(),
        evt_invalid_keys: z.boolean(),
        evt_new_signal: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_notification_prefs")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

