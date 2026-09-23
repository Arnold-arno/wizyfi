# apps/connectors/models.py
#
# Connector: one configured vendor integration (credentials + vendor code)
# a Place uses to talk to its Routers.
# Router: doc08 "Managed gateway/control point"; lifecycle states per
# doc03 §4: Provisioning / Online / Degraded / Offline / Disabled.

from django.db import models

from apps.common.models import BaseModel
from apps.places.models import Place

from .adapters.registry import VENDOR_CHOICES
from .crypto import decrypt_credentials, encrypt_credentials


class Connector(BaseModel):
    STATUS_CHOICES = [
        ("PENDING_VERIFICATION", "Pending verification"),
        ("VERIFIED", "Verified"),
        ("FAILING", "Failing"),
    ]

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name="connectors")
    vendor_code = models.CharField(max_length=32, choices=VENDOR_CHOICES)
    name = models.CharField(max_length=255)
    encrypted_credentials = models.BinaryField()
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PENDING_VERIFICATION")
    last_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "connectors_connector"
        indexes = [models.Index(fields=["place", "status"])]

    def set_credentials(self, credentials: dict) -> None:
        self.encrypted_credentials = encrypt_credentials(credentials)

    def get_credentials(self) -> dict:
        return decrypt_credentials(self.encrypted_credentials)

    def __str__(self):
        return f"{self.name} ({self.vendor_code})"


class Router(BaseModel):
    STATUS_CHOICES = [
        ("PROVISIONING", "Provisioning"),
        ("ONLINE", "Online"),
        ("DEGRADED", "Degraded"),
        ("OFFLINE", "Offline"),
        ("DISABLED", "Disabled"),
    ]

    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name="routers")
    connector = models.ForeignKey(Connector, on_delete=models.PROTECT, related_name="routers")
    name = models.CharField(max_length=255)
    identity = models.CharField(max_length=255, help_text="Vendor-side router identity/hostname")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PROVISIONING")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    capabilities = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "connectors_router"
        indexes = [
            models.Index(fields=["place", "status"]),
            models.Index(fields=["last_seen_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["place", "name"], name="unique_router_name_per_place")
        ]

    def __str__(self):
        return self.name
