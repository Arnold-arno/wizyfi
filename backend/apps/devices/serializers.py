# apps/devices/serializers.py
# CHANGED (Round 13): readable place/router names, so the Devices table never
# has to render UUIDs. DeviceViewSet already select_related("place","router").
from rest_framework import serializers

from .models import Device


class DeviceSerializer(serializers.ModelSerializer):
    place_name = serializers.CharField(source="place.name", read_only=True, default=None)
    router_name = serializers.CharField(source="router.name", read_only=True, default=None)

    class Meta:
        model = Device
        fields = [
            "id", "place", "place_name", "router", "router_name",
            "mac_address", "hostname", "last_seen_at", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
