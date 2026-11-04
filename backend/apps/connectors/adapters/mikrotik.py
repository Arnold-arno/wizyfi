# apps/connectors/adapters/mikrotik.py
#
# Stub adapter: implements the full RouterAdapter contract so the rest of
# the system (views, services, portal, Hard Logout) can be built and tested
# against a real interface shape, without a live RouterOS device in every
# dev/CI environment. Simulated results only; nothing is sent to a router.
#
# TODO (real integration): replace the simulated bodies with RouterOS API calls
# (e.g. `librouteros`):
#   health_check          -> /system/resource print
#   list_active_sessions  -> /ip/hotspot/active print
#   disconnect_session    -> /ip/hotspot/active remove  (+ remove the binding below)
#   authorize_session     -> /ip/hotspot/ip-binding add mac-address=<mac> type=bypassed comment=<session>
#                            or /ip/hotspot/user add name=<session> mac-address=<mac>
#                            limit-uptime=<until expires_at> limit-bytes-total=<data_cap_mb MB>
# Keep the public method signatures identical so nothing above this layer changes.

from datetime import datetime, timezone

from .base import ActiveSession, CommandOutcome, HealthCheckResult, RouterAdapter, SessionGrant


class MikroTikAdapter(RouterAdapter):
    vendor_code = "MIKROTIK"

    def health_check(self) -> HealthCheckResult:
        if not self.credentials.get("username") or not self.credentials.get("password"):
            return HealthCheckResult(
                healthy=False,
                latency_ms=None,
                checked_at=datetime.now(timezone.utc),
                detail="Missing credentials for this connector.",
            )
        return HealthCheckResult(
            healthy=True,
            latency_ms=1,
            checked_at=datetime.now(timezone.utc),
            detail="Simulated health check (stub adapter, no live RouterOS call).",
        )

    def list_active_sessions(self) -> list[ActiveSession]:
        # Returning an empty list is the correct "no fake progress" behavior
        # (doc03 §10 safety rule) rather than inventing sample data.
        return []

    def disconnect_session(self, session_identifier: str) -> CommandOutcome:
        if not session_identifier:
            return CommandOutcome(
                success=False,
                error_code="VALIDATION_ERROR",
                error_message="session_identifier is required.",
            )
        # Idempotent by construction: a repeat disconnect is never a failure.
        return CommandOutcome(success=True)

    def authorize_session(self, grant: SessionGrant) -> CommandOutcome:
        if not self.credentials.get("username") or not self.credentials.get("password"):
            return CommandOutcome(False, "CONNECTOR_ERROR", "Missing credentials for this connector.")
        if not grant.session_identifier or not grant.mac_address:
            return CommandOutcome(False, "VALIDATION_ERROR", "session_identifier and mac_address are required.")
        return CommandOutcome(success=True)  # simulated; idempotent by construction
