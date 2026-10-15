# apps/connectors/adapters/wizyfi.py
#
# Wizyfi is Wizyfi Bridge's OWN network-management product, offered as a
# vendor option beside MikroTik (and, later, Ruijie). It plugs into the same
# RouterAdapter contract, so views/services never special-case it.
#
# STUB, like MikroTikAdapter: honest simulated results, no live calls, and
# list_active_sessions() returns [] rather than invented data (doc03 §10).
#
# ASSUMPTION (confirm): credentials carry a single "api_key". The real
# first-party control protocol is not specified in any project document yet.

from datetime import datetime, timezone

from .base import ActiveSession, CommandOutcome, HealthCheckResult, RouterAdapter


class WizyfiAdapter(RouterAdapter):
    vendor_code = "WIZYFI"

    def health_check(self) -> HealthCheckResult:
        if not self.credentials.get("api_key"):
            return HealthCheckResult(
                healthy=False, latency_ms=None, checked_at=datetime.now(timezone.utc),
                detail="Missing api_key for this Wizyfi connector.",
            )
        return HealthCheckResult(
            healthy=True, latency_ms=1, checked_at=datetime.now(timezone.utc),
            detail="Simulated health check (Wizyfi stub adapter, no live call).",
        )

    def list_active_sessions(self) -> list[ActiveSession]:
        return []

    def disconnect_session(self, session_identifier: str) -> CommandOutcome:
        if not session_identifier:
            return CommandOutcome(
                success=False, error_code="VALIDATION_ERROR",
                error_message="session_identifier is required.",
            )
        return CommandOutcome(success=True)  # idempotent by construction
