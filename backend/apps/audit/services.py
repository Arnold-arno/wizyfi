# apps/audit/services.py

from .models import ActorType, AuditEvent

# Defense-in-depth: even though callers are responsible for not passing
# secrets into metadata (doc11), redact anything under these key names
# so a future careless call site doesn't silently leak a credential into
# an append-only, never-deletable log.
_SENSITIVE_KEYS = {
    "password", "token", "secret", "credential", "credentials",
    "code", "code_hash", "authorization", "access", "refresh",
}


def _redact(metadata: dict) -> dict:
    return {
        k: ("«redacted»" if k.lower() in _SENSITIVE_KEYS else v)
        for k, v in metadata.items()
    }


def record_event(
    *, organization_id, action: str, resource_type: str, resource_id,
    actor=None, actor_type: str = ActorType.SYSTEM, metadata: dict | None = None,
) -> AuditEvent:
    return AuditEvent.objects.create(
        organization_id=organization_id,
        actor=actor,
        actor_type=actor_type,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        metadata=_redact(metadata or {}),
    )
