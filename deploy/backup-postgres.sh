#!/usr/bin/env bash
# Nightly Postgres backup. Run ON THE DROPLET (cron installs it, see deploy/README.md).
# Writes /var/backups/penspan/penspan-YYYY-MM-DD-HHMM.sql.gz and keeps 14 days.
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/penspan}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F-%H%M)"
TARGET="$BACKUP_DIR/penspan-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
umask 077

# pg_dump runs inside the db container, which already has the credentials.
docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$TARGET.partial"

# Only keep it if it is a plausible dump, never a zero-byte file from a failed run.
if [ "$(stat -c %s "$TARGET.partial")" -lt 1024 ]; then
  rm -f "$TARGET.partial"
  echo "Backup looks empty, aborting." >&2
  exit 1
fi
mv "$TARGET.partial" "$TARGET"

find "$BACKUP_DIR" -name 'penspan-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "Backup written: $TARGET ($(du -h "$TARGET" | cut -f1))"
