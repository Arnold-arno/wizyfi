# config/settings/production.py
# CHANGED (Round 22): requires REDIS_URL and a real FRONTEND_URL; removed
# SECURE_BROWSER_XSS_FILTER (deleted from Django in 4.0); static storage for admin.
from .base import *  # noqa: F401,F403

DEBUG = False

# Fail loudly at boot if these aren't set — never silently fall back
# to a permissive default in production (doc11: deny by default).
if not ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("ALLOWED_HOSTS must be set in production")
if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    raise RuntimeError("CORS_ALLOWED_ORIGINS must be set in production")
if not REDIS_URL:  # noqa: F405
    raise RuntimeError("REDIS_URL must be set in production (throttling, cache and Celery need it)")
if FRONTEND_URL.startswith("http://"):  # noqa: F405
    raise RuntimeError("FRONTEND_URL must be the public https:// address of the frontend")

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

SECURE_SSL_REDIRECT = True
SECURE_REDIRECT_EXEMPT = [r"^healthz/?$"]  # load-balancer probes speak plain HTTP
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
