import { getPlatformSecret } from "@/lib/platform/secrets.server";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";

/** Paddle provider — ready but hidden. */
export const paddleProvider: PaymentProvider = {
  id: "paddle",
  label: "Card (Paddle)",
  public: false,
  async isConfigured() {
    return Boolean(await getPlatformSecret("paddle_api_key"));
  },
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    const key = await getPlatformSecret("paddle_api_key");
    if (!key) throw new Error("Paddle is not configured");
    throw new Error(
      "Paddle checkout is prepared but not activated. Enable in Admin Control Center when ready.",
    );
  },
};
