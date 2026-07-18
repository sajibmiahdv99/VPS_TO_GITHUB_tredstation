import { getPlatformSecret } from "@/lib/platform/secrets.server";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";

/**
 * Stripe provider — ready but hidden.
 * Enable via admin: payments.stripe_enabled = true + stripe_secret_key.
 * Full Checkout Session implementation can be expanded without changing the billing UI contract.
 */
export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Card (Stripe)",
  public: false,
  async isConfigured() {
    return Boolean(await getPlatformSecret("stripe_secret_key"));
  },
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    const key = await getPlatformSecret("stripe_secret_key");
    if (!key) throw new Error("Stripe is not configured");
    // Stub: intentionally not creating sessions until admin enables in production.
    throw new Error(
      "Stripe checkout is prepared but not activated. Enable in Admin Control Center and wire Checkout Sessions.",
    );
  },
};
