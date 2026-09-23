# config/settings/base.py
#
# Django as API-only backend (doc07: "Django/DRF is the authoritative
# application/API backend; React never owns business truth"). Never
# renders the frontend — no templates app, no INSTALLED_APPS entry for
# django.contrib.staticfiles beyond what DRF's browsable API needs in dev.

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
    # Wizyfi Bridge apps — names match the existing repo (Expectations_and_workflow),
    # not doc10's generic apps/identity naming suggestion.
    "apps.common",
    "apps.accounts",
    "apps.organizations",
    "apps.places",
    "apps.connectors",
    "apps.devices",
    "apps.customers",
    "apps.access",
    "apps.portal",
    "apps.audit",
    "apps.notifications",
    "apps.platform_admin",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
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
# The product frontend is served entirely by the separate React app; Django
# renders no product-facing templates (doc: "must not render the main frontend").
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

DATABASES = {"default": env.db("DATABASE_URL")}

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL"),
    }
}

# Celery
CELERY_BROKER_URL = env("REDIS_URL")
CELERY_RESULT_BACKEND = env("REDIS_URL")
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)

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
    # camelCase at the JSON boundary only — every model/serializer field
    # stays normal Python snake_case internally (doc convention); this is
    # what the already-built frontend package's types (createdAt,
    # macAddress, durationMinutes, etc.) expect. Applies automatically to
    # every existing and future endpoint with zero per-serializer changes.
    "DEFAULT_RENDERER_CLASSES": (
        "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
    ),
    "DEFAULT_PARSER_CLASSES": (
        "djangorestframework_camel_case.parser.CamelCaseJSONParser",
    ),
    # doc11 "DoS/rate abuse" control — applies only where a view sets
    # throttle_classes/throttle_scope explicitly (apps.portal); the
    # authenticated provider API isn't globally throttled here.
    "DEFAULT_THROTTLE_RATES": {
        "portal": "60/min",
        "voucher_redeem": "10/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS — explicit allow-list only; never wildcard with credentials (doc11)
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

# Fernet key for connector credential encryption (Expectations_and_workflow)
CONNECTOR_CREDENTIALS_FERNET_KEY = env("CONNECTOR_CREDENTIALS_FERNET_KEY")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"  # store UTC, retain IANA tz on scheduled objects (doc08)
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Only serves django-admin's own static assets — the product frontend is a
# separately deployed React app and never touches this.
STATIC_URL = "static/"

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
