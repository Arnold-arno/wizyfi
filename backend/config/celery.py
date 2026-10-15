# config/celery.py
#
# Celery app for Wizyfi Bridge. Redis is the broker only, never the system of
# record (doc07): every schedule lives in PostgreSQL and is re-discovered by
# the beat sweep, so a lost broker message or a worker restart cannot lose a
# Hard Logout.
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

app = Celery("wizyfi_bridge")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
