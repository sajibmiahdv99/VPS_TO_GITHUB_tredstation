// User-facing kill-switch: manage their own trade_blocks row.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyKillSwitch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("trade_blocks")
      .select("reason,blocked_until,created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const active = !!(data && new Date(data.blocked_until) > new Date());
    return { active, block: data ?? null };
  });

export const setMyKillSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      enabled: z.boolean(),
      hours: z.number().int().min(1).max(24 * 30).optional(),
      reason: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.enabled) {
      await supabaseAdmin.from("trade_blocks").delete().eq("user_id", context.userId);
      await supabaseAdmin.from("trade_logs").insert({
        user_id: context.userId,
        action: "kill_switch_cleared",
        details: { by: "user" },
      });
      return { ok: true, active: false };
    }
    const hours = data.hours ?? 24;
    const blocked_until = new Date(Date.now() + hours * 3600_000).toISOString();
    const reason = data.reason?.trim() || "User-initiated kill switch";
    await supabaseAdmin
      .from("trade_blocks")
      .upsert({ user_id: context.userId, reason, blocked_until }, { onConflict: "user_id" });
    await supabaseAdmin.from("trade_logs").insert({
      user_id: context.userId,
      action: "kill_switch_engaged",
      details: { by: "user", reason, hours, blocked_until },
    });
    return { ok: true, active: true, blocked_until };
  });
