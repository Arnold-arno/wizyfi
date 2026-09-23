# apps/audit/models.py
#
# doc08: AuditEvent — "Immutable operational evidence | Actor + resource |
# actor_id, action, resource, timestamp, metadata".
# doc11: "Audit tampering: Append-oriented audit model + restricted
# writes." There is deliberately no update/delete path anywhere in this
# app — see views.py (ReadOnlyModelViewSet) and the absence of any
# mutation method on the model itself.

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class ActorType(models.TextChoices):
    STAFF = "STAFF", "Staff user"
    SYSTEM = "SYSTEM", "System/worker"
    CUSTOMER = "CUSTOMER", "Customer/portal user"


class AuditEvent(BaseModel):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="audit_events"
    )
    actor_type = models.CharField(max_length=20, choices=ActorType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    action = models.CharField(max_length=100, db_index=True)  # e.g. "hard_logout.scheduled"
    resource_type = models.CharField(max_length=100)  # e.g. "HardLogoutEvent"
    resource_id = models.CharField(max_length=64)  # stored as string: resources aren't all UUIDs
    # Coarse, safe details only (doc11: "Security logging must avoid
    # passwords, tokens and unnecessary personal data") — callers are
    # responsible for not putting secrets in here; see services.py.
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "audit_auditevent"
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["action"]),
        ]

    def __str__(self):
        return f"{self.action} on {self.resource_type}:{self.resource_id}"
