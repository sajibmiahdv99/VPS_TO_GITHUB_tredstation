// Encrypted platform secrets vault. Server-only.
// Resolution order: process.env (bootstrap) → platform_secrets table.

import { decryptPlatformSecret, encryptPlatformSecret, secretHint } from "@/lib/crypto.server";
import { adminDb } from "./db.server";

const ENV_MAP: Record<string, string[]> = {
  nowpayments_api_key: ["NOWPAYMENTS_API_KEY"],
  nowpayments_ipn_secret: ["PAYMENT_WEBHOOK_SECRET", "NOWPAYMENTS_IPN_SECRET"],
  resend_api_key: ["RESEND_API_KEY"],
  email_from: ["EMAIL_FROM"],
  telegram_bot_token: ["TELEGRAM_BOT_TOKEN"],
  telegram_webhook_secret: ["TELEGRAM_WEBHOOK_SECRET"],
  ai_api_key: ["AI_API_KEY", "OPENAI_API_KEY"],
  ai_gateway_url: ["AI_GATEWAY_URL"],
  ai_model: ["AI_MODEL"],
  smtp_url: ["SMTP_URL"],
  price_relay_secret: ["PRICE_RELAY_SECRET"],
  cron_secret: ["CRON_SECRET"],
  stripe_secret_key: ["STRIPE_SECRET_KEY"],
  stripe_webhook_secret: ["STRIPE_WEBHOOK_SECRET"],
  stripe_publishable_key: ["STRIPE_PUBLISHABLE_KEY", "VITE_STRIPE_PUBLISHABLE_KEY"],
  paddle_api_key: ["PADDLE_API_KEY"],
  sentry_dsn: ["SENTRY_DSN"],
  sumsub_app_token: ["SUMSUB_APP_TOKEN"],
  sumsub_secret_key: ["SUMSUB_SECRET_KEY"],
  binance_oauth_client_id: ["BINANCE_OAUTH_CLIENT_ID"],
  binance_oauth_client_secret: ["BINANCE_OAUTH_CLIENT_SECRET"],
};

export type SecretMeta = {
  key: string;
  label: string;
  category: "payments" | "email" | "telegram" | "ai" | "security" | "exchange" | "observability" | "kyc";
  description: string;
  sensitive?: boolean;
};

/** Catalog of all secrets super-admin can manage from the panel */
export const SECRET_CATALOG: SecretMeta[] = [
  {
    key: "nowpayments_api_key",
    label: "NOWPayments API key",
    category: "payments",
    description: "Create crypto invoices (x-api-key)",
  },
  {
    key: "nowpayments_ipn_secret",
    label: "NOWPayments IPN secret",
    category: "payments",
    description: "Verify payment webhook signatures",
  },
  {
    key: "stripe_secret_key",
    label: "Stripe secret key",
    category: "payments",
    description: "sk_live_… or sk_test_…",
  },
  {
    key: "stripe_publishable_key",
    label: "Stripe publishable key",
    category: "payments",
    description: "pk_… shown in checkout (optional)",
  },
  {
    key: "stripe_webhook_secret",
    label: "Stripe webhook secret",
    category: "payments",
    description: "whsec_… for Checkout events",
  },
  {
    key: "paddle_api_key",
    label: "Paddle API key",
    category: "payments",
    description: "Paddle Billing API key",
  },
  {
    key: "resend_api_key",
    label: "Resend API key",
    category: "email",
    description: "Transactional email delivery",
  },
  {
    key: "email_from",
    label: "Email From address",
    category: "email",
    description: 'e.g. AGENT TRED <noreply@yourdomain.com>',
    sensitive: false,
  },
  {
    key: "smtp_url",
    label: "SMTP URL (fallback)",
    category: "email",
    description: "smtp://user:pass@host:587 — used if Resend unset",
  },
  {
    key: "telegram_bot_token",
    label: "Telegram bot token",
    category: "telegram",
    description: "BotFather token for user notifications",
  },
  {
    key: "telegram_webhook_secret",
    label: "Telegram webhook secret",
    category: "telegram",
    description: "Optional secret path/header for bot webhook",
  },
  {
    key: "ai_api_key",
    label: "AI API key",
    category: "ai",
    description: "OpenRouter / OpenAI-compatible key for signal parser",
  },
  {
    key: "ai_gateway_url",
    label: "AI gateway URL",
    category: "ai",
    description: "Chat completions endpoint",
    sensitive: false,
  },
  {
    key: "ai_model",
    label: "AI model id",
    category: "ai",
    description: "e.g. google/gemini-2.0-flash-001",
    sensitive: false,
  },
  {
    key: "cron_secret",
    label: "Cron secret",
    category: "security",
    description: "x-cron-secret for worker hooks (prefer env)",
  },
  {
    key: "price_relay_secret",
    label: "Price relay secret",
    category: "security",
    description: "x-relay-secret for live prices",
  },
  {
    key: "sentry_dsn",
    label: "Sentry DSN",
    category: "observability",
    description: "Error reporting endpoint",
    sensitive: false,
  },
  {
    key: "sumsub_app_token",
    label: "Sumsub app token",
    category: "kyc",
    description: "Live KYC (future)",
  },
  {
    key: "sumsub_secret_key",
    label: "Sumsub secret key",
    category: "kyc",
    description: "Live KYC signing secret",
  },
  {
    key: "binance_oauth_client_id",
    label: "Binance OAuth client ID",
    category: "exchange",
    description: "Exchange OAuth connect",
  },
  {
    key: "binance_oauth_client_secret",
    label: "Binance OAuth client secret",
    category: "exchange",
    description: "Exchange OAuth connect",
  },
];

