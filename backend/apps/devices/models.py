# apps/devices/models.py
#
# doc08: Device — "Observed endpoint". Key fields: identifier, router,
# user/session, freshness. The `user` link is deferred to apps.access
# (Session model, next round) rather than a direct FK here, since a
# device's current session is a time-bounded relationship, not a
# permanent attribute of the device.

from django.db import models

from apps.common.models import BaseModel
from apps.connectors.models import Router
from apps.places.models import Place


class Device(BaseModel):
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name="devices")
    router = models.ForeignKey(
        Router, on_delete=models.SET_NULL, null=True, blank=True, related_name="devices"
    )
    mac_address = models.CharField(max_length=17, db_index=True)
    hostname = models.CharField(max_length=255, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "devices_device"
        indexes = [
            models.Index(fields=["place", "last_seen_at"]),
            models.Index(fields=["mac_address"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["place", "mac_address"], name="unique_device_per_place"
            )
        ]

    def __str__(self):
        return self.hostname or self.mac_address
