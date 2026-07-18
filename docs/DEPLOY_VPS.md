# Deploy Hermes on a VPS (zero Lovable)

This guide runs **Hermes Agent Workstation** fully self-hosted: Node app, Postgres/Supabase, cron workers, optional price relay. **No Lovable Cloud** connection.

## Requirements

| Resource | Recommendation |
|----------|----------------|
| RAM | **4–8 GB** (full Supabase) or 2 GB (app + external Supabase) |
| CPU | 2+ vCPU |
| Disk | 40+ GB SSD |
| OS | Ubuntu 22.04/24.04 |
| Domain | DNS A/AAAA → VPS IP |
| Docker | Docker Engine 24+ + Compose plugin |

## Architecture

```
Internet → Caddy (TLS) → Hermes app (Nitro Node :3000)
                       → Supabase Kong (/supabase)
Cron container → POST /api/public/hooks/* (x-cron-secret)
Price-relay → POST /api/public/hooks/price-tick (x-relay-secret)
```

## 1. Clone & bootstrap secrets

```bash
git clone <your-fork-or-repo> hermes && cd hermes
chmod +x deploy/scripts/*.sh
./deploy/scripts/bootstrap.sh
# edit deploy/.env — DOMAIN, keys, optional NOWPayments, etc.
```

## 2. Self-hosted Supabase (recommended)

Use the official stack so Auth (email/password, Google, MFA), Realtime, and Storage work:

```bash
# Example: sibling directory
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker
cp .env.example .env
# Set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
# Generate keys: https://supabase.com/docs/guides/self-hosting/docker
docker compose up -d
```

Apply Hermes migrations against that database:

```bash
# From hermes repo
export DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/postgres
for f in $(ls supabase/migrations/*.sql | sort); do
  psql "$DATABASE_URL" -f "$f"
done
```

Point Hermes env at Kong (or public URL):

```env
SUPABASE_URL=https://your-domain/supabase   # or http://kong:8000 on docker network
SUPABASE_PUBLISHABLE_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
VITE_SUPABASE_URL=https://your-domain/supabase
VITE_SUPABASE_PUBLISHABLE_KEY=<anon>
```

### First admin

```sql
-- After signup via /auth, grant admin:
insert into public.user_roles (user_id, role)
values ('<uuid-from-auth.users>', 'admin')
on conflict do nothing;
```

## 3. Start Hermes compose

```bash
cd deploy
docker compose --env-file .env up -d --build
# optional TLS proxy + price relay:
docker compose --env-file .env --profile with-tls --profile with-relay up -d --build
```

App: `http://VPS_IP:3000` or `https://DOMAIN` with Caddy profile.

## 4. Admin Control Center

1. Sign in as admin → **Admin → Control Center**
2. Enable **NOWPayments** and/or **Manual USDT**
3. Paste `nowpayments_api_key` + `nowpayments_ipn_secret` (or set env)
4. Set manual USDT TRC20 address
5. Keep **Stripe / Paddle** toggles **off** (ready-but-hidden)
6. Optional: Resend, Telegram bot, AI API key

Payment webhook URL:

`https://YOUR_DOMAIN/api/public/payment-webhook`

## 5. Crypto billing

- Users: **Billing** → Pay with crypto (NOWPayments) or Manual USDT
- Manual: user clicks **I paid** → admin **Payments → Confirm**
- NOWPayments: IPN auto-activates subscription

## 6. Cron & price relay

Compose service `cron` posts every `CRON_INTERVAL_SEC` (default 10s):

- process-orders, monitor-positions, sync-positions, sync-balances
- dispatch-notifications, monitor-anomalies, run-backtests

Price relay (profile `with-relay`) pushes Binance/Bybit mark prices.

## 7. Google OAuth (optional)

In GoTrue / Supabase Auth dashboard (self-hosted):

- Enable Google provider
- Redirect URL: `https://YOUR_DOMAIN/auth/callback` (Supabase default) and site URL `https://YOUR_DOMAIN`

App uses native `supabase.auth.signInWithOAuth({ provider: 'google' })`.

## 8. Security checklist

- [ ] `.env` not committed; rotate any keys that were ever public
- [ ] `EXCHANGE_ENCRYPTION_KEY` / `PLATFORM_SECRETS_KEY` backed up offline
- [ ] Firewall: only 80/443 public; Postgres not exposed
- [ ] Studio bound to localhost or VPN only
- [ ] Global pause tested in Control Center

## 9. No Lovable

Removed / replaced:

| Was | Now |
|-----|-----|
| Lovable Cloud Auth | Supabase native OAuth |
| `ai.gateway.lovable.dev` | `AI_GATEWAY_URL` + `AI_API_KEY` |
| Resend via Lovable connector | Direct Resend API |
| Cloudflare Workers Nitro | `node-server` preset |
| `@lovable.dev/*` packages | Removed |

## 10. Ultimate roadmap

See project plan: after this VPS foundation, phases cover KYC live, more exchanges, marketplace v2, mobile, etc. Mockups (KYC UI, support, etc.) remain usable; providers activate from Control Center as you add keys.
