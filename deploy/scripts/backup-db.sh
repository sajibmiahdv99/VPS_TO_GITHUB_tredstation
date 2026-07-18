#!/usr/bin/env bash
# Daily Postgres backup for AGENT TRED (Supabase db container)
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/root/backups/agent-tred}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER="${DB_CONTAINER:-supabase-db}"
mkdir -p "$BACKUP_DIR"

# Load password from supabase .env without sourcing whole file
ENV_FILE="${SUPABASE_ENV:-/root/supabase-docker/.env}"
POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)
STAMP=$(date -u +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/pg_${STAMP}.sql.gz"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
  pg_dump -U postgres -d postgres --no-owner --clean --if-exists \
  | gzip -c > "$OUT"

# checksum
sha256sum "$OUT" > "${OUT}.sha256"
# prune
find "$BACKUP_DIR" -name 'pg_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'pg_*.sha256' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
echo "Backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
