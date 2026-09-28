# apps/commercial/models.py
#
# doc10 Backend Structure: "apps/commercial/ — sales and transactions".
# doc08: Sale — "Commercial sale record | User/AccessPlan | provider_id,
# user_id, total, status". Transaction — "Payment/accounting event | Sale
# | sale_id, amount, currency, status, reference".
# doc04 §9 distinction, followed exactly here: Sale is the analytical/
# aggregated view (breakdown by time/place/plan); Transaction is the
# immutable, evidentiary ledger record. A Sale is created by staff
# logging a real-world payment (e.g. a walk-in customer paying cash for
# a voucher); it is NOT the same event as voucher redemption, which is
# claiming access already paid for — see apps.commercial.services for
# why these stay separate.

from django.db import models

from apps.access.models import AccessPlan, Voucher
from apps.common.models import BaseModel
from apps.customers.models import Customer
from apps.organizations.models import Organization
from apps.places.models import Place


class Sale(BaseModel):
    STATUS_CHOICES = [
        ("COMPLETED", "Completed"),
        ("REFUNDED", "Refunded"),
        ("CANCELLED", "Cancelled"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="sales")
    place = models.ForeignKey(
        Place, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    access_plan = models.ForeignKey(
        AccessPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    voucher = models.ForeignKey(
        Voucher, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    total = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="UGX")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="COMPLETED")
    sold_at = models.DateTimeField()

    class Meta:
        db_table = "commercial_sale"
        indexes = [
            models.Index(fields=["organization", "sold_at"]),
            models.Index(fields=["place", "sold_at"]),
            models.Index(fields=["access_plan"]),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(total__gte=0), name="sale_total_non_negative")
        ]

    def __str__(self):
        return f"Sale {self.id} ({self.total} {self.currency})"


class Transaction(BaseModel):
    """Immutable, evidentiary — no update/destroy path anywhere in this
    app (same append-only treatment as apps.audit.AuditEvent). Created
    only as a side effect of apps.commercial.services.record_sale."""

    STATUS_CHOICES = [
        ("SUCCEEDED", "Succeeded"),
        ("FAILED", "Failed"),
        ("REFUNDED", "Refunded"),
    ]

    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="transactions")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="UGX")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUCCEEDED")
    reference = models.CharField(max_length=255, blank=True, help_text="External payment reference")

    class Meta:
        db_table = "commercial_transaction"
        indexes = [models.Index(fields=["sale"]), models.Index(fields=["created_at"])]

    def __str__(self):
        return f"Transaction {self.id} ({self.status})"
