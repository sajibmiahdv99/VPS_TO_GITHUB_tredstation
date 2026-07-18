export type PaymentProviderId = "nowpayments" | "manual_usdt" | "stripe" | "paddle";

export type CheckoutInput = {
  userId: string;
  planCode: string;
  planName: string;
  amount: number;
  currency: string;
  interval: "monthly" | "yearly";
  invoiceNumber: string;
  subscriptionId: string;
  invoiceId: string;
};

export type CheckoutResult = {
  provider: PaymentProviderId;
  payUrl?: string | null;
  externalRef?: string | null;
  /** Manual deposit details */
  deposit?: {
    network: string;
    address: string;
    amount: number;
    currency: string;
    memo: string;
    instructions: string;
  } | null;
  message?: string;
};

export type PaymentProvider = {
  id: PaymentProviderId;
  label: string;
  /** Visible to end users when enabled + configured */
  public: boolean;
  isConfigured: () => Promise<boolean>;
  createCheckout: (input: CheckoutInput) => Promise<CheckoutResult>;
};
