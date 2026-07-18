import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Public platform stats for landing page (no auth). */
export const getPublicStats = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [users, orders, sources, signals] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["filled", "closed", "open", "partial"]),
      supabaseAdmin
        .from("signal_sources")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("signals")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
    ]);
    return {
      traders: users.count ?? 0,
      executedOrders: orders.count ?? 0,
      activeSources: sources.count ?? 0,
      signals7d: signals.count ?? 0,
      exchanges: 5,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      traders: 0,
      executedOrders: 0,
      activeSources: 0,
      signals7d: 0,
      exchanges: 5,
      updatedAt: new Date().toISOString(),
    };
  }
});
