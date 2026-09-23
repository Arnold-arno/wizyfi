# apps/access/models.py
#
# doc08 entities: AccessPlan, Voucher, NetworkCycle.
# Field names chosen to match what the frontend package (built earlier,
# from spec, before this backend existed) already assumes — see
# DELIVERY_NOTES_ACCESS.md for the reconciliation this required.

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.connectors.models import Router
from apps.customers.models import Customer
from apps.devices.models import Device
from apps.organizations.models import Organization
from apps.places.models import Place


class AccessPlan(BaseModel):
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("ACTIVE", "Active"),
        ("PAUSED", "Paused"),
        ("ARCHIVED", "Archived"),
    ]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="access_plans"
    )
    name = models.CharField(max_length=255)
    description = models.CharField(max_length=1000, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="UGX")
    duration_minutes = models.PositiveIntegerField()

    # Quota / limits — kept as plain fields rather than a nested JSON
    # blob so they're indexable/queryable; the API still nests them
    # under `quota` for the frontend (see serializers.py).
    data_cap_mb = models.PositiveIntegerField(null=True, blank=True)
    max_concurrent_devices = models.PositiveIntegerField(null=True, blank=True)

    is_publicly_listed = models.BooleanField(default=True)
    available_from = models.DateTimeField(null=True, blank=True)
    available_until = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT")

    class Meta:
        db_table = "access_accessplan"
        indexes = [
            models.Index(fields=["organization", "status"]),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(price__gte=0), name="access_plan_price_non_negative"),
            models.CheckConstraint(
                check=models.Q(duration_minutes__gt=0), name="access_plan_duration_positive"
            ),
        ]

    def __str__(self):
        return self.name


class Voucher(BaseModel):
    STATUS_CHOICES = [
        ("AVAILABLE", "Available"),
        ("ISSUED", "Issued"),
        ("REDEEMED", "Redeemed"),
        ("EXPIRED", "Expired"),
        ("REVOKED", "Revoked"),
    ]

    plan = models.ForeignKey(AccessPlan, on_delete=models.PROTECT, related_name="vouchers")
    batch_id = models.UUIDField(null=True, blank=True, db_index=True)

    code_hash = models.CharField(max_length=64, unique=True)
    code_last4 = models.CharField(max_length=4)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="AVAILABLE")
    issued_at = models.DateTimeField(null=True, blank=True)
    redeemed_at = models.DateTimeField(null=True, blank=True)
    redeemed_by_customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="vouchers"
    )
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "access_voucher"
        indexes = [
            models.Index(fields=["plan", "status"]),
            models.Index(fields=["batch_id"]),
        ]

    def __str__(self):
        return f"Voucher {self.id} ({self.status})"


class NetworkCycle(BaseModel):
    STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name="network_cycles")
    name = models.CharField(max_length=255, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SCHEDULED")

    class Meta:
        db_table = "access_networkcycle"
        indexes = [models.Index(fields=["place", "status"])]
        constraints = [
            models.CheckConstraint(
                check=models.Q(ends_at__gt=models.F("starts_at")),
                name="network_cycle_ends_after_starts",
            )
        ]

    def __str__(self):
        return self.name or f"Cycle {self.id}"


class Session(BaseModel):
    """doc03 §5: time-bounded access relationship. States match the
    Connection/session lifecycle table exactly: Pending / Active /
    Expiring / Expired / Disconnected / Failed."""

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("ACTIVE", "Active"),
        ("EXPIRING", "Expiring"),
        ("EXPIRED", "Expired"),
        ("DISCONNECTED", "Disconnected"),
        ("FAILED", "Failed"),
    ]

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="sessions")
    device = models.ForeignKey(
        Device, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions"
    )
    router = models.ForeignKey(Router, on_delete=models.PROTECT, related_name="sessions")
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name="sessions")
    access_plan = models.ForeignKey(
        AccessPlan, on_delete=models.PROTECT, null=True, blank=True, related_name="sessions"
    )
    voucher = models.ForeignKey(
        Voucher, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions"
    )

    started_at = models.DateTimeField()
    expires_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")

    class Meta:
        db_table = "access_session"
        indexes = [
            models.Index(fields=["router", "status"]),
            models.Index(fields=["place", "status"]),
            models.Index(fields=["customer"]),
        ]

    def __str__(self):
        return f"Session {self.id} ({self.status})"


class HardLogoutEvent(BaseModel):
    """doc03 §7-11 / doc08 'Hard Logout Data Boundary': may reference
    provider/place/router SCOPE to execute and audit itself, but must
    NEVER carry a foreign-key dependency on AccessPlan, Voucher,
    NetworkCycle, Sale, Transaction or Session/User lifecycle — this is
    a hard architectural rule, not a style preference (doc00 §4: "must
    not become an implicit child process"). Scope is deliberately by
    Place + an explicit router_id list, never an unbounded/ambiguous
    "all" (doc03 §10 safety rules)."""

    SCOPE_CHOICES = [("ROUTER", "Single router"), ("ROUTERS", "Selected routers"), ("PLACE", "Whole place")]
    STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("RUNNING", "Running"),
        ("COMPLETED", "Completed"),
        ("PARTIAL", "Partial"),
        ("FAILED", "Failed"),
        ("CANCELLED", "Cancelled"),
    ]

    place = models.ForeignKey(Place, on_delete=models.PROTECT, related_name="hard_logout_events")
    scope_type = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    router_ids = models.JSONField(
        default=list, blank=True,
        help_text="Explicit router UUIDs when scope_type is ROUTER/ROUTERS; empty for PLACE "
                   "scope, which is resolved to the place's current routers at execution time.",
    )

    scheduled_at = models.DateTimeField()
    scheduled_timezone = models.CharField(max_length=64)
    impact_estimate_connections = models.PositiveIntegerField(
        null=True, blank=True, help_text="Labelled as an estimate everywhere in the UI (doc03 §9)."
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SCHEDULED")
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    cancel_reason = models.CharField(max_length=500, blank=True)

    succeeded_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "access_hardlogoutevent"
        indexes = [
            models.Index(fields=["place", "status"]),
            models.Index(fields=["scheduled_at"]),
        ]

    def __str__(self):
        return f"HardLogoutEvent {self.id} ({self.status})"


class HardLogoutTargetResult(BaseModel):
    """One row per router targeted by a HardLogoutEvent — doc03 §12:
    'If a target becomes unavailable, mark that target as failed rather
    than falsely completing it' / 'preserve successful and failed target
    sets'. unique_together enables idempotent re-execution: HL-09
    ('Already-completed targets are not blindly repeated')."""

    STATUS_CHOICES = [("ATTEMPTED", "Attempted"), ("SUCCEEDED", "Succeeded"), ("FAILED", "Failed")]

    event = models.ForeignKey(HardLogoutEvent, on_delete=models.CASCADE, related_name="target_results")
    router = models.ForeignKey(Router, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ATTEMPTED")
    attempted_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=50, blank=True)
    error_message = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "access_hardlogouttargetresult"
        constraints = [
            models.UniqueConstraint(fields=["event", "router"], name="unique_target_per_event")
        ]
