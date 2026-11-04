# apps/connectors/health.py
#
# Router health sweep. Before this, a router's status only changed when someone
# clicked "Test connection", so dashboard "Routers online" and every "last seen"
# time went stale. The sweep re-checks routers on a schedule.
#
# Which routers: ONLINE / DEGRADED / OFFLINE. PROVISIONING is left for the operator's
# explicit "Test connection" (that is the setup gate that lets a place be activated)
# and DISABLED is intentionally off. Oldest-checked first (updated_at), bounded per run.
import logging

from django.conf import settings
from django.utils import timezone

from .models import Router
from .services import run_health_check

logger = logging.getLogger(__name__)
SWEPT_STATUSES = ("ONLINE", "DEGRADED", "OFFLINE")


def sweep_router_health(limit: int | None = None) -> dict:
    limit = limit or getattr(settings, "ROUTER_HEALTH_SWEEP_BATCH", 200)
    routers = list(
        Router.objects.filter(status__in=SWEPT_STATUSES).select_related("connector").order_by("updated_at")[:limit]
    )
    online = offline = 0
    for router in routers:
        try:
            result = run_health_check(router)
            healthy = result.healthy
        except Exception:  # undecryptable credentials / adapter bug: mark it, keep sweeping
            logger.exception("router_health.check_failed", extra={"router_id": str(router.id)})
            Router.objects.filter(id=router.id).update(status="OFFLINE", updated_at=timezone.now())
            healthy = False
        online += int(healthy)
        offline += int(not healthy)
    return {"checked": len(routers), "online": online, "offline": offline}
