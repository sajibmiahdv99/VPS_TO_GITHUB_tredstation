import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCapability } from "@/lib/auth/role.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Super admin: export audit + promo + payment summary as JSON */
export const adminExportAuditPack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCapability(context.supabase as never, context.userId, "all_dashboards");
    const { assertSadminIp } = await import("@/lib/sadmin-security.server");
    assertSadminIp();

    const [audits, promos, redemptions, payments, roles] = await Promise.all([
      supabaseAdmin
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      (supabaseAdmin as any).from("promo_codes").select("*").limit(200),
      (supabaseAdmin as any).from("promo_redemptions").select("*").limit(500),
      supabaseAdmin
        .from("payments")
        .select("id,user_id,amount,currency,provider,status,created_at,paid_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("user_roles").select("user_id,role").limit(1000),
    ]);

    return {
      exported_at: new Date().toISOString(),
      audit_logs: audits.data ?? [],
      promo_codes: promos.data ?? [],
      promo_redemptions: redemptions.data ?? [],
      payments: payments.data ?? [],
      user_roles: roles.data ?? [],
    };
  });

export const adminPromoAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCapability(context.supabase as never, context.userId, "manage_promos");
    const { data: codes } = await (supabaseAdmin as any).from("promo_codes").select("*");
    const { data: reds } = await (supabaseAdmin as any)
      .from("promo_redemptions")
      .select("id,promo_id,user_id,plan_code,redeemed_at")
      .order("redeemed_at", { ascending: false })
      .limit(500);

    const byPlan: Record<string, number> = {};
    for (const r of reds ?? []) {
      byPlan[r.plan_code] = (byPlan[r.plan_code] ?? 0) + 1;
    }
    return {
      codes: codes ?? [],
      redemptions: reds ?? [],
      total_redemptions: (reds ?? []).length,
      by_plan: byPlan,
      active_codes: (codes ?? []).filter((c: { is_active: boolean }) => c.is_active).length,
    };
  });
