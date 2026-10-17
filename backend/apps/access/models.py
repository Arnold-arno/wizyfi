# apps/access/models.py
#
# doc08 entities: AccessPlan, Voucher, NetworkCycle.
# Field names chosen to match what the frontend package (built earlier,
# from spec, before this backend existed) already assumes — see
# DELIVERY_NOTES_ACCESS.md for the reconciliation this required.
#
# CHANGED (Round 14): HardLogoutEvent gains four execution-state fields
# (attempt_count, lease_expires_at, resolved_router_ids, failure_reason) so a
# crashed or stalled worker can be detected and the run resumed from durable
# state. Nothing else in this file changed.

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

    # Round 16. How a session's end time is set:
    #  DURATION          now + duration_minutes (the original behaviour)
    #  UNTIL_NEXT_RESET  the time of the next scheduled Wizyfi reset that covers
    #                    the router. duration_minutes is then ONLY the fallback
    #                    used when no reset is scheduled, so access can never
    #                    silently become unlimited.
    # Plans only READ reset schedules; they never create or trigger a reset
    # (doc00 §4 independence rule).
    VALIDITY_CHOICES = [
        ("DURATION", "After a fixed duration"),
        ("UNTIL_NEXT_RESET", "Until the next Wizyfi reset"),
    ]
    validity_mode = models.CharField(max_length=20, choices=VALIDITY_CHOICES, default="DURATION")

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

    # Round 16: set when expires_at was taken from a scheduled Wizyfi reset. A
    # PLAIN UUID, deliberately not a ForeignKey: the reset subsystem stays
    # independent of the session lifecycle at the database level. Used to move
    # these sessions on if that reset is cancelled.
    bound_reset_event_id = models.UUIDField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "access_session"
        indexes = [
            models.Index(fields=["router", "status"]),
            models.Index(fields=["place", "status"]),
            models.Index(fields=["customer"]),
            # Round 15: the expiry sweep scans (status, expires_at) every minute
            # on what will be the largest table.
            models.Index(fields=["status", "expires_at"]),
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

    # --- Execution state (Round 14). All written by the executor only. ---
    attempt_count = models.PositiveSmallIntegerField(
        default=0,
        help_text="Number of times a worker has claimed this event. Doubles as the fencing token: "
                  "a worker whose attempt number is no longer current must stop writing.",
    )
    lease_expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text="While RUNNING: the claiming worker's lease. A live lease blocks other workers; "
                  "an expired one lets the next sweep take over and resume.",
    )
    resolved_router_ids = models.JSONField(
        default=list, blank=True,
        help_text="Router UUIDs frozen when the run started. For a RUNNING event this list is "
                  "authoritative, so a resumed run never re-resolves a changed scope.",
    )
    failure_reason = models.CharField(
        max_length=500, blank=True,
        help_text="Operator-readable reason when the event could not run or was abandoned.",
    )

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
