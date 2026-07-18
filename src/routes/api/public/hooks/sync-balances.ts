// Cron hook: refresh all connected exchange balances every few minutes.
// Auth: caller must present the CRON_SECRET in the `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export const Route = createFileRoute("/api/public/hooks/sync-balances")({
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
        const { syncAllExchangeBalances } = await import("@/lib/balances.functions");
        const result = await syncAllExchangeBalances();
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
