#!/usr/bin/env bash
# Render build step for the Django API.
# Runs on every deploy, before the service starts.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input

# Seed demo data on the very first deploy so the site isn't an empty shell.
# Set SEED_DEMO=false in the Render dashboard once you have real users.
if [ "${SEED_DEMO:-true}" = "true" ]; then
  python manage.py seed_demo
fi
