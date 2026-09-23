# apps/places/models.py
#
# doc08: Place — "Physical/logical deployment location".
# Critical fields per doc08: provider_id, name, timezone, status.

from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class Place(BaseModel):
    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("SETUP", "Setting up"),
        ("ARCHIVED", "Archived"),
    ]

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="places"
    )
    name = models.CharField(max_length=255)
    timezone = models.CharField(max_length=64, default="UTC")  # IANA tz name
    address = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SETUP")

    class Meta:
        db_table = "places_place"
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"], name="unique_place_name_per_org"
            )
        ]

    def __str__(self):
        return self.name
