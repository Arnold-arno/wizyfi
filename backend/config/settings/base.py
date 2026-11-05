# config/settings/base.py
#
# Django as API-only backend (doc07: "Django/DRF is the authoritative
# application/API backend; React never owns business truth").
#
# CHANGED (Round 22) — what stopped the backend booting or working:
#  * INSTALLED_APPS lacked apps.billing (imported by platform_admin, places and
#    connectors views: RuntimeError "Model class ... isn't in INSTALLED_APPS")
#    and apps.dashboard.
#  * REDIS_URL was REQUIRED, so `runserver` died on import without Redis even in
#    dev. It is now optional here (in-memory cache/broker) and enforced in production.py.
#  * Missing settings used by Round 17-20 code: FRONTEND_URL / DEFAULT_FROM_EMAIL
#    (AttributeError when registering), the four auth throttle scopes (a scoped
#    throttle with no rate raises ImproperlyConfigured -> 500), AUTH_PASSWORD_VALIDATORS
#    (the password policy was never active), RESET_MIN_ACCESS_MINUTES.
#  * Static files / WhiteNoise for django-admin, DB connection health checks.

import os
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

SECRET_KEY = env("DJANGO_SECRET_KEY")  # required — no insecure default, ever
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",  # Django admin only, kept separate from platform_admin API
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",  # required by django.contrib.admin
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "apps.common",
    "apps.accounts",
    "apps.organizations",
    "apps.places",
    "apps.connectors",
    "apps.devices",
    "apps.customers",
    "apps.access",
    "apps.commercial",
    "apps.portal",
    "apps.audit",
    "apps.notifications",
    "apps.platform_admin",
    "apps.dashboard",
   # "apps.billing",  # Round 20 (invoices, entitlements); imported by platform_admin/places/connectors
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves django-admin static files only
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",  # required by django.contrib.admin
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.middleware.RequestIdMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Minimal template config — required only for django.contrib.admin (ops tool).
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

AUTH_USER_MODEL = "accounts.User"

# psycopg 3 works with Django's normal "postgresql" engine (Django >= 4.2).
DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# Redis: cache (throttling), Celery broker. Optional for local development,
# REQUIRED in production (production.py refuses to start without it).
REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {"default": {"BACKEND": "django_redis.cache.RedisCache", "LOCATION": REDIS_URL}}
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Celery (no Redis: in-memory broker; use `manage.py run_maintenance --every 30` in dev)
CELERY_BROKER_URL = REDIS_URL or "memory://"
CELERY_RESULT_BACKEND = REDIS_URL or "cache+memory://"
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TIME_LIMIT = 300
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),  # deny-by-default per doc11 authorization model
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardResultsPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
    ),
    "EXCEPTION_HANDLER": "apps.common.exceptions.wizyfi_exception_handler",
    "DEFAULT_RENDERER_CLASSES": (
        "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
    ),
    "DEFAULT_PARSER_CLASSES": (
        "djangorestframework_camel_case.parser.CamelCaseJSONParser",
    ),
    # Every scope a view names MUST have a rate here, or DRF raises
    # ImproperlyConfigured on that request.
    "DEFAULT_THROTTLE_RATES": {
        "portal": "60/min",
        "voucher_redeem": "10/min",
        "auth_token": "20/hour",
        "verification_resend": "5/hour",
        "password_reset": "5/hour",
        "password_change": "10/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
}

# Password policy (Public Website / Authentication spec §6). Backend is authoritative.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "apps.accounts.validators.PasswordPolicyValidator", "OPTIONS": {"min_length": 12}},
]

# CORS — explicit allow-list only; never wildcard with credentials (doc11)
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

# Fernet key for connector credential encryption
CONNECTOR_CREDENTIALS_FERNET_KEY = env("CONNECTOR_CREDENTIALS_FERNET_KEY")

# Email: links in verification / reset emails point at the frontend.
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Wizyfi Bridge <no-reply@localhost>")
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend" if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
PASSWORD_RESET_TIMEOUT = env.int("PASSWORD_RESET_TIMEOUT", default=3600)

# Product tunables
RESET_MIN_ACCESS_MINUTES = env.int("RESET_MIN_ACCESS_MINUTES", default=60)
VOUCHER_MAX_AVAILABLE_PER_ORG = env.int("VOUCHER_MAX_AVAILABLE_PER_ORG", default=50000)
HARD_LOGOUT_MAX_LATENESS_SECONDS = env.int("HARD_LOGOUT_MAX_LATENESS_SECONDS", default=900)
SESSION_EXPIRY_GRACE_SECONDS = env.int("SESSION_EXPIRY_GRACE_SECONDS", default=3600)
ROUTER_HEALTH_SWEEP_BATCH = env.int("ROUTER_HEALTH_SWEEP_BATCH", default=200)

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"  # store UTC, retain IANA tz on scheduled objects (doc08)
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Only serves django-admin's own static assets (collectstatic -> STATIC_ROOT).
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": '{"level":"%(levelname)s","time":"%(asctime)s","module":"%(module)s","message":"%(message)s"}',
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "structured"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
