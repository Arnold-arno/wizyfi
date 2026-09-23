# apps/devices/serializers.py
from rest_framework import serializers

from .models import Device


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ["id", "place", "router", "mac_address", "hostname", "last_seen_at", "created_at"]
        read_only_fields = ["id", "created_at"]
