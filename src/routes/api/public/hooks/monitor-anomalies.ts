// Cron hook: scans for trading anomalies per user and auto-engages the
// kill-switch (trade_blocks) when thresholds are breached.
// Triggers:
//  - Daily loss % >= user's daily_loss_limit_percent
//  - Consecutive losses >= user's auto_stop_after_losses (if set, default 5)
//  - Order burst: more than 30 orders queued/dispatched in last 15 min
// Auth: requires CRON_SECRET in `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

export const Route = createFileRoute("/api/public/hooks/monitor-anomalies")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadAdaptiveContext } = await import("@/lib/risk/adaptiveContext.server");

        const results = { scanned: 0, blocked: 0, errors: 0 };

        // Only check users with auto-trading on and no active block.
        const { data: settings } = await supabaseAdmin
          .from("user_risk_settings")
          .select("user_id,daily_loss_limit_percent,auto_stop_after_losses,auto_trade_enabled")
          .eq("auto_trade_enabled", true)
          .limit(500);

        const now = Date.now();
        const burstSince = new Date(now - 15 * 60_000).toISOString();

        for (const s of settings ?? []) {
          results.scanned++;
          try {
            const { data: existing } = await supabaseAdmin
              .from("trade_blocks")
              .select("blocked_until")
              .eq("user_id", s.user_id)
              .maybeSingle();
            if (existing && new Date(existing.blocked_until).getTime() > now) continue;

            const { data: bal } = await supabaseAdmin
              .from("user_balances")
              .select("available_balance")
              .eq("user_id", s.user_id)
              .maybeSingle();
            const balance = Number(bal?.available_balance ?? 0);
            const adaptive = await loadAdaptiveContext(supabaseAdmin, s.user_id, balance);

            const { count: burst } = await supabaseAdmin
              .from("orders")
              .select("id", { count: "exact", head: true })
              .eq("user_id", s.user_id)
              .gte("created_at", burstSince);

            const reasons: string[] = [];
            const dailyLimit = Number(s.daily_loss_limit_percent ?? 0);
            if (dailyLimit > 0 && adaptive.dailyLossPercent >= dailyLimit) {
              reasons.push(`daily loss ${adaptive.dailyLossPercent.toFixed(2)}% >= ${dailyLimit}%`);
            }
            const lossCap = Number(s.auto_stop_after_losses ?? 5);
            if (lossCap > 0 && adaptive.consecutiveLosses >= lossCap) {
              reasons.push(`${adaptive.consecutiveLosses} consecutive losses`);
            }
            if ((burst ?? 0) > 30) {
              reasons.push(`order burst: ${burst} orders in 15m`);
            }

            if (reasons.length === 0) continue;

            const blocked_until = new Date(now + 24 * 3600_000).toISOString();
            const reason = `Auto kill-switch: ${reasons.join("; ")}`;
            await supabaseAdmin
              .from("trade_blocks")
              .upsert({ user_id: s.user_id, reason, blocked_until }, { onConflict: "user_id" });
            await supabaseAdmin.from("trade_logs").insert({
              user_id: s.user_id,
              action: "kill_switch_auto",
              details: { reasons, blocked_until, dailyLossPercent: adaptive.dailyLossPercent, consecutiveLosses: adaptive.consecutiveLosses, burst },
            });
            await supabaseAdmin.from("notifications").insert({
              user_id: s.user_id,
              event_type: "kill_switch",
              title: "Trading auto-paused",
              body: reason,
              metadata: { reasons, blocked_until },
            });
            results.blocked++;
          } catch (e) {
            console.error("anomaly scan error", s.user_id, e);
            results.errors++;
          }
        }

        return new Response(JSON.stringify(results), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
