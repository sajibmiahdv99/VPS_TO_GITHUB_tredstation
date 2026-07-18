#!/usr/bin/env bash
# Restore from gzip dump. DANGEROUS — overwrites DB.
# Usage: ./restore-db.sh /root/backups/agent-tred/pg_YYYYMMDD_HHMMSS.sql.gz
set -euo pipefail
FILE="${1:?usage: restore-db.sh backup.sql.gz}"
CONTAINER="${DB_CONTAINER:-supabase-db}"
ENV_FILE="${SUPABASE_ENV:-/root/supabase-docker/.env}"
POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)

echo "Restoring $FILE into $CONTAINER (will overwrite)..."
gunzip -c "$FILE" | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1
echo "Restore finished."
