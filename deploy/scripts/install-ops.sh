#!/usr/bin/env bash
# Install backup cron + optional telegram-poller systemd unit for AGENT TRED
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT}"

chmod +x "$APP_DIR/deploy/scripts/backup-db.sh" \
         "$APP_DIR/deploy/scripts/restore-db.sh" \
         "$APP_DIR/deploy/scripts/cron-loop.sh" \
         "$APP_DIR/deploy/scripts/install-ops.sh" 2>/dev/null || true

mkdir -p /root/backups/agent-tred

# Daily backup at 03:15 UTC
CRON_LINE="15 3 * * * BACKUP_DIR=/root/backups/agent-tred $APP_DIR/deploy/scripts/backup-db.sh >> /var/log/agent-tred-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'backup-db.sh' || true; echo "$CRON_LINE" ) | crontab -
echo "Installed daily DB backup cron (03:15 UTC → /root/backups/agent-tred)"

# Telegram poller unit
if [ -f /etc/systemd/system/hermes-telegram-poller.service ] || [ -f "$APP_DIR/deploy/systemd/hermes-telegram-poller.service" ]; then
  cp "$APP_DIR/deploy/systemd/hermes-telegram-poller.service" /etc/systemd/system/hermes-telegram-poller.service
  # Inject CRON_SECRET from app env if present
  if grep -q '^CRON_SECRET=' "$APP_DIR/.env" 2>/dev/null; then
    SECRET=$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" | head -1 | cut -d= -f2-)
    # EnvironmentFile already loads .env; ensure CRON_SECRET available
    :
  fi
  systemctl daemon-reload
  systemctl enable --now hermes-telegram-poller.service
  echo "Enabled hermes-telegram-poller.service"
fi

echo "Ops install complete."
echo "Optional HTTPS: set DOMAIN=your.domain and run: caddy run --config $APP_DIR/deploy/Caddyfile.production"
echo "Optional sadmin lock: export SADMIN_IP_ALLOWLIST=1.2.3.4 and SADMIN_REQUIRE_MFA=1 in .env"
