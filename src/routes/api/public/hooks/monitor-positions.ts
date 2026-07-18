// Cron hook: monitors open positions and auto-closes on TP/SL hit.
// Also updates trailing-stop watermarks when enabled.
// Auth: requires CRON_SECRET in `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

const BATCH = 50;

type TpLevel = { price: number; pct: number };
type OrderRow = {
  id: string;
  user_id: string;
  exchange_account_id: string | null;
  symbol: string;
  side: string; // BUY | SELL (long | short alias)
  quantity: number;
  filled_quantity: number | null;
  fill_price: number | null;
  price: number | null;
  leverage: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  trailing_stop_distance: number | null;
  trailing_stop_active: boolean;
  trailing_high_watermark: number | null;
  status: string;
  tp_levels: TpLevel[] | null;
  tp_levels_hit: number | null;
};

function isLong(side: string): boolean {
  const s = side.toUpperCase();
  return s === "BUY" || s === "LONG";
}

function computePnl(o: OrderRow, exitPrice: number): number {
  const entry = Number(o.fill_price ?? o.price ?? 0);
  const qty = Number(o.filled_quantity ?? o.quantity ?? 0);
  const lev = Math.max(1, Number(o.leverage ?? 1));
  if (!entry || !qty) return 0;
  const dir = isLong(o.side) ? 1 : -1;
  return dir * (exitPrice - entry) * qty * lev;
}

