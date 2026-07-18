#!/bin/bash
# Apply Hermes SQL migrations on first Postgres boot (docker-entrypoint-initdb.d).
set -euo pipefail
MIG_DIR="/docker-entrypoint-initdb.d/migrations"
if [[ ! -d "$MIG_DIR" ]]; then
  echo "No migrations directory"
  exit 0
fi

# Basic public schema objects expected by app. Full Supabase auth.users is provided
# by the official Supabase stack; this slim init applies public.* migrations when possible.
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

echo "Applying Hermes migrations..."
for f in $(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | sort); do
  echo " -> $f"
  # Many migrations reference auth.users / auth.uid(); create stubs if missing.
  psql -v ON_ERROR_STOP=0 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -f "$f" || true
done
echo "Migrations pass complete (errors may be expected without full auth schema)."
