# apps/portal/serializers.py
#
# These are intentionally separate from apps.access's serializers, even
# though the underlying models are the same. The captive portal is
# public and unauthenticated — it must never expose internal fields
# (status, timestamps, org internals) beyond what an end user actually
# needs (doc PRD non-goal: "Do not make the captive portal a miniature
# provider dashboard").

from rest_framework import serializers


class PortalWelcomeSerializer(serializers.Serializer):
    place_name = serializers.CharField()
    welcome_message = serializers.CharField(allow_blank=True)
    support_contact = serializers.CharField(allow_blank=True)
    terms_url = serializers.CharField(allow_blank=True)


class PortalPlanSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField()
    duration_minutes = serializers.IntegerField()
    data_cap_mb = serializers.IntegerField(allow_null=True)
    max_concurrent_devices = serializers.IntegerField(allow_null=True)


class PortalRedeemRequestSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    mac_address = serializers.CharField(max_length=17)
    router_id = serializers.UUIDField()


class PortalSessionSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    status = serializers.CharField()
    expires_at = serializers.DateTimeField(allow_null=True)
    plan_name = serializers.CharField(allow_null=True)
