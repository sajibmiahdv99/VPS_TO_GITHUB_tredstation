import { getPlatformSecret } from "@/lib/platform/secrets.server";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";

const API = "https://api.nowpayments.io/v1";

export const nowpaymentsProvider: PaymentProvider = {
  id: "nowpayments",
  label: "Crypto (NOWPayments)",
  public: true,
  async isConfigured() {
    const key = await getPlatformSecret("nowpayments_api_key");
    return Boolean(key);
  },
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const apiKey = await getPlatformSecret("nowpayments_api_key");
    if (!apiKey) throw new Error("NOWPayments is not configured");

    const ipnCallbackUrl =
      process.env.PUBLIC_APP_URL
        ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/public/payment-webhook`
        : undefined;

    const res = await fetch(`${API}/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        price_amount: input.amount,
        price_currency: input.currency.toLowerCase() === "usd" ? "usd" : input.currency.toLowerCase(),
        order_id: input.invoiceNumber,
        order_description: `${input.planName} (${input.interval})`,
        ipn_callback_url: ipnCallbackUrl,
        success_url: process.env.PUBLIC_APP_URL
          ? `${process.env.PUBLIC_APP_URL}/app/billing?paid=1`
          : undefined,
        cancel_url: process.env.PUBLIC_APP_URL
          ? `${process.env.PUBLIC_APP_URL}/app/billing?cancelled=1`
          : undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`NOWPayments error ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      id?: string | number;
      invoice_url?: string;
      invoice_id?: string | number;
    };

    return {
      provider: "nowpayments",
      payUrl: json.invoice_url ?? null,
      externalRef: String(json.id ?? json.invoice_id ?? ""),
      message: "Complete payment on the NOWPayments page.",
    };
  },
};
