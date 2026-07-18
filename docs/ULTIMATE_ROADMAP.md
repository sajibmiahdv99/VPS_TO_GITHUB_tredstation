# Ultimate roadmap (post VPS foundation)

First delivery (done in this repo pass):

- [x] Remove Lovable / Node Nitro deploy
- [x] Docker + workers + deploy docs
- [x] Admin Control Center + secrets vault
- [x] Crypto billing (NOWPayments + manual USDT)
- [x] Stripe/Paddle stubs hidden
- [x] Plan entitlements free_trial / starter / pro / premium_vip
- [x] 7-layer affiliate + ranks + rank bonus UI
- [x] Super-admin promo codes + `/sadmin` portal
- [x] Signal source plan gating
- [x] Staff RBAC (finance / operations / super)
- [x] Rate limits on public webhooks
- [x] Health endpoint + observability stub
- [x] DB backup + restore scripts + install-ops cron
- [x] Caddy HTTPS scaffold
- [x] Reconcile hook + telegram poller worker
- [x] Email templates (Resend) fill/SL/margin
- [x] Audit export + promo analytics
- [x] sadmin MFA gate + IP allowlist env
- [x] Exchange stubs: Bitget, Gate.io, Coinbase, Kraken
- [x] Affiliate public page + en/bn i18n nav + PWA manifest

## Phase 1 — Core hardening
1. Activate Stripe/Paddle from Control Center + Checkout Sessions
2. [x] Transactional email templates (fill / SL / margin) — needs RESEND_API_KEY
3. [x] Two-way exchange reconcile (baseline + sync-positions)
4. [x] Sentry DSN stub (set SENTRY_DSN)

## Phase 2 — Exchange expansion
5. [partial] Bitget, Gate.io, Coinbase, Kraken — **stubs** (validate only); live REST next
6. MT5 bridge EA package (bridge adapter exists)
7. DEX executors (Hyperliquid / GMX / dYdX) — dex_bridge stub
8. Spot + options modes

## Phase 3 — Intelligence
9. Signal quality score + auto-mute (partial in-app)
10. News/sentiment gating
11. Portfolio-level risk / correlation
12. AI strategy assistant chat

## Phase 4 — Marketplace v2
13. Leaderboard discovery (basic live)
14. Revenue share auto-payout
15. Public strategy profiles (SEO)
16. Comments / reviews + moderation

## Phase 5 — Compliance & enterprise
17. Live KYC (Sumsub / Persona)
18. [x] Audit export pack (`/sadmin/export`)
19. Public REST/GraphQL API keys
20. [x] Team seats / staff roles matrix

## Phase 6 — Mobile & UX
21. Capacitor / RN app
22. WebSocket live UI (price-relay)
23. [x] Onboarding wizard
24. [partial] i18n: en + bn (hi/es/ru next)

## Phase 7 — Ecosystem
25. TradingView embed
26. Public data API
27. Chrome extension
28. Discord / Slack bots

## Ops checklist (this VPS)

```bash
# Backups + telegram poller
chmod +x deploy/scripts/*.sh
./deploy/scripts/install-ops.sh

# HTTPS (when DNS ready)
# DOMAIN=your.domain caddy run --config deploy/Caddyfile.production

# Lock super-admin
# SADMIN_IP_ALLOWLIST=your.office.ip  SADMIN_REQUIRE_MFA=1
```
