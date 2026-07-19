// Brand config for AGENT TRED. Override via VITE_BRAND_* env vars if needed.
export const BRAND = {
  name: import.meta.env.VITE_BRAND_NAME ?? "AGENT TRED",
  tagline: import.meta.env.VITE_BRAND_TAGLINE ?? "AI Trading Workstation",
  logoInitial: import.meta.env.VITE_BRAND_LOGO_INITIAL ?? "AT",
  adminInitial: import.meta.env.VITE_BRAND_ADMIN_INITIAL ?? "AT",
  footerName: import.meta.env.VITE_BRAND_FOOTER_NAME ?? "AGENT TRED",
  fullName: import.meta.env.VITE_BRAND_FULL_NAME ?? "AGENT TRED — Signal Trading Platform",
  supportEmail: import.meta.env.VITE_BRAND_SUPPORT_EMAIL ?? "support@agenttred.local",
  /** Primary logo mark (PNG) */
  logoUrl: import.meta.env.VITE_BRAND_LOGO_URL ?? "/logo.png",
  /** Vector fallback */
  logoSvgUrl: import.meta.env.VITE_BRAND_LOGO_SVG_URL ?? "/logo.svg",
  faviconUrl: "/favicon.ico",
  icon192: "/icon-192.png",
  icon512: "/icon-512.png",
  ogImage: "/og-image.png",
};
