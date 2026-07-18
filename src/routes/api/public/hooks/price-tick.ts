// Ingestion endpoint for the optional self-hosted price relay.
// See docs/PRICE_RELAY.md for the reference implementation.
// Auth: requires PRICE_RELAY_SECRET in `x-relay-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

const MAX_TICKS = 200;

type Tick = { exchange_code: string; symbol: string; price: number };

export const Route = createFileRoute("/api/public/hooks/price-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.PRICE_RELAY_SECRET ?? "";
        const provided = request.headers.get("x-relay-secret") ?? "";
        if (!expected || !provided || !safeEqual(provided, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const raw = (body as { ticks?: unknown })?.ticks;
        if (!Array.isArray(raw)) {
          return new Response(JSON.stringify({ error: "ticks_required" }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        if (raw.length > MAX_TICKS) {
          return new Response(JSON.stringify({ error: "too_many_ticks", max: MAX_TICKS }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }

        const now = new Date().toISOString();
        const clean: Array<Tick & { updated_at: string }> = [];
        // De-dupe within the batch: latest tick per (exchange, symbol) wins.
        const seen = new Map<string, number>();
        for (const t of raw) {
          if (!t || typeof t !== "object") continue;
          const rec = t as Record<string, unknown>;
          const code = typeof rec.exchange_code === "string" ? rec.exchange_code.trim().toLowerCase() : "";
          const sym = typeof rec.symbol === "string" ? rec.symbol.trim().toUpperCase() : "";
          const price = Number(rec.price);
          if (!code || !sym) continue;
          if (!Number.isFinite(price) || price <= 0) continue;
          seen.set(`${code}:${sym}`, price);
        }
        for (const [k, price] of seen) {
          const [code, sym] = k.split(":");
          clean.push({ exchange_code: code, symbol: sym, price, updated_at: now });
        }

        if (!clean.length) {
          return Response.json({ ok: true, updated: 0 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("live_prices")
          .upsert(clean, { onConflict: "exchange_code,symbol" });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json({ ok: true, updated: clean.length });
      },
    },
  },
});
