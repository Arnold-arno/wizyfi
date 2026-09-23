# apps/customers/models.py
#
# doc08: User (Subscriber/portal identity) — "provider_id, identity,
# status". Named `Customer` in code (Expectations_and_workflow:
# "customers (Wi-Fi end-users, fully separate from staff Users)") to
# avoid any confusion with apps.accounts.User, which is staff-only.
#
# Known bug fix carried forward from the prior build
# (Expectations_and_workflow): "Conditional UniqueConstraint on Customer
# phone/username: A real bug was discovered and fixed during voucher
# testing — blank phones caused collisions; the constraint is now
# conditional." A plain UniqueConstraint on (organization, phone) treats
# every blank/empty phone as equal, so the second voucher-only customer
# with no phone number would fail to save. The constraints below only
# apply when the field is actually populated.

from django.db import models
from django.db.models import Q

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class Customer(BaseModel):
    STATUS_CHOICES = [("ACTIVE", "Active"), ("BLOCKED", "Blocked")]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="customers"
    )
    full_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=32, blank=True)

    # Voucher-only customers (Expectations_and_workflow:
    # "PortalVoucherRedeemView creates lightweight Customer records keyed
    # on MAC address") never collect a phone number — mac_address is
    # their only stable identifier.
    mac_address = models.CharField(max_length=17, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    class Meta:
        db_table = "customers_customer"
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["phone"]),
            models.Index(fields=["mac_address"]),
        ]
        constraints = [
            # Conditional: only enforced when phone is actually set, so
            # any number of blank-phone (voucher-only) customers can
            # coexist in the same organization.
            models.UniqueConstraint(
                fields=["organization", "phone"],
                condition=~Q(phone=""),
                name="unique_customer_phone_per_org_when_set",
            ),
            models.UniqueConstraint(
                fields=["organization", "mac_address"],
                condition=~Q(mac_address=""),
                name="unique_customer_mac_per_org_when_set",
            ),
        ]

    def __str__(self):
        return self.full_name or self.phone or self.mac_address or str(self.id)
