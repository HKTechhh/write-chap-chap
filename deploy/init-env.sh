#!/usr/bin/env bash
# Create .env from .env.example with fresh random secrets. Run ON THE DROPLET.
# Refuses to overwrite an existing .env.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then
  echo ".env already exists; not touching it." >&2
  exit 1
fi

cp .env.example .env
chmod 600 .env

SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
DBPASS="$(openssl rand -hex 24)"
sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET}|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DBPASS}|" .env

echo "Created .env with a new SECRET_KEY and POSTGRES_PASSWORD."
echo "Now edit it: ACME_EMAIL, DOMAIN, and any API keys you have."
