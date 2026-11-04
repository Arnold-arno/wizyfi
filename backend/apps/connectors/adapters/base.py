# apps/connectors/adapters/base.py
#
# doc07: "Router adapters perform network I/O behind stable interfaces."
# doc10: "This prevents vendor-specific protocol details from leaking
# into API views or React." Every vendor adapter implements this same
# interface; views/services never import a vendor-specific module.
#
# CHANGED (Round 22): authorize_session + SessionGrant. Until now redeeming a
# voucher only wrote a database row; no adapter was ever told to let the device
# onto the network.

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class HealthCheckResult:
    healthy: bool
    latency_ms: int | None
    checked_at: datetime
    detail: str = ""


@dataclass
class ActiveSession:
    session_identifier: str
    mac_address: str
    ip_address: str | None
    started_at: datetime


@dataclass
class SessionGrant:
    """What the router needs to let one device on: who (MAC), until when, and the
    data allowance. The adapter translates this into its vendor's commands."""

    session_identifier: str
    mac_address: str
    expires_at: datetime | None
    data_cap_mb: int | None = None  # None = no data limit
    ip_address: str | None = None


@dataclass
class CommandOutcome:
    """Every network-affecting adapter command returns one of these —
    never a bare boolean or a swallowed exception. doc07: 'Every external
    network action should have a correlation ID, target identifier,
    timeout, retry policy, terminal outcome and persisted result.'"""

    success: bool
    error_code: str | None = None
    error_message: str = ""


class RouterAdapter(ABC):
    """Stable interface every vendor adapter must implement. Credentials
    are decrypted once by the caller (see services.get_adapter_for) and
    passed in here — adapters never touch the encryption layer directly."""

    def __init__(self, host: str, credentials: dict, timeout_seconds: int = 10):
        self.host = host
        self.credentials = credentials
        self.timeout_seconds = timeout_seconds

    @abstractmethod
    def health_check(self) -> HealthCheckResult:
        """Cheap, frequent-safe check of reachability + basic health."""

    @abstractmethod
    def list_active_sessions(self) -> list[ActiveSession]:
        """Authoritative active-session list from the router itself —
        used to reconcile the DB's Session/Connection records, never
        trusted blindly as the sole source of truth (doc06 realtime rule)."""

    @abstractmethod
    def disconnect_session(self, session_identifier: str) -> CommandOutcome:
        """Used by both the ordinary Live Connections disconnect flow and
        Hard Logout execution. Must be idempotent: disconnecting an
        already-disconnected session is a success, not an error."""

    def authorize_session(self, grant: SessionGrant) -> CommandOutcome:
        """Let the device in until grant.expires_at, within grant.data_cap_mb.
        Must be idempotent (authorizing an already-authorized device succeeds).
        NOT abstract on purpose: an adapter that has not implemented it reports
        UNSUPPORTED, so the portal refuses to claim access it cannot give."""
        return CommandOutcome(
            success=False,
            error_code="UNSUPPORTED",
            error_message="This integration cannot grant network access yet.",
        )
