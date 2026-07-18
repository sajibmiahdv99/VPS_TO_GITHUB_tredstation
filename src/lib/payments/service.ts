import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getEnabledPaymentProviders } from "@/lib/platform/settings.server";
import { reportHealth } from "@/lib/platform/health.server";
import { nowpaymentsProvider } from "./nowpayments";
import { manualUsdtProvider } from "./manual_usdt";
import { stripeProvider } from "./stripe";
import { paddleProvider } from "./paddle";
import type { CheckoutResult, PaymentProvider, PaymentProviderId } from "./types";

const ALL: PaymentProvider[] = [
  nowpaymentsProvider,
  manualUsdtProvider,
  stripeProvider,
  paddleProvider,
];

function byId(id: string): PaymentProvider | undefined {
  return ALL.find((p) => p.id === id);
}

export async function listPublicProviders(): Promise<
  Array<{ id: PaymentProviderId; label: string; configured: boolean }>
> {
  const enabled = await getEnabledPaymentProviders();
  const out: Array<{ id: PaymentProviderId; label: string; configured: boolean }> = [];
  for (const id of enabled) {
    const p = byId(id);
    if (!p) continue;
    // Hide non-public providers even if somehow listed
    if (!p.public && id !== "stripe" && id !== "paddle") continue;
    if ((id === "stripe" || id === "paddle") && !p.public) {
      // only show if admin explicitly enabled (already filtered by getEnabledPaymentProviders)
    }
    const configured = await p.isConfigured();
    if (!configured && id !== "manual_usdt") {
      // still list manual if address missing so user sees "not available"
    }
    out.push({ id: p.id, label: p.label, configured });
  }
  return out.filter((p) => {
    // stripe/paddle only if in enabled list (admin turned on)
    if (p.id === "stripe" || p.id === "paddle") return true;
    return true;
  });
}

function invoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${ts}-${rnd}`;
}

export async function startCheckout(opts: {
  userId: string;
  planCode: string;
  interval: "monthly" | "yearly";
  provider: PaymentProviderId;
}): Promise<CheckoutResult & { invoiceNumber: string; subscriptionId: string }> {
  const enabled = await getEnabledPaymentProviders();
  if (!enabled.includes(opts.provider)) {
    throw new Error("Payment provider is not available");
  }
  const provider = byId(opts.provider);
  if (!provider) throw new Error("Unknown provider");
  if (!(await provider.isConfigured())) {
    throw new Error(`${provider.label} is not configured`);
  }

  const { data: plan, error: planErr } = await supabaseAdmin
    .from("plans")
    .select("code,name,monthly_price,yearly_price,is_active")
    .eq("code", opts.planCode)
    .maybeSingle();
  if (planErr) throw new Error(planErr.message);
  if (!plan || !plan.is_active) throw new Error("Plan not found");

  const amount =
    opts.interval === "yearly" ? Number(plan.yearly_price) : Number(plan.monthly_price);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid plan price");

  const invNo = invoiceNumber();
  const now = new Date().toISOString();

  // Upsert pending subscription for this user+plan
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .insert({
      user_id: opts.userId,
      plan_code: plan.code,
      status: "pending",
      billing_interval: opts.interval,
      auto_renew: true,
      created_at: now,
    })
    .select("id")
    .single();
  if (subErr) throw new Error(subErr.message);

  const { data: inv, error: invErr } = await supabaseAdmin
    .from("invoices")
    .insert({
      user_id: opts.userId,
      subscription_id: sub.id,
      invoice_number: invNo,
      amount,
      currency: "USD",
      status: "open",
      issued_at: now,
      due_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    })
    .select("id")
    .single();
  if (invErr) throw new Error(invErr.message);

  const result = await provider.createCheckout({
    userId: opts.userId,
    planCode: plan.code,
    planName: plan.name,
    amount,
    currency: "USD",
    interval: opts.interval,
    invoiceNumber: invNo,
    subscriptionId: sub.id,
    invoiceId: inv.id,
  });

  await supabaseAdmin.from("payments").insert({
    user_id: opts.userId,
    invoice_id: inv.id,
    amount,
    currency: result.deposit ? "USDT" : "USD",
    provider: opts.provider,
    status: "pending",
    external_payment_ref: result.externalRef ?? null,
    created_at: now,
  });

  return { ...result, invoiceNumber: invNo, subscriptionId: sub.id };
}

export async function applyPaidInvoice(opts: {
  invoiceNumber?: string;
  invoiceId?: string;
  externalRef?: string | null;
  provider?: string;
  payAmount?: number;
  payCurrency?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  let invQuery = supabaseAdmin.from("invoices").select("*");
  if (opts.invoiceId) invQuery = invQuery.eq("id", opts.invoiceId);
  else if (opts.invoiceNumber) invQuery = invQuery.eq("invoice_number", opts.invoiceNumber);
  else return { ok: false, reason: "invoice missing" };

  const { data: invoice, error } = await invQuery.maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!invoice) return { ok: false, reason: "invoice not found" };
  if (invoice.status === "paid") return { ok: true, reason: "already paid" };

  const paidAt = new Date().toISOString();
  await supabaseAdmin
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoice.id);

  // payments row
  const { data: existingPay } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPay) {
    await supabaseAdmin
      .from("payments")
      .update({
        status: "paid",
        paid_at: paidAt,
        external_payment_ref: opts.externalRef ?? undefined,
        amount: opts.payAmount ?? invoice.amount,
        currency: opts.payCurrency ?? invoice.currency,
      })
      .eq("id", existingPay.id);
  } else {
    await supabaseAdmin.from("payments").insert({
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      amount: opts.payAmount ?? invoice.amount,
      currency: opts.payCurrency ?? invoice.currency,
      provider: opts.provider ?? "unknown",
      status: "paid",
      external_payment_ref: opts.externalRef ?? null,
      paid_at: paidAt,
    });
  }

  if (invoice.subscription_id) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,billing_interval")
      .eq("id", invoice.subscription_id)
      .maybeSingle();

    const start = new Date();
    const end = new Date(start);
    if (sub?.billing_interval === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    // Cancel other active subs for this user
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", invoice.user_id)
      .eq("status", "active")
      .neq("id", invoice.subscription_id);

    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        current_period_starts_at: start.toISOString(),
        current_period_ends_at: end.toISOString(),
      })
      .eq("id", invoice.subscription_id);
  }

  const { awardAffiliateCommissions } = await import("@/lib/affiliates/commission.server");
  await awardAffiliateCommissions(invoice.user_id, invoice.subscription_id, Number(invoice.amount));
  await reportHealth("payments.ipn", true, { invoice: invoice.invoice_number });

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: invoice.user_id,
      action: "payment.paid",
      entity_type: "invoice",
      entity_id: invoice.id,
      meta: { invoice_number: invoice.invoice_number, provider: opts.provider },
    } as never);
  } catch {
    /* audit optional shape */
  }

  return { ok: true };
}

export async function markInvoiceUserClaimed(invoiceId: string, userId: string): Promise<void> {
  const { data: inv, error } = await supabaseAdmin
    .from("invoices")
    .select("id,user_id,status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv || inv.user_id !== userId) throw new Error("Invoice not found");
  if (inv.status === "paid") return;
  await supabaseAdmin.from("invoices").update({ status: "user_claimed_paid" }).eq("id", invoiceId);
  await supabaseAdmin
    .from("payments")
    .update({ status: "user_claimed_paid" })
    .eq("invoice_id", invoiceId)
    .eq("status", "pending");
}
