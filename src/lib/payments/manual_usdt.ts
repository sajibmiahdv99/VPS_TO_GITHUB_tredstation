import { getSetting } from "@/lib/platform/settings.server";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./types";

type ManualCfg = {
  network?: string;
  address?: string;
  memo_required?: boolean;
};

export const manualUsdtProvider: PaymentProvider = {
  id: "manual_usdt",
  label: "Manual USDT transfer",
  public: true,
  async isConfigured() {
    const cfg = await getSetting<ManualCfg>("payments.manual_usdt", {});
    return Boolean(cfg?.address);
  },
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const cfg = await getSetting<ManualCfg>("payments.manual_usdt", {});
    if (!cfg?.address) throw new Error("Manual USDT wallet is not configured by admin");

    const network = cfg.network || "TRC20";
    return {
      provider: "manual_usdt",
      payUrl: null,
      externalRef: null,
      deposit: {
        network,
        address: cfg.address,
        amount: input.amount,
        currency: "USDT",
        memo: input.invoiceNumber,
        instructions: `Send exactly ${input.amount} USDT (${network}) to the address below. Put invoice number ${input.invoiceNumber} in the memo/note if your wallet supports it. Then click "I paid" — an admin will confirm.`,
      },
      message: "Awaiting on-chain transfer. Admin will activate after confirmation.",
    };
  },
};
