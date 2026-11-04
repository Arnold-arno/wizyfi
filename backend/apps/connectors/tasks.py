# apps/connectors/tasks.py
from celery import shared_task

from .health import sweep_router_health


@shared_task(name="wizyfi.check_router_health")
def check_router_health_task() -> dict:
    """Beat runs this every couple of minutes; bounded and idempotent."""
    return sweep_router_health()
