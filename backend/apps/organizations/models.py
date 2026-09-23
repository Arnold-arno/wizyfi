# apps/organizations/models.py
#
# Provider/tenant boundary (doc08: "Provider | Tenant/account boundary").
# Named `Organization` in code to match Expectations_and_workflow
# ("organizations: Multi-tenant with role-based membership and granular
# permission codes"); this is the same entity doc08 calls "Provider".

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class Organization(BaseModel):
    STATUS_CHOICES = [("ACTIVE", "Active"), ("SUSPENDED", "Suspended")]

    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    class Meta:
        db_table = "organizations_organization"
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return self.name


class Role(models.TextChoices):
    OWNER = "OWNER", "Owner"
    ADMIN = "ADMIN", "Admin"
    AGENT = "AGENT", "Agent"
    READ_ONLY = "READ_ONLY", "Read-only operator"


# Granular permission codes, matched to the pages/actions built so far.
# Explicit allow-list, per doc11 "deny by default".
DEFAULT_ROLE_PERMISSIONS = {
    Role.OWNER: {"*"},  # owner implicitly passes every check; see has_permission()
    Role.ADMIN: {
        "places:view", "places:create", "places:edit",
        "connectors:view", "connectors:manage",
        "routers:view", "routers:manage",
        "devices:view",
        "customers:view", "customers:manage",
        "access_plans:view", "access_plans:create", "access_plans:edit",
        "vouchers:view", "vouchers:issue", "vouchers:revoke",
        "network_cycles:view", "network_cycles:manage",
        "connections:view", "connections:disconnect",
        "hard_logout:view", "hard_logout:schedule", "hard_logout:cancel",
        "audit:view",
    },
    Role.AGENT: {
        "places:view",
        "routers:view",
        "devices:view",
        "customers:view", "customers:manage",
        "access_plans:view",
        "vouchers:view", "vouchers:issue",
        "network_cycles:view",
        "connections:view", "connections:disconnect",
    },
    Role.READ_ONLY: {
        "places:view", "routers:view", "devices:view", "customers:view",
        "access_plans:view", "vouchers:view", "network_cycles:view",
        "connections:view", "hard_logout:view",
    },
}


class Membership(BaseModel):
    """A staff User's role within one Organization. A user may belong to
    more than one organization; the active one is resolved per-request
    (e.g. from a header or the user's last-selected org)."""

    STATUS_CHOICES = [("ACTIVE", "Active"), ("SUSPENDED", "Suspended")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    extra_permissions = models.JSONField(default=list, blank=True)
    revoked_permissions = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    class Meta:
        db_table = "organizations_membership"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"], name="unique_user_per_organization"
            )
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["user"]),
        ]

    def has_permission(self, code: str) -> bool:
        if self.status != "ACTIVE" or self.organization.status != "ACTIVE":
            return False
        if code in self.revoked_permissions:
            return False
        role_perms = DEFAULT_ROLE_PERMISSIONS.get(self.role, set())
        if "*" in role_perms:
            return True
        return code in role_perms or code in self.extra_permissions
