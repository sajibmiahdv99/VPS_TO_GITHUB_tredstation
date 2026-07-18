// Cron hook: reconciles DB orders with live exchange positions.
// Detects exchange-side SL/TP execution (position closed by the exchange)
// and updates DB rows + emits in-app notifications + order events.
// Auth: requires CRON_SECRET in `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

const BATCH = 50;

type OrderRow = {
  id: string;
  user_id: string;
  exchange_account_id: string | null;
  exchange_order_id: string | null;
  symbol: string;
  side: string;
  quantity: number;
  filled_quantity: number | null;
  fill_price: number | null;
  price: number | null;
  leverage: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
};

type AcctRow = {
  id: string;
  exchange_code: string;
  execution_mode: string | null;
  encrypted_api_key: string;
  encrypted_api_secret: string;
  passphrase: string | null;
  status: string;
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

export const Route = createFileRoute("/api/public/hooks/sync-positions")({
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
        const { decryptSecret } = await import("@/lib/crypto.server");
        const {
          fetchExchangePosition,
          fetchExchangeTicker,
          isExchangeExecutable,
        } = await import("@/lib/exchanges/executor.server");

        const results = { checked: 0, closed: 0, skipped: 0, errors: 0 };

        // Live filled orders that have a real exchange order id
        const { data: open } = await supabaseAdmin
          .from("orders")
          .select(
            "id,user_id,exchange_account_id,exchange_order_id,symbol,side,quantity,filled_quantity,fill_price,price,leverage,stop_loss,take_profit,status",
          )
          .eq("status", "filled")
          .not("exchange_order_id", "is", null)
          .order("last_event_at", { ascending: true, nullsFirst: true })
          .limit(BATCH);

        // Cache account row + decrypted creds
        const acctCache = new Map<string, { acct: AcctRow; creds: { apiKey: string; apiSecret: string; passphrase?: string } } | null>();
        async function loadAcct(id: string | null) {
          if (!id) return null;
          if (acctCache.has(id)) return acctCache.get(id)!;
          const { data } = await supabaseAdmin
            .from("exchange_accounts")
            .select("id,exchange_code,execution_mode,encrypted_api_key,encrypted_api_secret,passphrase,status")
            .eq("id", id)
            .maybeSingle();
          if (!data) { acctCache.set(id, null); return null; }
          if (data.execution_mode === "paper") { acctCache.set(id, null); return null; }
          if (!isExchangeExecutable(data.exchange_code)) { acctCache.set(id, null); return null; }
          try {
            const creds = {
              apiKey: await decryptSecret(data.encrypted_api_key),
              apiSecret: await decryptSecret(data.encrypted_api_secret),
              passphrase: data.passphrase ? await decryptSecret(data.passphrase) : undefined,
            };
            const entry = { acct: data as AcctRow, creds };
            acctCache.set(id, entry);
            return entry;
          } catch {
            acctCache.set(id, null);
            return null;
          }
        }

        // Memoise position lookups per (acct, symbol)
        const posCache = new Map<string, Awaited<ReturnType<typeof fetchExchangePosition>>>();
        async function pos(acctId: string, code: string, creds: { apiKey: string; apiSecret: string; passphrase?: string }, symbol: string) {
          const k = `${acctId}:${symbol}`;
          if (posCache.has(k)) return posCache.get(k)!;
          try {
            const p = await fetchExchangePosition(code, creds, symbol);
            posCache.set(k, p);
            return p;
          } catch {
            posCache.set(k, null);
            return null;
          }
        }

        for (const o of (open ?? []) as OrderRow[]) {
          results.checked++;
          const entry = await loadAcct(o.exchange_account_id);
          if (!entry) { results.skipped++; continue; }
          const snap = await pos(entry.acct.id, entry.acct.exchange_code, entry.creds, o.symbol);
          if (!snap) { results.skipped++; continue; }

          // Position is flat for this symbol — exchange closed it (SL/TP/manual).
          if (Math.abs(snap.positionAmt) < 1e-9) {
            const exit = snap.markPrice ?? (await fetchExchangeTicker(entry.acct.exchange_code, o.symbol)) ?? Number(o.fill_price ?? o.price ?? 0);
            const pnl = computePnl(o, exit);

            // Best-effort: infer reason from price vs SL/TP
            let reason: "tp_hit" | "sl_hit" | "exchange_closed" = "exchange_closed";
            const long = isLong(o.side);
            if (long) {
              if (o.take_profit != null && exit >= Number(o.take_profit)) reason = "tp_hit";
              else if (o.stop_loss != null && exit <= Number(o.stop_loss)) reason = "sl_hit";
            } else {
              if (o.take_profit != null && exit <= Number(o.take_profit)) reason = "tp_hit";
              else if (o.stop_loss != null && exit >= Number(o.stop_loss)) reason = "sl_hit";
            }

            const { error: upErr } = await supabaseAdmin
              .from("orders")
              .update({ status: "closed", pnl, error_message: null })
              .eq("id", o.id);
            if (upErr) { results.errors++; continue; }

            await supabaseAdmin.from("order_events").insert({
              order_id: o.id, user_id: o.user_id,
              event_type: reason,
              from_status: "filled", to_status: "closed",
              payload: { exit_price: exit, pnl, source: "exchange_sync", snapshot: JSON.parse(JSON.stringify(snap.raw ?? null)) },
            });
            await supabaseAdmin.from("notifications").insert({
              user_id: o.user_id,
              event_type: "evt_sl_tp",
              title: reason === "tp_hit" ? "Take-profit hit" : reason === "sl_hit" ? "Stop-loss hit" : "Position closed",
              body: `${o.symbol} ${o.side} closed at ${exit} (PnL: ${pnl.toFixed(2)})`,
            }).then(() => undefined, () => undefined);
            results.closed++;
          }
        }

        return new Response(JSON.stringify({ ok: true, ...results }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
