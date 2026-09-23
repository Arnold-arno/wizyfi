# apps/portal/models.py
#
# doc02/doc04: Captive Portal — Welcome screen needs brand/network/place
# identity. Optional per place: if none exists, the portal falls back to
# sensible defaults (see views.py) rather than requiring one to be
# created before a place can be connected to at all.

from django.db import models

from apps.common.models import BaseModel
from apps.places.models import Place


class PortalConfig(BaseModel):
    place = models.OneToOneField(Place, on_delete=models.CASCADE, related_name="portal_config")
    welcome_message = models.CharField(max_length=500, blank=True)
    support_contact = models.CharField(max_length=255, blank=True)
    terms_url = models.URLField(blank=True)
    is_enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "portal_portalconfig"

    def __str__(self):
        return f"Portal config for {self.place.name}"
