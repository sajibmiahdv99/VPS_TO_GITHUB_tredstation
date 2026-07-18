// Cron hook: processes queued/pending orders by sending them to the configured
// exchange. Replaces the external worker model with in-Worker execution.
// Auth: requires CRON_SECRET in `x-cron-secret` header.
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

const BATCH = 25;

export const Route = createFileRoute("/api/public/hooks/process-orders")({
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
          placeExchangeOrder,
          cancelExchangeOrder,
          fetchExchangeOrderStatus,
          fetchExchangeTicker,
          isExchangeExecutable,
        } = await import("@/lib/exchanges/executor.server");

        const results = { placed: 0, cancelled: 0, synced: 0, failed: 0, skipped: 0 };

        // 1) Queued orders → place on exchange
        const { data: queued } = await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(BATCH);

        for (const o of queued ?? []) {
          if (!o.exchange_account_id) {
            await markRejected(o.id, o.user_id, "No exchange account linked. Connect one in Exchanges.");
            results.failed++;
            continue;
          }
          const { data: acct } = await supabaseAdmin
            .from("exchange_accounts")
            .select("id,exchange_code,encrypted_api_key,encrypted_api_secret,passphrase,status,last_error,execution_mode")
            .eq("id", o.exchange_account_id)
            .maybeSingle();
          if (!acct) {
            await markRejected(o.id, o.user_id, "Exchange account was removed before the order could be placed.");
            results.failed++;
            continue;
          }

          // Paper-trading short-circuit: simulate immediate fill at entry price.
          if (acct.execution_mode === "paper") {
            const fakeId = `paper-${o.id.slice(0, 12)}-${Date.now()}`;
            await supabaseAdmin.from("orders").update({
              status: "filled",
              exchange_order_id: fakeId,
              client_order_id: o.client_order_id ?? `lov-${o.id.slice(0, 12)}`,
              fill_price: o.price,
              filled_quantity: o.quantity,
              error_message: null,
            }).eq("id", o.id);
            await supabaseAdmin.from("order_events").insert({
              order_id: o.id, user_id: o.user_id,
              event_type: "paper_filled",
              from_status: "queued", to_status: "filled",
              payload: { simulated: true, fill_price: o.price },
            });
            results.placed++;
            continue;
          }

          if (!isExchangeExecutable(acct.exchange_code)) {
            await markRejected(o.id, o.user_id, `Exchange ${acct.exchange_code} is not yet supported for live trading.`);
            results.failed++;
            continue;
          }
          if (acct.status !== "active") {
            await markRejected(
              o.id, o.user_id,
              acct.status === "invalid"
                ? `Exchange keys are invalid: ${acct.last_error ?? "re-validate in Exchanges"}`
                : `Exchange account is ${acct.status}. Verify keys in Exchanges.`,
            );
            results.failed++;
            continue;
          }

          try {
            const creds = {
              apiKey: decryptSecret(acct.encrypted_api_key),
              apiSecret: decryptSecret(acct.encrypted_api_secret),
              passphrase: acct.passphrase ? decryptSecret(acct.passphrase) : undefined,
            };
            const clientOrderId = o.client_order_id ?? `lov-${o.id.slice(0, 12)}`;

            // Market-fallback: if user opted in and market has moved past the signal
            // entry, place at market (respecting an optional max-slippage cap).
            let entryToUse: number | null = o.price;
            const { data: urs } = await supabaseAdmin
              .from("user_risk_settings")
              .select("market_fallback,max_slippage_percent")
              .eq("user_id", o.user_id)
              .maybeSingle();
            if (urs?.market_fallback && o.price != null) {
              const mark = await fetchExchangeTicker(acct.exchange_code, o.symbol);
              if (mark != null) {
                const slippagePct = Math.abs(mark - Number(o.price)) / Number(o.price) * 100;
                if (urs.max_slippage_percent != null && slippagePct > Number(urs.max_slippage_percent)) {
                  const reasonMsg = `Skipped: price moved ${slippagePct.toFixed(2)}% from signal entry ${o.price}, exceeds your ${urs.max_slippage_percent}% max slippage.`;
                  await supabaseAdmin.from("orders").update({
                    status: "rejected",
                    error_message: reasonMsg.slice(0, 500),
                  }).eq("id", o.id);
                  await supabaseAdmin.from("order_events").insert({
                    order_id: o.id,
                    user_id: o.user_id,
                    event_type: "slippage_rejected",
                    from_status: "queued",
                    to_status: "rejected",
                    payload: {
                      reason: "max_slippage_exceeded",
                      signal_entry: Number(o.price),
                      market_price: Number(mark),
                      slippage_percent: Number(slippagePct.toFixed(4)),
                      max_slippage_percent: Number(urs.max_slippage_percent),
                      symbol: o.symbol,
                      exchange_code: acct.exchange_code,
                    },
                  });
                  results.skipped++;
                  continue;
                }
                entryToUse = null;
              } else {
                // Ticker unavailable for this venue — user opted into market fallback.
                entryToUse = null;
              }
            }

            const r = await placeExchangeOrder(acct.exchange_code, creds, {
              symbol: o.symbol,
              side: o.side as "long" | "short",
              quantity: Number(o.quantity),
              entry: entryToUse,
              stopLoss: o.stop_loss,
              takeProfit: o.take_profit,
              leverage: o.leverage,
              clientOrderId,
            });

            await supabaseAdmin.from("orders").update({
              status: r.status === "rejected" ? "rejected" : r.status === "filled" ? "filled" : r.status === "partial" ? "partial" : "open",
              exchange_order_id: r.exchangeOrderId,
              client_order_id: clientOrderId,
              fill_price: r.fillPrice ?? null,
              filled_quantity: r.filledQuantity ?? null,
              error_message: null,
            }).eq("id", o.id);
            await supabaseAdmin.from("order_events").insert({
              order_id: o.id, user_id: o.user_id,
              event_type: `exchange_${r.status}`,
              from_status: "queued", to_status: r.status,
              payload: { exchange_order_id: r.exchangeOrderId, fill_price: r.fillPrice ?? null },
            });
            results.placed++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await markRejected(o.id, o.user_id, msg);
            // Credential / permission failure → flip account to invalid so user is alerted.
            if (/-2014|-2015|-2008|signature|api[-\s]?key|invalid api/i.test(msg)) {
              await supabaseAdmin
                .from("exchange_accounts")
                .update({ status: "invalid", last_error: msg.slice(0, 500) })
                .eq("id", acct.id);
            }
            results.failed++;
          }
        }

        // 2) Cancel-requested live orders
        const { data: cancels } = await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("cancel_requested", true)
          .in("status", ["open", "partial", "dispatched"])
          .limit(BATCH);

        for (const o of cancels ?? []) {
          if (!o.exchange_account_id || !o.exchange_order_id) continue;
          const { data: acct } = await supabaseAdmin
            .from("exchange_accounts")
            .select("exchange_code,encrypted_api_key,encrypted_api_secret,passphrase")
            .eq("id", o.exchange_account_id)
            .maybeSingle();
          if (!acct) continue;
          try {
            const creds = {
              apiKey: decryptSecret(acct.encrypted_api_key),
              apiSecret: decryptSecret(acct.encrypted_api_secret),
            };
            await cancelExchangeOrder(acct.exchange_code, creds, o.symbol, o.exchange_order_id);
            await supabaseAdmin.from("orders").update({
              status: "cancelled", cancel_requested: false,
            }).eq("id", o.id);
            await supabaseAdmin.from("order_events").insert({
              order_id: o.id, user_id: o.user_id, event_type: "exchange_cancelled",
              from_status: o.status, to_status: "cancelled", payload: {},
            });
            results.cancelled++;
          } catch (e) {
            await supabaseAdmin.from("order_events").insert({
              order_id: o.id, user_id: o.user_id, event_type: "cancel_failed",
              from_status: o.status, to_status: null,
              payload: { error: e instanceof Error ? e.message : String(e) },
            });
            results.failed++;
          }
        }

        // 3) Sync live order status
        const { data: live } = await supabaseAdmin
          .from("orders")
          .select("*")
          .in("status", ["open", "partial", "dispatched"])
          .not("exchange_order_id", "is", null)
          .order("last_event_at", { ascending: true, nullsFirst: true })
          .limit(BATCH);

        for (const o of live ?? []) {
          if (!o.exchange_account_id || !o.exchange_order_id) continue;
          const { data: acct } = await supabaseAdmin
            .from("exchange_accounts")
            .select("exchange_code,encrypted_api_key,encrypted_api_secret")
            .eq("id", o.exchange_account_id)
            .maybeSingle();
          if (!acct) continue;
          try {
            const creds = {
              apiKey: decryptSecret(acct.encrypted_api_key),
              apiSecret: decryptSecret(acct.encrypted_api_secret),
            };
            const r = await fetchExchangeOrderStatus(acct.exchange_code, creds, o.symbol, o.exchange_order_id);
            if (r.status !== o.status) {
              await supabaseAdmin.from("orders").update({
                status: r.status,
                fill_price: r.fillPrice ?? o.fill_price,
                filled_quantity: r.filledQuantity ?? o.filled_quantity,
              }).eq("id", o.id);
              await supabaseAdmin.from("order_events").insert({
                order_id: o.id, user_id: o.user_id,
                event_type: `exchange_sync_${r.status}`,
                from_status: o.status, to_status: r.status,
                payload: { fill_price: r.fillPrice, filled_quantity: r.filledQuantity },
              });
            }
            results.synced++;
          } catch {
            results.failed++;
          }
        }

        return new Response(JSON.stringify({ success: true, ...results }), {
          headers: { "Content-Type": "application/json" },
        });

        async function markRejected(orderId: string, userId: string, msg: string) {
          await supabaseAdmin.from("orders").update({
            status: "rejected", error_message: msg.slice(0, 500),
          }).eq("id", orderId);
          await supabaseAdmin.from("order_events").insert({
            order_id: orderId, user_id: userId,
            event_type: "exchange_rejected",
            from_status: "queued", to_status: "rejected",
            payload: { error: msg.slice(0, 500) },
          });
        }
      },
    },
  },
});