export const Route = createFileRoute("/api/public/hooks/monitor-positions")({
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
        const { fetchExchangeTicker } = await import("@/lib/exchanges/executor.server");

        const results = { checked: 0, closed: 0, trailing_updated: 0, skipped: 0, errors: 0 };

        // Open positions = filled orders that aren't yet closed
        const { data: open } = await supabaseAdmin
          .from("orders")
          .select(
            "id,user_id,exchange_account_id,symbol,side,quantity,filled_quantity,fill_price,price,leverage,stop_loss,take_profit,trailing_stop_distance,trailing_stop_active,trailing_high_watermark,status,tp_levels,tp_levels_hit",
          )
          .eq("status", "filled")
          .order("last_event_at", { ascending: true, nullsFirst: true })
          .limit(BATCH);

        // Cache: exchange_account_id -> exchange_code
        const acctCache = new Map<string, string | null>();
        async function exchangeCodeFor(acctId: string | null): Promise<string | null> {
          if (!acctId) return null;
          if (acctCache.has(acctId)) return acctCache.get(acctId)!;
          const { data } = await supabaseAdmin
            .from("exchange_accounts")
            .select("exchange_code")
            .eq("id", acctId)
            .maybeSingle();
          const code = data?.exchange_code ?? null;
          acctCache.set(acctId, code);
          return code;
        }

        // Ticker memoisation per (exchange, symbol). Prefers a fresh row from
        // `live_prices` (populated by the optional self-hosted price relay,
        // see docs/PRICE_RELAY.md) before falling back to a REST ticker call.
        const LIVE_PRICE_MAX_AGE_MS = 15_000;
        const tickerCache = new Map<string, number | null>();
        async function ticker(code: string, sym: string): Promise<number | null> {
          const k = `${code}:${sym}`;
          if (tickerCache.has(k)) return tickerCache.get(k)!;
          const { data: live } = await supabaseAdmin
            .from("live_prices")
            .select("price, updated_at")
            .eq("exchange_code", code)
            .eq("symbol", sym)
            .maybeSingle();
          let p: number | null = null;
          if (live?.updated_at && live.price != null) {
            const age = Date.now() - new Date(live.updated_at as string).getTime();
            if (age >= 0 && age <= LIVE_PRICE_MAX_AGE_MS) {
              const n = Number(live.price);
              if (Number.isFinite(n) && n > 0) p = n;
            }
          }
          if (p == null) p = await fetchExchangeTicker(code, sym);
          tickerCache.set(k, p);
          return p;
        }

        for (const o of (open ?? []) as OrderRow[]) {
          results.checked++;
          const code = await exchangeCodeFor(o.exchange_account_id);
          if (!code) { results.skipped++; continue; }
          const price = await ticker(code, o.symbol);
          if (price == null) { results.skipped++; continue; }

          const long = isLong(o.side);

          // 0) Multi-TP scale-out (TP-laddering): partial close at intermediate TP levels.
          // tp_levels = ordered array [{price, pct}, ...]; tp_levels_hit = count already triggered.
          const levels = Array.isArray(o.tp_levels) ? o.tp_levels : [];
          const hitCount = Number(o.tp_levels_hit ?? 0);
          if (levels.length > 0 && hitCount < levels.length) {
            const next = levels[hitCount];
            const nextPrice = Number(next?.price);
            const reached = Number.isFinite(nextPrice) &&
              (long ? price >= nextPrice : price <= nextPrice);
            if (reached) {
              const isFinal = hitCount + 1 >= levels.length;
              const partialPnl = computePnl(o, price) * (Number(next.pct ?? 0) / 100);
              await supabaseAdmin
                .from("orders")
                .update({
                  tp_levels_hit: hitCount + 1,
                  ...(isFinal ? { status: "closed", pnl: computePnl(o, price) } : {}),
                })
                .eq("id", o.id);
              await supabaseAdmin.from("order_events").insert({
                order_id: o.id, user_id: o.user_id,
                event_type: isFinal ? "tp_hit" : "tp_partial",
                from_status: "filled",
                to_status: isFinal ? "closed" : "filled",
                payload: { exit_price: price, level: hitCount + 1, pct: next.pct, partial_pnl: partialPnl },
              });
              if (isFinal) results.closed++;
              else results.trailing_updated++;
              continue;
            }
          }



          // 1) TP / SL hit detection
          let hit: "tp" | "sl" | null = null;
          if (long) {
            if (o.take_profit != null && price >= Number(o.take_profit)) hit = "tp";
            else if (o.stop_loss != null && price <= Number(o.stop_loss)) hit = "sl";
          } else {
            if (o.take_profit != null && price <= Number(o.take_profit)) hit = "tp";
            else if (o.stop_loss != null && price >= Number(o.stop_loss)) hit = "sl";
          }

          if (hit) {
            const pnl = computePnl(o, price);
            const { error: upErr } = await supabaseAdmin
              .from("orders")
              .update({
                status: "closed",
                pnl,
                error_message: null,
              })
              .eq("id", o.id);
            if (upErr) { results.errors++; continue; }
            await supabaseAdmin.from("order_events").insert({
              order_id: o.id, user_id: o.user_id,
              event_type: hit === "tp" ? "tp_hit" : "sl_hit",
              from_status: "filled", to_status: "closed",
              payload: { exit_price: price, pnl, monitor: true },
            });
            // Best-effort: emit in-app notification
            await supabaseAdmin.from("notifications").insert({
              user_id: o.user_id,
              event_type: hit === "tp" ? "evt_sl_tp" : "evt_sl_tp",
              title: hit === "tp" ? "Take-profit hit" : "Stop-loss hit",
              body: `${o.symbol} ${o.side} closed at ${price} (PnL: ${pnl.toFixed(2)})`,
            }).then(() => undefined, () => undefined);
            results.closed++;
            continue;
          }

          // 2) Trailing stop watermark update
          if (o.trailing_stop_active && o.trailing_stop_distance != null) {
            const dist = Number(o.trailing_stop_distance);
            const wm = o.trailing_high_watermark != null ? Number(o.trailing_high_watermark) : null;
            let newWm = wm;
            let newSl = o.stop_loss != null ? Number(o.stop_loss) : null;
            let changed = false;

            if (long) {
              if (wm == null || price > wm) { newWm = price; changed = true; }
              if (newWm != null) {
                const candidate = newWm - dist;
                if (newSl == null || candidate > newSl) { newSl = candidate; changed = true; }
              }
            } else {
              if (wm == null || price < wm) { newWm = price; changed = true; }
              if (newWm != null) {
                const candidate = newWm + dist;
                if (newSl == null || candidate < newSl) { newSl = candidate; changed = true; }
              }
            }

            if (changed) {
              await supabaseAdmin
                .from("orders")
                .update({ trailing_high_watermark: newWm, stop_loss: newSl })
                .eq("id", o.id);
              await supabaseAdmin.from("order_events").insert({
                order_id: o.id, user_id: o.user_id,
                event_type: "trailing_update",
                from_status: "filled", to_status: "filled",
                payload: { price, watermark: newWm, stop_loss: newSl },
              });
              results.trailing_updated++;
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, ...results }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
