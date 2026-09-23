# apps/connectors/adapters/mikrotik.py
#
# Stub adapter: implements the full RouterAdapter contract so the rest of
# the system (views, services, Hard Logout execution) can be built and
# tested against a real interface shape, without requiring a live
# RouterOS device in every dev/CI environment. Matches
# Expectations_and_workflow: "MikroTik stub adapter implemented".
#
# TODO (real integration, next round): replace the simulated bodies below
# with actual RouterOS API calls (e.g. via the `librouteros` package) —
# /ip/hotspot/active for list_active_sessions, /ip/hotspot/active/remove
# for disconnect_session, a lightweight /system/resource print for
# health_check. Keep the public method signatures identical so nothing
# above this layer needs to change.

from datetime import datetime, timezone

from .base import ActiveSession, CommandOutcome, HealthCheckResult, RouterAdapter


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
        # Simulated success — no live socket opened in this stub.
        return HealthCheckResult(
            healthy=True,
            latency_ms=1,
            checked_at=datetime.now(timezone.utc),
            detail="Simulated health check (stub adapter, no live RouterOS call).",
        )

    def list_active_sessions(self) -> list[ActiveSession]:
        # Real integration will query /ip/hotspot/active. Returning an
        # empty list here is the correct "no fake progress" behavior
        # (doc03 §10 safety rule) rather than inventing sample data.
        return []

    def disconnect_session(self, session_identifier: str) -> CommandOutcome:
        if not session_identifier:
            return CommandOutcome(
                success=False,
                error_code="VALIDATION_ERROR",
                error_message="session_identifier is required.",
            )
        # Simulated success. Idempotent by construction: this stub never
        # reports a "not found" failure for a repeat disconnect, matching
        # the real adapter's required behavior once implemented.
        return CommandOutcome(success=True)
