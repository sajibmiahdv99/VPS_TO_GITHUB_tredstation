#!/bin/sh
# Hits Hermes cron hooks on a loop. Env: HERMES_BASE_URL, CRON_SECRET
set -eu
BASE="${HERMES_BASE_URL:-http://app:3000}"
SECRET="${CRON_SECRET:?CRON_SECRET required}"
INTERVAL="${CRON_INTERVAL_SEC:-10}"

hit() {
  path="$1"
  code=$(curl -sS -o /tmp/cron_out -w "%{http_code}" -X POST \
    -H "x-cron-secret: ${SECRET}" \
    -H "content-type: application/json" \
    "${BASE}${path}" || echo "000")
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ${path} -> ${code}"
}

echo "cron-loop starting base=${BASE} interval=${INTERVAL}s"
n=0
while true; do
  hit "/api/public/hooks/process-orders"
  hit "/api/public/hooks/monitor-positions"
  hit "/api/public/hooks/sync-positions"
  hit "/api/public/hooks/sync-balances"
  hit "/api/public/hooks/dispatch-notifications"
  hit "/api/public/hooks/monitor-anomalies"
  hit "/api/public/hooks/run-backtests"
  # Soft reconcile less often: every 6th cycle (~60s at 10s interval)
  n=$((n + 1))
  if [ $((n % 6)) -eq 0 ]; then
    hit "/api/public/hooks/reconcile-orders"
  fi
  sleep "$INTERVAL"
done
