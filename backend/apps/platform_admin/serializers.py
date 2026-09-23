# apps/platform_admin/serializers.py
#
# doc11: "Server-side privacy boundary in Super Admin: AgentListSerializer/
# AgentDetailSerializer are strict allow-lists returning only aggregate
# counts — never network internals, SSIDs, credentials, or customer data."
#
# These are deliberately plain serializers.Serializer, NOT ModelSerializer
# — a ModelSerializer's ease of "just add the field name" is exactly the
# failure mode this boundary exists to prevent. Every field below is
# named explicitly; nothing can be added by accident.

from rest_framework import serializers

from .models import Plan


class PlanSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for the platform's own billing catalog —
    Plan carries no per-organization or network data, so this is safe
    as a ModelSerializer (unlike the Agent serializers below)."""

    class Meta:
        model = Plan
        fields = ["id", "name", "max_places", "price", "billing_period", "status", "created_at"]
        read_only_fields = ["id", "created_at"]


class PlanSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    max_places = serializers.IntegerField(allow_null=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    billing_period = serializers.CharField()


class AgentListSerializer(serializers.Serializer):
    """Aggregate counts only — never a place name, router identity,
    connector credential, or customer record."""

    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    place_count = serializers.IntegerField()
    plan_name = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()


class AgentDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    place_count = serializers.IntegerField()
    customer_count = serializers.IntegerField()
    active_session_count = serializers.IntegerField()
    plan = PlanSummarySerializer(allow_null=True)
    owner_email = serializers.CharField(allow_null=True)
    owner_name = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()


class AgentSuspendRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class AgentChangePlanRequestSerializer(serializers.Serializer):
    plan_id = serializers.UUIDField()


class PlatformActivityEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    organization_id = serializers.UUIDField(source="organization.id")
    organization_name = serializers.CharField(source="organization.name")
    action = serializers.CharField()
    message = serializers.CharField()
    created_at = serializers.DateTimeField()


class PlatformDashboardSerializer(serializers.Serializer):
    total_agents = serializers.IntegerField()
    active_agents = serializers.IntegerField()
    suspended_agents = serializers.IntegerField()
    total_places = serializers.IntegerField()
    total_active_sessions = serializers.IntegerField()
