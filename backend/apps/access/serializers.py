# apps/access/serializers.py
from rest_framework import serializers

from .codes import format_masked
from .models import (
    AccessPlan,
    HardLogoutEvent,
    HardLogoutTargetResult,
    NetworkCycle,
    Session,
    Voucher,
)


class AccessPlanSerializer(serializers.ModelSerializer):
    # Nested, read-only representation to match the frontend's AccessPlan
    # shape exactly (quota: {dataCapMb, maxConcurrentDevices}, etc.).
    quota = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()

    # The actual writable fields backing those nested objects. These must
    # be real declared serializer fields — not just keys injected into a
    # dict inside to_internal_value — or DRF silently drops them during
    # validation since they don't match anything in self.fields. write_only
    # so they never show up in the output alongside the nested versions.
    data_cap_mb = serializers.IntegerField(required=False, allow_null=True, write_only=True, min_value=0)
    max_concurrent_devices = serializers.IntegerField(
        required=False, allow_null=True, write_only=True, min_value=0
    )
    is_publicly_listed = serializers.BooleanField(required=False, write_only=True)
    available_from = serializers.DateTimeField(required=False, allow_null=True, write_only=True)
    available_until = serializers.DateTimeField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = AccessPlan
        fields = [
            "id", "name", "description", "price", "currency", "duration_minutes",
            "quota", "availability", "status", "created_at", "updated_at",
            "data_cap_mb", "max_concurrent_devices",
            "is_publicly_listed", "available_from", "available_until",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_quota(self, obj):
        return {
            "dataCapMb": obj.data_cap_mb,
            "maxConcurrentDevices": obj.max_concurrent_devices,
        }

    def get_availability(self, obj):
        return {
            "isPubliclyListed": obj.is_publicly_listed,
            "availableFrom": obj.available_from,
            "availableUntil": obj.available_until,
        }

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Must be zero or greater.")
        return value

    def validate_duration_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("Must be greater than zero.")
        return value

    def to_internal_value(self, data):
        # IMPORTANT: the global CamelCaseJSONParser (config/settings/base.py)
        # already converts incoming JSON keys to snake_case — recursively,
        # including inside nested objects — before this method ever runs.
        # So `data["quota"]` here already looks like
        # {"data_cap_mb": ..., "max_concurrent_devices": ...}, NOT the
        # original camelCase the client sent. Flattens those nested dicts
        # onto the explicit fields declared above, which is what actually
        # makes them participate in validation — a dict key with no
        # matching declared field is silently ignored by DRF, which was
        # the real bug here (caught by
        # apps/access/tests/test_access_plans.py): the first version of
        # this method injected keys that had no matching field at all.
        data = data.copy()
        quota = data.pop("quota", None)
        availability = data.pop("availability", None)
        if quota:
            data["data_cap_mb"] = quota.get("data_cap_mb")
            data["max_concurrent_devices"] = quota.get("max_concurrent_devices")
        if availability:
            data["is_publicly_listed"] = availability.get("is_publicly_listed", True)
            data["available_from"] = availability.get("available_from")
            data["available_until"] = availability.get("available_until")
        return super().to_internal_value(data)


class VoucherSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    masked_code = serializers.SerializerMethodField()

    class Meta:
        model = Voucher
        fields = [
            "id", "plan", "plan_name", "masked_code", "status",
            "issued_at", "redeemed_at", "redeemed_by_customer_id", "expires_at", "created_at",
        ]
        read_only_fields = fields

    def get_masked_code(self, obj):
        return format_masked(obj.code_last4)


class VoucherBatchCreateSerializer(serializers.Serializer):
    plan_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=5000)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    prefix = serializers.CharField(required=False, allow_blank=True, max_length=16)


class NetworkCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetworkCycle
        fields = ["id", "place", "name", "starts_at", "ends_at", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError(
                {"ends_at": ["Must be after startsAt."]}
            )
        return attrs


class SessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = [
            "id", "customer", "device", "router", "place", "access_plan", "voucher",
            "started_at", "expires_at", "ended_at", "status",
        ]
        read_only_fields = fields


class HardLogoutScheduleSerializer(serializers.Serializer):
    """Input shape for scheduling — doc03 §9 scheduling contract."""

    place = serializers.UUIDField()
    scope_type = serializers.ChoiceField(choices=["ROUTER", "ROUTERS", "PLACE"])
    router_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    scheduled_at = serializers.DateTimeField()
    scheduled_timezone = serializers.CharField(max_length=64)
    impact_estimate_connections = serializers.IntegerField(required=False, allow_null=True)


class HardLogoutTargetResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = HardLogoutTargetResult
        fields = ["id", "router", "status", "attempted_at", "completed_at", "error_code", "error_message"]
        read_only_fields = fields


class HardLogoutEventSerializer(serializers.ModelSerializer):
    target_results = HardLogoutTargetResultSerializer(many=True, read_only=True)

    class Meta:
        model = HardLogoutEvent
        fields = [
            "id", "place", "scope_type", "router_ids", "scheduled_at", "scheduled_timezone",
            "impact_estimate_connections", "created_by", "status", "started_at", "completed_at",
            "cancelled_at", "cancelled_by", "cancel_reason", "succeeded_count", "failed_count",
            "target_results", "created_at",
        ]
        read_only_fields = fields
