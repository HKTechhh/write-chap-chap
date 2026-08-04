"""Django settings for the Write Chap Chap platform."""
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY", default="dev-only-insecure-key-change-in-production")
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

def _as_origin(value):
    """Managed hosts hand out bare `host:port`; CSRF/CORS need a scheme."""
    value = (value or "").strip().rstrip("/")
    if not value:
        return ""
    return value if value.startswith("http") else f"https://{value}"


FRONTEND_URL = _as_origin(config("FRONTEND_URL", default="http://localhost:5173"))

# Render injects the service's public hostname at runtime; without this the
# deployed API would 400 every request with DisallowedHost.
RENDER_EXTERNAL_HOSTNAME = config("RENDER_EXTERNAL_HOSTNAME", default="")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

CSRF_TRUSTED_ORIGINS = [
    origin
    for origin in (
        FRONTEND_URL,
        f"https://{RENDER_EXTERNAL_HOSTNAME}" if RENDER_EXTERNAL_HOSTNAME else "",
    )
    if origin.startswith("http")
]

if not DEBUG:
    # Render terminates TLS at its proxy, so Django only ever sees plain HTTP.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    # Local
    "apps.accounts",
    "apps.orders",
    "apps.payments",
    "apps.messaging",
    "apps.checks",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------- database
_database_url = config("DATABASE_URL", default="")
if _database_url:
    from urllib.parse import unquote, urlparse

    _parsed = urlparse(_database_url)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": unquote(_parsed.path.lstrip("/")),
            # Managed providers generate passwords containing URL-escaped
            # characters, so these have to be unquoted rather than used raw.
            "USER": unquote(_parsed.username or ""),
            "PASSWORD": unquote(_parsed.password or ""),
            "HOST": _parsed.hostname,
            "PORT": _parsed.port or 5432,
            "CONN_MAX_AGE": config("CONN_MAX_AGE", default=600, cast=int),
            "OPTIONS": {"sslmode": config("DB_SSLMODE", default="require")},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Managed hosts give you an ephemeral disk: anything a user uploads is lost on
# the next deploy. Point these at S3/R2/Spaces and uploads survive.
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
if AWS_STORAGE_BUCKET_NAME:
    AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
    AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default="") or None
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="auto")
    AWS_S3_CUSTOM_DOMAIN = config("AWS_S3_CUSTOM_DOMAIN", default="") or None
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    # Deliverables, KYC documents and dispute evidence are private by design —
    # they are served through time-limited signed URLs, never public reads.
    AWS_QUERYSTRING_AUTH = True
    AWS_QUERYSTRING_EXPIRE = config("AWS_QUERYSTRING_EXPIRE", default=3600, cast=int)
    STORAGES["default"] = {"BACKEND": "storages.backends.s3.S3Storage"}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Write Chap Chap API",
    "DESCRIPTION": "Freelance writing marketplace with escrow, quality enforcement and AI screening.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# The deployed frontend's origin. Kept in source alongside the dev origins
# because relying on the host to inject it failed repeatedly — env vars
# declared in render.yaml never reached the running service, leaving the API
# rejecting every browser request from its own frontend. An env var still
# overrides; this is the floor, not the ceiling. Update if the site is renamed.
DEPLOYED_FRONTEND_ORIGIN = "https://wcc-web.onrender.com"

CORS_ALLOWED_ORIGINS = [
    origin
    for origin in (
        _as_origin(value)
        for value in config(
            "CORS_ALLOWED_ORIGINS",
            default="http://localhost:5173,http://127.0.0.1:5173",
            cast=Csv(),
        )
    )
    if origin
]

for _origin in (FRONTEND_URL, DEPLOYED_FRONTEND_ORIGIN):
    if _origin and _origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_origin)

if DEPLOYED_FRONTEND_ORIGIN not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(DEPLOYED_FRONTEND_ORIGIN)

CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------- celery
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://localhost:6379/1")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = config("CELERY_TASK_ALWAYS_EAGER", default=False, cast=bool)

CELERY_BEAT_SCHEDULE = {
    "check-overdue-orders": {
        "task": "apps.orders.tasks.check_overdue_orders",
        "schedule": 3600.0,  # hourly
    },
    "auto-approve-stale-submissions": {
        "task": "apps.orders.tasks.auto_approve_stale_submissions",
        "schedule": 3600.0,
    },
    "recalculate-writer-tiers": {
        "task": "apps.accounts.tasks.recalculate_all_writer_tiers",
        "schedule": 86400.0,  # daily
    },
}

# ---------------------------------------------------------------- platform economics
PLATFORM_FEE_PERCENT = config("PLATFORM_FEE_PERCENT", default=12, cast=int)
PLATFORM_FEE_PERCENT_PRO = config("PLATFORM_FEE_PERCENT_PRO", default=5, cast=int)
WITHDRAWAL_FEE_FLAT = config("WITHDRAWAL_FEE_FLAT", default=50, cast=int)
LATE_FINE_PERCENT_PER_DAY = config("LATE_FINE_PERCENT_PER_DAY", default=5, cast=int)
LATE_FINE_MAX_PERCENT = config("LATE_FINE_MAX_PERCENT", default=25, cast=int)
REVISION_WINDOW_HOURS = config("REVISION_WINDOW_HOURS", default=72, cast=int)
HUMANIZATION_PRICE_PER_PAGE = config("HUMANIZATION_PRICE_PER_PAGE", default=50, cast=int)
HUMANIZATION_WORDS_PER_PAGE = config("HUMANIZATION_WORDS_PER_PAGE", default=250, cast=int)
DOCUMENT_CHECK_PRICE = config("DOCUMENT_CHECK_PRICE", default=150, cast=int)

AI_CONTENT_THRESHOLD = config("AI_CONTENT_THRESHOLD", default=20, cast=int)
PLAGIARISM_THRESHOLD = config("PLAGIARISM_THRESHOLD", default=15, cast=int)

GPTZERO_API_KEY = config("GPTZERO_API_KEY", default="")
GPTZERO_API_URL = config("GPTZERO_API_URL", default="https://api.gptzero.me/v2/predict/text")

MPESA_ENVIRONMENT = config("MPESA_ENVIRONMENT", default="sandbox")
MPESA_CONSUMER_KEY = config("MPESA_CONSUMER_KEY", default="")
MPESA_CONSUMER_SECRET = config("MPESA_CONSUMER_SECRET", default="")
MPESA_SHORTCODE = config("MPESA_SHORTCODE", default="")
MPESA_PASSKEY = config("MPESA_PASSKEY", default="")
MPESA_CALLBACK_URL = config("MPESA_CALLBACK_URL", default="")

FLUTTERWAVE_PUBLIC_KEY = config("FLUTTERWAVE_PUBLIC_KEY", default="")
FLUTTERWAVE_SECRET_KEY = config("FLUTTERWAVE_SECRET_KEY", default="")

WHATSAPP_SUPPORT_NUMBER = config("WHATSAPP_SUPPORT_NUMBER", default="254700000000")

# Number of contact-leak strikes before a writer is auto-suspended.
CONTACT_LEAK_STRIKE_LIMIT = config("CONTACT_LEAK_STRIKE_LIMIT", default=3, cast=int)