export const KNOWN_SECRET_KEYS = SECRET_CATALOG.map((s) => s.key);

export type SecretStatus = {
  key: string;
  configured: boolean;
  source: "env" | "vault" | "none";
  hint: string | null;
  label: string;
  category: SecretMeta["category"];
  description: string;
};

export async function getPlatformSecret(key: string): Promise<string | null> {
  const envNames = ENV_MAP[key] ?? [key.toUpperCase()];
  for (const e of envNames) {
    const v = process.env[e];
    if (v) return v;
  }
  try {
    const { data, error } = await adminDb
      .from("platform_secrets")
      .select("ciphertext")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return decryptPlatformSecret(data.ciphertext);
  } catch {
    return null;
  }
}

export async function setPlatformSecret(
  key: string,
  plaintext: string,
  updatedBy?: string,
): Promise<void> {
  const ciphertext = encryptPlatformSecret(plaintext);
  const hint = secretHint(plaintext);
  const { error } = await adminDb.from("platform_secrets").upsert(
    {
      key,
      ciphertext,
      hint,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

export async function clearPlatformSecret(key: string): Promise<void> {
  const { error } = await adminDb.from("platform_secrets").delete().eq("key", key);
  if (error) throw new Error(error.message);
}

export async function listSecretStatus(keys: string[]): Promise<SecretStatus[]> {
  const vault = new Map<string, string | null>();
  try {
    const { data } = await adminDb.from("platform_secrets").select("key,hint").in("key", keys);
    for (const row of data ?? []) {
      vault.set(row.key, row.hint);
    }
  } catch {
    /* ignore */
  }

  const metaMap = new Map(SECRET_CATALOG.map((s) => [s.key, s]));

  return keys.map((key) => {
    const meta = metaMap.get(key);
    const envNames = ENV_MAP[key] ?? [key.toUpperCase()];
    let base: Omit<SecretStatus, "label" | "category" | "description"> = {
      key,
      configured: false,
      source: "none",
      hint: null,
    };
    for (const e of envNames) {
      if (process.env[e]) {
        base = {
          key,
          configured: true,
          source: "env",
          hint: secretHint(process.env[e]!),
        };
        break;
      }
    }
    if (base.source === "none" && vault.has(key)) {
      base = {
        key,
        configured: true,
        source: "vault",
        hint: vault.get(key) ?? null,
      };
    }
    return {
      ...base,
      label: meta?.label ?? key,
      category: meta?.category ?? "security",
      description: meta?.description ?? "",
    };
  });
}
