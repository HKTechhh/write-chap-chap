#!/usr/bin/env bash
# Restore a backup INTO THE RUNNING DATABASE. This overwrites current data, so it asks first.
#   deploy/restore-postgres.sh /var/backups/penspan/penspan-2026-01-01-0215.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."
FILE="${1:?Usage: restore-postgres.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

read -r -p "This REPLACES the current database with $FILE. Type 'restore' to continue: " answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
$COMPOSE stop api worker beat
$COMPOSE exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c "$FILE" | $COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
$COMPOSE start api worker beat
echo "Restore complete."
