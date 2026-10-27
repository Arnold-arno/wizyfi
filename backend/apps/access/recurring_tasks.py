# apps/access/recurring_tasks.py — imported from tasks.py so Celery finds it.
import logging

from celery import shared_task

from .recurring import materialize_all_recurring_resets

logger = logging.getLogger(__name__)


@shared_task(name="wizyfi.materialize_recurring_resets")
def materialize_recurring_resets_task() -> int:
    """Beat runs this every few minutes. Idempotent: keeps the next occurrences
    of every active rule scheduled as ordinary events."""
    created = materialize_all_recurring_resets()
    if created:
        logger.info("recurring_reset.materialized", extra={"created": created})
    return created
