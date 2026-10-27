# apps/access/recurring_serializers.py
from rest_framework import serializers

from .recurring_models import RecurringReset


class RecurringResetCreateSerializer(serializers.Serializer):
    place = serializers.UUIDField()
    scope_type = serializers.ChoiceField(choices=["ROUTER", "ROUTERS", "PLACE"])
    router_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    time_of_day = serializers.TimeField()
    # 0 = Monday ... 6 = Sunday; empty = every day.
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), required=False, default=list
    )


class RecurringResetSerializer(serializers.ModelSerializer):
    # Annotated in the viewset: the earliest still-SCHEDULED occurrence.
    next_occurrence = serializers.DateTimeField(source="next_at", read_only=True, default=None)

    class Meta:
        model = RecurringReset
        fields = [
            "id", "place", "scope_type", "router_ids", "time_of_day", "weekdays",
            "timezone", "is_active", "next_occurrence", "created_at",
        ]
        read_only_fields = fields
