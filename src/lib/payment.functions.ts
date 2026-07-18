import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listPublicProviders,
  startCheckout,
  markInvoiceUserClaimed,
} from "@/lib/payments/service";

export const listCheckoutProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listPublicProviders());

export const startPlanCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        plan_code: z.string().min(1),
        interval: z.enum(["monthly", "yearly"]).default("monthly"),
        provider: z.enum(["nowpayments", "manual_usdt", "stripe", "paddle"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    return startCheckout({
      userId: context.userId,
      planCode: data.plan_code,
      interval: data.interval,
      provider: data.provider,
    });
  });

export const claimManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await markInvoiceUserClaimed(data.invoice_id, context.userId);
    return { ok: true };
  });
