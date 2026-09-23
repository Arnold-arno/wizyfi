# config/settings/dev.py
from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]
CORS_ALLOWED_ORIGINS = env.list(  # noqa: F405
    "CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"]
)
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = (  # noqa: F405
    "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
    "djangorestframework_camel_case.render.CamelCaseBrowsableAPIRenderer",
)

# Local dev shouldn't require a running Redis server just to exercise
# caching/throttling (apps.portal). Production (config/settings/production.py)
# stays on django_redis via REDIS_URL — this override is dev-only.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
