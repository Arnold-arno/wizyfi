# apps/commercial/serializers.py
from decimal import Decimal

from rest_framework import serializers

from .models import Sale, Transaction


class SaleCreateSerializer(serializers.Serializer):
    total = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))
    currency = serializers.CharField(max_length=3, default="UGX")
    place_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    access_plan_id = serializers.UUIDField(required=False, allow_null=True)
    voucher_id = serializers.UUIDField(required=False, allow_null=True)
    payment_reference = serializers.CharField(max_length=255, required=False, allow_blank=True)


class SaleSerializer(serializers.ModelSerializer):
    # CHANGED: human-readable names alongside the raw ids, so the Sales table
    # doesn't have to render UUIDs. SaleViewSet.get_queryset already does
    # select_related("place", "customer", "access_plan"), so this adds no
    # queries. Customer is deliberately NOT expanded: the sales list has no
    # need for a customer's name/phone, and PII stays out by default.
    # (Same default=None pattern as audit.AuditEventSerializer.actor_email.)
    place_name = serializers.CharField(source="place.name", read_only=True, default=None)
    access_plan_name = serializers.CharField(source="access_plan.name", read_only=True, default=None)

    class Meta:
        model = Sale
        fields = [
            "id", "place", "place_name", "customer", "access_plan", "access_plan_name",
            "voucher", "total", "currency", "status", "sold_at", "created_at",
        ]
        read_only_fields = fields


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ["id", "sale", "amount", "currency", "status", "reference", "created_at"]
        read_only_fields = fields


class SalesSummarySerializer(serializers.Serializer):
    total_sales = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    refunded_count = serializers.IntegerField()
