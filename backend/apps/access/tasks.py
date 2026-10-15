# apps/access/tasks.py
#
# Wizyfi (Hard Logout) dispatch. doc10 stages: Schedule -> *Dispatch* -> Start ...
#
# Design: a periodic sweep (Celery beat) finds SCHEDULED events whose time has
# come and hands each to a worker task. The sweep is the source of truth, not
# an ETA message in Redis, so the schedule survives broker loss, worker
# restarts and browser closure (doc11 invariant; HL-03, HL-06).
#
# Safe to dispatch twice: execute_hard_logout_event() locks the row and treats
# terminal events as a no-op (HL-09), so overlapping sweeps cannot double-run.

import logging

from celery import shared_task
from django.utils import timezone

from .models import HardLogoutEvent
from .services import execute_hard_logout_event

logger = logging.getLogger(__name__)


@shared_task(name="wizyfi.execute_hard_logout_event", acks_late=True)
def execute_hard_logout_event_task(event_id: str) -> str:
    event = execute_hard_logout_event(event_id)
    logger.info("hard_logout.executed", extra={"event_id": str(event.id), "status": event.status})
    return event.status


@shared_task(name="wizyfi.dispatch_due_hard_logout_events")
def dispatch_due_hard_logout_events() -> int:
    due_ids = list(
        HardLogoutEvent.objects.filter(status="SCHEDULED", scheduled_at__lte=timezone.now())
        .order_by("scheduled_at")
        .values_list("id", flat=True)
    )
    for event_id in due_ids:
        execute_hard_logout_event_task.delay(str(event_id))
    return len(due_ids)
