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
#
# Compared case-insensitively on purpose: render.yaml declares this as "True"
# (YAML/Python spelling) while shell conventions write "true". An exact match
# against one spelling skips the seed silently, which is exactly what happened
# on the first successful deploy.
case "$(printf '%s' "${SEED_DEMO:-true}" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    python manage.py seed_demo
    ;;
  *)
    echo "SEED_DEMO=${SEED_DEMO:-true} — skipping demo data seed."
    ;;
esac
