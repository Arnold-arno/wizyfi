# config/settings/test.py
#
# Self-contained test settings: sets required env vars before importing
# base.py, so `pytest` runs with zero setup (no .env file needed) in any
# environment, including CI.

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-secret-key-not-for-production-use-only")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("ALLOWED_HOSTS", "testserver,localhost")
os.environ.setdefault("DATABASE_URL", "sqlite:///test_db.sqlite3")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://testserver")
os.environ.setdefault(
    "CONNECTOR_CREDENTIALS_FERNET_KEY", "oUZz-88wU6FtTFeVQOLYnzwtPZ9i3crRDtYTH2V0an8="
)
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "True")

from .base import *  # noqa: E402,F401,F403

# Fast, insecure password hashing — never use MD5PasswordHasher outside tests.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Self-contained: no external Redis needed to run the suite, including
# tests that exercise throttling (apps.portal).
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
