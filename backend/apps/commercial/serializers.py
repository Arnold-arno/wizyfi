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
    class Meta:
        model = Sale
        fields = [
            "id", "place", "customer", "access_plan", "voucher",
            "total", "currency", "status", "sold_at", "created_at",
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
