# apps/connectors/services.py
#
# doc10 "Service-Layer Rule": views translate HTTP into validated command/query
# inputs; domain services perform business rules; adapters perform network I/O.
# This module is the seam between Router/Connector persistence and the adapter layer.
# CHANGED (Round 22): authorize_session.

from django.utils import timezone

from .adapters.base import RouterAdapter, SessionGrant
from .adapters.registry import get_adapter_class
from .models import Router


def get_adapter_for_router(router: Router) -> RouterAdapter:
    connector = router.connector
    adapter_class = get_adapter_class(connector.vendor_code)
    credentials = connector.get_credentials()  # decrypted only here, in memory, per-call
    return adapter_class(host=router.identity, credentials=credentials)


def run_health_check(router: Router):
    """Runs a health check and persists the resulting router status —
    the DB row is the authoritative status; the adapter call itself is
    always fresh, never assumed (doc07 realtime rule)."""
    adapter = get_adapter_for_router(router)
    result = adapter.health_check()

    router.status = "ONLINE" if result.healthy else "OFFLINE"
    router.last_seen_at = timezone.now() if result.healthy else router.last_seen_at
    router.save(update_fields=["status", "last_seen_at", "updated_at"])
    return result


def disconnect_session(router: Router, session_identifier: str):
    """Single place that talks to the adapter for a disconnect command
    (Live Connections, Hard Logout and the expiry sweep all use it)."""
    adapter = get_adapter_for_router(router)
    return adapter.disconnect_session(session_identifier)


def authorize_session(router: Router, grant: SessionGrant):
    """Single place that asks a router to let a device on (captive portal)."""
    adapter = get_adapter_for_router(router)
    return adapter.authorize_session(grant)
