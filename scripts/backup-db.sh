#!/usr/bin/env bash
# Logical backup of Zenith HR Postgres (gzip SQL).
# Usage (host Postgres):
#   DATABASE_URL=postgresql://zenith:zenith@localhost:5432/zenith_hr ./scripts/backup-db.sh
# Usage (compose):
#   docker compose --profile backup run --rm db-backup

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/zenith_hr_${STAMP}.sql.gz"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Backing up via DATABASE_URL → $OUT_FILE"
  pg_dump "$DATABASE_URL" --no-owner --format=plain | gzip -c > "$OUT_FILE"
else
  HOST="${POSTGRES_HOST:-localhost}"
  PORT="${POSTGRES_PORT:-5432}"
  USER_NAME="${POSTGRES_USER:-zenith}"
  DB_NAME="${POSTGRES_DB:-zenith_hr}"
  export PGPASSWORD="${POSTGRES_PASSWORD:-zenith}"
  echo "Backing up ${USER_NAME}@${HOST}:${PORT}/${DB_NAME} → $OUT_FILE"
  pg_dump -h "$HOST" -p "$PORT" -U "$USER_NAME" -d "$DB_NAME" --no-owner --format=plain | gzip -c > "$OUT_FILE"
fi

ls -lh "$OUT_FILE"
echo "Done."
