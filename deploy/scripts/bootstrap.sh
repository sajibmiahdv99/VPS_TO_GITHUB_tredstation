#!/usr/bin/env bash
# Generate secrets and write deploy/.env for first boot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT}/deploy/.env"

rand_hex() { openssl rand -hex "${1:-32}"; }
rand_b64() { openssl rand -base64 32 | tr -d '\n'; }

if [[ -f "$ENV_FILE" ]]; then
  echo "deploy/.env already exists — not overwriting. Remove it to regenerate."
  exit 0
fi

DOMAIN="${DOMAIN:-localhost}"
JWT_SECRET="$(rand_hex 32)"
ANON_KEY="${ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder-anon}"
SERVICE_KEY="${SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder-service}"

# Note: For full Supabase JWT keys, generate with supabase start or use their jwt tool.
# Placeholders work only with matching GoTrue JWT_SECRET configuration.

cat > "$ENV_FILE" <<EOF
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) — do not commit
DOMAIN=${DOMAIN}
PUBLIC_APP_URL=https://${DOMAIN}

# Postgres
POSTGRES_PASSWORD=$(rand_hex 16)
POSTGRES_DB=postgres
POSTGRES_USER=postgres

# Supabase / GoTrue
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_KEY}
SUPABASE_URL=http://kong:8000
SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}
VITE_SUPABASE_URL=https://${DOMAIN}/supabase
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local

# App secrets
CRON_SECRET=$(rand_hex 24)
PRICE_RELAY_SECRET=$(rand_hex 24)
EXCHANGE_ENCRYPTION_KEY=$(rand_b64)
TELEGRAM_SESSION_ENC_KEY=$(rand_b64)
PLATFORM_SECRETS_KEY=$(rand_b64)
PAYMENT_WEBHOOK_SECRET=$(rand_hex 24)

# Optional integrations (set in Admin Control Center or here)
# NOWPAYMENTS_API_KEY=
# RESEND_API_KEY=
# EMAIL_FROM=Hermes <noreply@${DOMAIN}>
# TELEGRAM_BOT_TOKEN=
# AI_API_KEY=
# AI_GATEWAY_URL=https://openrouter.ai/api/v1/chat/completions
# AI_MODEL=google/gemini-2.0-flash-001

# First admin (used by seed script if present)
ADMIN_EMAIL=admin@${DOMAIN}
ADMIN_PASSWORD=$(rand_hex 8)
EOF

echo "Wrote ${ENV_FILE}"
echo "Admin email: admin@${DOMAIN}"
echo "Set real Supabase ANON_KEY / SERVICE_ROLE_KEY after starting the Supabase stack (see docs/DEPLOY_VPS.md)."
