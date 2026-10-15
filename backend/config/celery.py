# config/celery.py
#
# Celery app for Wizyfi Bridge. Redis is the broker only, never the system of
# record (doc07): every schedule lives in PostgreSQL and is re-discovered by
# the beat sweeps, so a lost broker message or a worker restart cannot lose a
# Hard Logout or leave a session un-expired.
#
# CHANGED (Round 15): the beat schedule now lives HERE as defaults, so deploying
# the code is enough — no manual edit of settings. Anything you define in
# settings (CELERY_BEAT_SCHEDULE) with the same key still wins.
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

app = Celery("wizyfi_bridge")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

DEFAULT_BEAT_SCHEDULE = {
    # Starts due Hard Logouts and resumes ones whose worker died.
    "dispatch-due-hard-logouts": {
        "task": "wizyfi.dispatch_due_hard_logout_events",
        "schedule": 15.0,
    },
    # Ends sessions whose time is up and tells the router.
    "expire-due-sessions": {
        "task": "wizyfi.expire_due_sessions",
        "schedule": 60.0,
    },
}


@app.on_after_configure.connect
def _install_default_beat_schedule(sender, **_kwargs):
    # Mutate the schedule IN PLACE (never reassign it): reassigning was silently
    # undone when settings already defined CELERY_BEAT_SCHEDULE, which would have
    # meant the expiry sweep never ran. setdefault lets a same-named entry in
    # settings override ours.
    schedule = sender.conf.beat_schedule
    for name, entry in DEFAULT_BEAT_SCHEDULE.items():
        schedule.setdefault(name, entry)
