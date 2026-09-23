# config/settings/production.py
from .base import *  # noqa: F401,F403

DEBUG = False

# Fail loudly at boot if these aren't set — never silently fall back
# to a permissive default in production (doc11: deny by default).
if not ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("ALLOWED_HOSTS must be set in production")
if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    raise RuntimeError("CORS_ALLOWED_ORIGINS must be set in production")

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
