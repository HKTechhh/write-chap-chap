#!/usr/bin/env bash
# Build and (re)start the stack. Run ON THE DROPLET from anywhere:
#   /opt/penspan/deploy/deploy.sh
# The code must already be in /opt/penspan (see deploy/README.md) and .env must exist.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env is missing. Copy .env.example to .env and fill it in first." >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

$COMPOSE config --quiet            # fail fast on a bad compose file or missing variable
$COMPOSE build
$COMPOSE up -d --remove-orphans

echo "Waiting for the API to become healthy..."
for _ in $(seq 1 40); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$($COMPOSE ps -q api)" 2>/dev/null || true)"
  if [ "$state" = "healthy" ]; then
    echo "API healthy."
    $COMPOSE ps
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

echo "API did not become healthy in time. Recent logs:" >&2
$COMPOSE logs --tail=60 api >&2
exit 1
