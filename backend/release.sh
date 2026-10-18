#!/usr/bin/env bash
# Release step for the Django API.
# Runs on every deploy, before the service starts.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input

# Seed demo data on the very first deploy so the site isn't an empty shell.
# Set SEED_DEMO=false in your .env once you have real users.
#
# Compared case-insensitively on purpose: "True" (Python spelling) and "true"
# (shell spelling) must both enable it.
case "$(printf '%s' "${SEED_DEMO:-true}" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes)
    python manage.py seed_demo
    ;;
  *)
    echo "SEED_DEMO=${SEED_DEMO:-true} — skipping demo data seed."
    ;;
esac
