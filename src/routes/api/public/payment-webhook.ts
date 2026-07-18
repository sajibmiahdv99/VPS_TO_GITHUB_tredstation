// Payment IPN webhook (NOWPayments HMAC-SHA512 + generic providers).
// Secret resolution: env PAYMENT_WEBHOOK_SECRET / vault nowpayments_ipn_secret.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

interface PaymentPayload {
  invoice_id?: string;
  payment_status?: string;
  order_id?: string;
  pay_amount?: number;
  price_amount?: number;
  pay_currency?: string;
  payment_id?: string | number;
}

export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { rateLimit, clientIp } = await import("@/lib/rateLimit.server");
        const rl = rateLimit({
          key: `pay-wh:${clientIp(request)}`,
          limit: 90,
          windowMs: 60_000,
        });
        if (!rl.ok) return new Response("rate limited", { status: 429 });

        const { getPlatformSecret } = await import("@/lib/platform/secrets.server");
        const secret =
          (await getPlatformSecret("nowpayments_ipn_secret")) ||
          process.env.PAYMENT_WEBHOOK_SECRET ||
          "";
        if (!secret) return new Response("not configured", { status: 503 });

        const raw = await request.text();
        const sig =
          request.headers.get("x-nowpayments-sig") ?? request.headers.get("x-signature") ?? "";
        const expected = createHmac("sha512", secret).update(raw).digest("hex");
        try {
          const a = Buffer.from(sig);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("invalid signature", { status: 401 });
          }
        } catch {
          return new Response("invalid signature", { status: 401 });
        }

        let payload: PaymentPayload;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const invoiceNumber = payload.order_id;
        if (!invoiceNumber) return Response.json({ ok: true, ignored: true });

        const status = payload.payment_status ?? "";
        const paid = ["confirmed", "finished", "paid"].includes(status);

        if (!paid) {
          // update payment status if present
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("invoices")
            .update({ status: status || "pending" })
            .eq("invoice_number", invoiceNumber)
            .neq("status", "paid");
          return Response.json({ ok: true, status });
        }

        const { applyPaidInvoice } = await import("@/lib/payments/service");
        const result = await applyPaidInvoice({
          invoiceNumber,
          externalRef: payload.payment_id != null ? String(payload.payment_id) : null,
          provider: "nowpayments",
          payAmount: payload.pay_amount ?? payload.price_amount,
          payCurrency: payload.pay_currency,
        });

        return Response.json(result);
      },
    },
  },
});
