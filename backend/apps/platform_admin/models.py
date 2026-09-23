# apps/platform_admin/models.py
#
# Super Admin domain (Expectations_and_workflow: "platform_admin (Super
# Admin domain)"). This is Wizyfi Bridge THE COMPANY managing its own
# subscribing organizations — completely orthogonal to the per-org
# Role/Membership system in apps.organizations. A platform staff member
# has zero organization membership and zero business-data access by
# default; their privilege comes only from PlatformStaff, checked by
# apps.common.permissions.IsPlatformStaff, never by HasPermissionCode.
#
# Naming note: Expectations_and_workflow calls a subscribing organization
# an "Agent" at this layer ("Agents list, Agent Detail"). This is a
# different, unrelated sense of the word from organizations.Role.AGENT
# (a per-org staff role). Both names come from the same source project
# description; kept as-is rather than invented, with this comment so the
# two are never confused.

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class PlatformRole(models.TextChoices):
    SUPERADMIN = "SUPERADMIN", "Super admin"
    SUPPORT = "SUPPORT", "Support"
    BILLING = "BILLING", "Billing"


class PlatformStaff(BaseModel):
    """Marks a User as platform staff. Deliberately NOT a field on
    accounts.User itself — this is an additive, optional profile, so a
    user with no PlatformStaff row simply has no platform access at all,
    which is the correct deny-by-default default."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="platform_staff"
    )
    role = models.CharField(max_length=20, choices=PlatformRole.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "platform_admin_platformstaff"

    def __str__(self):
        return f"{self.user.email} ({self.role})"


class Plan(BaseModel):
    """A SaaS subscription plan for organizations (the platform's own
    commercial product) — NOT to be confused with access.AccessPlan,
    which is a provider's own customer-facing Wi-Fi access product."""

    STATUS_CHOICES = [("ACTIVE", "Active"), ("ARCHIVED", "Archived")]
    BILLING_PERIOD_CHOICES = [("MONTHLY", "Monthly"), ("ANNUAL", "Annual")]

    name = models.CharField(max_length=255)
    max_places = models.PositiveIntegerField(null=True, blank=True, help_text="Null = unlimited")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    billing_period = models.CharField(max_length=10, choices=BILLING_PERIOD_CHOICES, default="MONTHLY")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    class Meta:
        db_table = "platform_admin_plan"

    def __str__(self):
        return self.name


class OrganizationSubscription(BaseModel):
    organization = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name="subscription"
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "platform_admin_organizationsubscription"

    def __str__(self):
        return f"{self.organization.name} -> {self.plan.name}"


class PlatformActivityEvent(BaseModel):
    """Deliberately separate from apps.audit.AuditEvent
    (Expectations_and_workflow: 'PlatformActivityEvent deliberately
    separate from audit.AuditLog: Only coarse, safe messages are
    surfaced at the platform level'). apps.audit.AuditEvent can carry
    org-internal operational detail for that org's own staff to review;
    this model is what OTHER organizations' data looks like from the
    platform's side — coarse and safe by construction, not by filtering
    a richer record after the fact."""

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="platform_activity_events"
    )
    action = models.CharField(max_length=100)
    message = models.CharField(max_length=500)

    class Meta:
        db_table = "platform_admin_platformactivityevent"
        indexes = [models.Index(fields=["organization", "created_at"])]

    def __str__(self):
        return self.message
