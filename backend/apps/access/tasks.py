# apps/access/tasks.py
#
# Wizyfi (Hard Logout) dispatch. doc10 stages: Schedule -> *Dispatch* -> Start ...
#
# A periodic sweep (Celery beat) finds events that need a worker and hands each
# to execute_hard_logout_event_task. PostgreSQL, not Redis, is the source of
# truth, so schedules survive broker loss, worker restarts and browser closure
# (doc11; HL-03, HL-06).
#
# CHANGED (Round 15): adds the session expiry sweep task.
# CHANGED (Round 14): the sweep now also picks up RUNNING events whose lease
# has EXPIRED — that is a worker that died or stalled — so they resume.
# A RUNNING event with a live lease is left alone.
#
# Dispatching the same event twice is safe: the claim step serialises on the
# row, and a second caller sees a live lease or a terminal state and returns.

import logging

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .models import HardLogoutEvent
from .services import execute_hard_logout_event, expire_due_sessions

logger = logging.getLogger(__name__)


@shared_task(name="wizyfi.execute_hard_logout_event", acks_late=True)
def execute_hard_logout_event_task(event_id: str) -> str:
    event = execute_hard_logout_event(event_id)
    logger.info("hard_logout.executed", extra={"event_id": str(event.id), "status": event.status})
    return event.status


@shared_task(name="wizyfi.dispatch_due_hard_logout_events")
def dispatch_due_hard_logout_events() -> int:
    now = timezone.now()
    due_ids = list(
        HardLogoutEvent.objects.filter(
            Q(status="SCHEDULED", scheduled_at__lte=now)
            | Q(status="RUNNING", lease_expires_at__lte=now)
            | Q(status="RUNNING", lease_expires_at__isnull=True)
        )
        .order_by("scheduled_at")
        .values_list("id", flat=True)
    )
    for event_id in due_ids:
        execute_hard_logout_event_task.delay(str(event_id))
    return len(due_ids)


@shared_task(name="wizyfi.expire_due_sessions")
def expire_due_sessions_task() -> dict:
    """Beat runs this every minute. Idempotent and batch-limited: if more than
    one batch is due, the next run continues where this one stopped."""
    result = expire_due_sessions()
    if result.examined:
        logger.info("session_expiry.swept", extra={
            "examined": result.examined, "expired": result.expired,
            "unconfirmed": result.unconfirmed, "pending": result.pending, "deferred": result.deferred,
        })
    return {"examined": result.examined, "expired": result.expired,
            "unconfirmed": result.unconfirmed, "pending": result.pending, "deferred": result.deferred}
