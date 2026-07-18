import { defineTool } from "../types";
import { BRAND } from "@/lib/brand";

const INFO = {
  name: BRAND.fullName,
  brand: BRAND.name,
  tagline: BRAND.tagline,
  publicPages: ["/", "/pricing", "/faq", "/affiliate", "/privacy", "/terms", "/auth"],
  supportedExchanges: ["Binance", "Bybit", "OKX", "KuCoin", "MEXC", "MT5 Bridge", "DEX Bridge"],
  features: [
    "Telegram & webhook signal intake",
    "Hybrid regex + AI signal parser",
    "Adaptive risk engine per user",
    "Live execution + paper trading",
    "Signal quality gate + leaderboard",
    "Backtest engine + risk optimizer",
    "Crypto billing (NOWPayments + manual USDT)",
    "Admin Control Center",
    "Affiliate program with payouts",
  ],
};

export default defineTool({
  name: "get_app_info",
  title: "Get app info",
  description: `Return public information about the ${BRAND.name} trading platform.`,
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: JSON.stringify(INFO, null, 2) }],
    structuredContent: INFO,
  }),
});
