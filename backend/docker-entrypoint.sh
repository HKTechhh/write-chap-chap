#!/usr/bin/env bash
# Container entrypoint for the Django image (API, Celery worker, Celery beat).
#
# Only the API container runs migrations and collectstatic (RUN_MIGRATIONS=1),
# so the worker and beat never race it. Everything else just execs its command.
set -o errexit

case "${SECRET_KEY:-}" in
  ""|dev-only*|change-me*)
    echo "SECRET_KEY is unset or still a placeholder. Set a real one in .env." >&2
    exit 1
    ;;
esac

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py collectstatic --no-input
  python manage.py migrate --no-input

  # Demo data is for testing only: every demo account shares a published password.
  # Compared case-insensitively so "True" (Python spelling) and "true" both work.
  case "$(printf '%s' "${SEED_DEMO:-false}" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes)
      python manage.py seed_demo
      ;;
    *)
      echo "SEED_DEMO=${SEED_DEMO:-false}: skipping demo data."
      ;;
  esac
fi

exec "$@"
