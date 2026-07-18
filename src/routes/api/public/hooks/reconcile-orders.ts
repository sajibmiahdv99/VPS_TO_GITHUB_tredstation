// Cron hook: soft two-way reconcile for stale open orders.
// Auth: requires CRON_SECRET in `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

export const Route = createFileRoute("/api/public/hooks/reconcile-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { reconcileStaleOpenOrders } = await import(
            "@/lib/exchanges/reconcile.server"
          );
          const result = await reconcileStaleOpenOrders({
            maxAgeHours: 72,
            limit: 50,
          });
          const { reportHealth } = await import("@/lib/platform/health.server");
          await reportHealth(
            "reconcile",
            result.errors.length === 0,
            result as unknown as Record<string, unknown>,
            result.errors[0],
          ).catch(() => undefined);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
