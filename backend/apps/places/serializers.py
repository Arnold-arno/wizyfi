# apps/places/serializers.py
#
# CHANGED (Round 13):
#  * router_count / active_connection_count: the Places list needs them
#    (doc04 §5). They come from annotations in PlaceViewSet.get_queryset.
#  * status is now writable on UPDATE only, limited to ACTIVE / ARCHIVED.
#    Before this, `status` was read-only and nothing ever moved a place out of
#    SETUP, so no place could become Active or be archived (FR-001).
#    A place can only be activated once it has an ONLINE router, matching the
#    flow "Add Place -> Add Router -> router verification" (doc02 §5).
#  * timezone is validated as a real IANA zone: Hard Logout (Wizyfi) schedules
#    in the place's timezone, so a junk value would break scheduling.

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework import serializers

from .models import Place


class PlaceSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(choices=["ACTIVE", "ARCHIVED"], required=False)
    # default=0 covers the create response (an un-annotated, brand-new place
    # genuinely has no routers or connections).
    router_count = serializers.IntegerField(read_only=True, default=0)
    active_connection_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Place
        fields = [
            "id", "name", "timezone", "address", "status",
            "router_count", "active_connection_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            raise serializers.ValidationError("Enter a valid IANA time zone, for example Africa/Kampala.")
        return value

    def validate_status(self, value):
        if self.instance is None:
            raise serializers.ValidationError("A new place always starts in setup.")
        if value == "ACTIVE" and not self.instance.routers.filter(status="ONLINE").exists():
            raise serializers.ValidationError(
                "Verify at least one router (status Online) before activating this place."
            )
        return value
