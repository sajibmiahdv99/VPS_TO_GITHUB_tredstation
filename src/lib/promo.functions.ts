import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCapability } from "@/lib/auth/role.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function genCode(len = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Super admin: list promo codes */
export const adminListPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCapability(context.supabase as never, context.userId, "manage_promos");
    const { data, error } = await (supabaseAdmin as any)
      .from("promo_codes")
      .select(
        "id,code,plan_code,scope,affiliate_user_id,duration_days,max_redemptions,redemption_count,is_active,notes,expires_at,created_at,created_by",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Attach affiliate emails
    const affIds = Array.from(
      new Set((data ?? []).map((r: { affiliate_user_id?: string }) => r.affiliate_user_id).filter(Boolean)),
    ) as string[];
    const emailMap = new Map<string, string>();
    if (affIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,email")
        .in("id", affIds);
      for (const p of profiles ?? []) emailMap.set(p.id, p.email);
    }

    return (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      affiliate_email: r.affiliate_user_id
        ? emailMap.get(r.affiliate_user_id as string) ?? null
        : null,
    }));
  });

/** Super admin: generate promo (global or single affiliate) */
export const adminCreatePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: z.string().min(4).max(32).optional(),
        plan_code: z.string().min(1).max(32),
        scope: z.enum(["global", "affiliate"]).default("global"),
        affiliate_user_id: z.string().uuid().optional().nullable(),
        duration_days: z.number().int().min(1).max(3650).default(30),
        max_redemptions: z.number().int().min(1).max(1_000_000).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
        expires_at: z.string().datetime().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCapability(context.supabase as never, context.userId, "manage_promos");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();

    if (data.scope === "affiliate" && !data.affiliate_user_id) {
      throw new Error("Affiliate promo requires affiliate_user_id");
    }

    // Validate plan
    const { data: plan, error: pErr } = await supabaseAdmin
      .from("plans")
      .select("code,is_active")
      .eq("code", data.plan_code)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!plan || !plan.is_active) throw new Error("Invalid or inactive plan");

    if (data.affiliate_user_id) {
      const { data: aff } = await supabaseAdmin
        .from("affiliates")
        .select("user_id")
        .eq("user_id", data.affiliate_user_id)
        .maybeSingle();
      // allow even without affiliate row — profile is enough
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", data.affiliate_user_id)
        .maybeSingle();
      if (!prof) throw new Error("Affiliate user not found");
      if (!aff) {
        // ensure affiliate row exists for tracking
        const { data: p2 } = await supabaseAdmin
          .from("profiles")
          .select("referral_code")
          .eq("id", data.affiliate_user_id)
          .maybeSingle();
        await supabaseAdmin.from("affiliates").upsert(
          {
            user_id: data.affiliate_user_id,
            referral_code: p2?.referral_code ?? genCode(8).toLowerCase(),
            rank: "Member",
            is_approved: true,
            status: "active",
          },
          { onConflict: "user_id" },
        );
      }
    }

    const code = (data.code ?? genCode(10)).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("promo_codes")
      .insert({
        code,
        plan_code: data.plan_code,
        scope: data.scope,
        affiliate_user_id: data.scope === "affiliate" ? data.affiliate_user_id : null,
        duration_days: data.duration_days,
        max_redemptions: data.max_redemptions ?? null,
        notes: data.notes ?? null,
        expires_at: data.expires_at ?? null,
        created_by: context.userId,
        is_active: true,
      })
      .select("id,code,plan_code,scope,affiliate_user_id,duration_days,max_redemptions")
      .single();
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "promo.created",
        entity_type: "promo_code",
        entity_id: row.id,
        meta: { code: row.code, plan_code: row.plan_code, scope: row.scope },
      } as never);
    } catch {
      /* optional */
    }

    return row;
  });

export const adminDeactivatePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCapability(context.supabase as never, context.userId, "manage_promos");
    const { error } = await (supabaseAdmin as any)
      .from("promo_codes")
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * User redeems promo → plan activated without payment/invoice.
 * No payments row is created (by design).
 */
export const redeemPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(4).max(32) }).parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.trim().toUpperCase();
    const { data: promo, error } = await (supabaseAdmin as any)
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!promo || !promo.is_active) throw new Error("Invalid or inactive promo code");
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      throw new Error("This promo code has expired");
    }
    if (
      promo.max_redemptions != null &&
      Number(promo.redemption_count) >= Number(promo.max_redemptions)
    ) {
      throw new Error("This promo code has reached its redemption limit");
    }

    // Already redeemed by this user?
    const { data: existing } = await (supabaseAdmin as any)
      .from("promo_redemptions")
      .select("id")
      .eq("promo_id", promo.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) throw new Error("You already redeemed this promo code");

    // Activate subscription — no payment transaction
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + Number(promo.duration_days || 30));

    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", context.userId)
      .in("status", ["active", "trialing"]);

    const { data: sub, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: context.userId,
        plan_code: promo.plan_code,
        status: "active",
        billing_interval: "monthly",
        auto_renew: false,
        current_period_starts_at: start.toISOString(),
        current_period_ends_at: end.toISOString(),
        external_reference: `promo:${promo.code}`,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    const { error: rErr } = await (supabaseAdmin as any).from("promo_redemptions").insert({
      promo_id: promo.id,
      user_id: context.userId,
      plan_code: promo.plan_code,
      subscription_id: sub.id,
    });
    if (rErr) throw new Error(rErr.message);

    await (supabaseAdmin as any)
      .from("promo_codes")
      .update({
        redemption_count: Number(promo.redemption_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", promo.id);

    // Affiliate-scoped promo: optionally credit affiliate link (user already sponsored via ref)
    // Record audit only — no payment row
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "promo.redeemed",
        entity_type: "promo_code",
        entity_id: promo.id,
        meta: {
          code: promo.code,
          plan_code: promo.plan_code,
          subscription_id: sub.id,
          no_payment: true,
          scope: promo.scope,
          affiliate_user_id: promo.affiliate_user_id,
        },
      } as never);
    } catch {
      /* optional */
    }

    return {
      ok: true,
      plan_code: promo.plan_code,
      ends_at: end.toISOString(),
      message: `Plan ${promo.plan_code} activated for ${promo.duration_days} days (promo — no payment).`,
    };
  });
