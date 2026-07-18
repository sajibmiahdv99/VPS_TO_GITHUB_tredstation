# White-Label Groundwork

Hermes ships branding as a small config layer so a remixed instance can be
re-skinned by setting env vars instead of grepping the codebase. This is
**groundwork only** — it does not provision new instances, deploy anything,
or share anything across instances.

## What is config-driven today

Four shell / nav / auth surfaces read from `src/lib/brand.ts`, which reads
Vite env vars with defaults that reproduce the original Hermes strings
byte-for-byte:

- `src/lib/brand.ts` — the single `BRAND` object.
- `src/components/AppShell.tsx` — sidebar + mobile header logo, name, tagline.
- `src/components/AdminShell.tsx` — admin sidebar logo and sub-label.
- `src/components/PublicNav.tsx` — public nav logo/name + footer copyright.
- `src/routes/auth.tsx` — `<title>` and sign-in card logo/name.

Environment variables (all optional; defaults in parentheses):

| Variable                    | Default                     |
| --------------------------- | --------------------------- |
| `VITE_BRAND_NAME`           | `Hermes`                    |
| `VITE_BRAND_TAGLINE`        | `Workstation`               |
| `VITE_BRAND_LOGO_INITIAL`   | `H`                         |
| `VITE_BRAND_ADMIN_INITIAL`  | `A`                         |
| `VITE_BRAND_FOOTER_NAME`    | `Hermes Agent Workstation`  |

Setting none of these leaves the app pixel-for-pixel identical to today.

## What is NOT templated (intentional)

These need real per-brand content, not variable substitution:

- **`public/manifest.webmanifest`** — `name`, `short_name`, `description`,
  and theme colors. Static asset; Vite env vars do not reach it at build
  time. Edit by hand per instance.
- **App icons** in `public/` (favicon, apple-touch-icon, PWA icons).
  Replace the image files per brand.
- **Marketing copy** in `src/routes/index.tsx`, `src/routes/pricing.tsx`,
  `src/routes/faq.tsx`, `src/routes/affiliate.tsx`, and the legal pages.
  These are real content, not templated — rewrite them per brand rather
  than stuffing them behind variables.

## Remix workflow (high level)

Provisioning a new white-label instance is a **deliberate operational
action** taken per affiliate when one is actually ready. Nothing in this
codebase should do it automatically, and no automation in this pass does.

When an operator decides to spin up a new instance:

1. **Fork the project** (e.g. Lovable's remix feature) to get an
   independent codebase for the new brand.
2. **Provision its own Supabase / Lovable Cloud backend.** Never share a
   database across brands — each white-label tenant gets full data
   isolation (users, orders, exchange credentials, Telegram sessions).
3. **Set the brand env vars** from the table above in the new project's
   settings.
4. **Edit** `public/manifest.webmanifest`, replace icons in `public/`,
   and rewrite marketing copy on `/`, `/pricing`, `/faq`, `/affiliate`,
   `/privacy`, `/terms` for the new brand.
5. **Connect a custom domain** for the new instance.
6. **Set up its own operational secrets independently** — `CRON_SECRET`,
   `PRICE_RELAY_SECRET`, `EXCHANGE_ENCRYPTION_KEY`,
   `TELEGRAM_SESSION_ENC_KEY`, `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`,
   `LOVABLE_API_KEY`, and any payment-provider keys. **Never reuse
   secrets across instances**: a leak in one brand must not compromise
   any other.
7. **Reconfigure external callers** (cron scheduler, self-hosted
   execution worker, self-hosted price relay) to point at the new
   instance's URL and use its dedicated secrets.

The above is a checklist for humans, not a script. Do not attempt to
automate it from inside this app.
