# apps/platform_admin/serializers.py
#
# Privacy boundary (supadmin spec §2): strict allow-lists of ACCOUNT metadata and
# aggregate counts — never network names, router identities, credentials or
# customer data. Plain serializers.Serializer, NOT ModelSerializer: every field
# is named explicitly so nothing can be added by accident.
#
# CHANGED (Round 19): agent list gains max_places + last_active_at; detail gains
# last_active_at; dashboard gains month deltas, expected revenue and growth series.

from rest_framework import serializers

from .models import Plan


class PlanSerializer(serializers.ModelSerializer):
    """Full CRUD for the platform's own billing catalog (no per-org data)."""

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
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    place_count = serializers.IntegerField()
    max_places = serializers.IntegerField(allow_null=True)
    plan_name = serializers.CharField(allow_null=True)
    last_active_at = serializers.DateTimeField(allow_null=True)
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
    last_active_at = serializers.DateTimeField(allow_null=True)
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


class GrowthPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    total = serializers.IntegerField()  # cumulative count at the end of the bucket
    new = serializers.IntegerField()    # created inside the bucket


class PlatformDashboardSerializer(serializers.Serializer):
    total_agents = serializers.IntegerField()
    active_agents = serializers.IntegerField()
    suspended_agents = serializers.IntegerField()
    total_places = serializers.IntegerField()
    total_active_sessions = serializers.IntegerField()
    new_agents_this_month = serializers.IntegerField()
    new_places_this_month = serializers.IntegerField()
    # Sum of plan prices of ACTIVE agents (annual plans / 12). An EXPECTATION from
    # subscriptions, not collected money: there is no payments model yet.
    expected_monthly_revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    range = serializers.CharField()
    agent_growth = GrowthPointSerializer(many=True)
    network_growth = GrowthPointSerializer(many=True)
