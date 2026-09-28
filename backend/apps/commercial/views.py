# apps/commercial/views.py
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from django.db.models import Sum, Count, Q

from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin

from .models import Sale, Transaction
from .serializers import (
    SaleCreateSerializer,
    SaleSerializer,
    SalesSummarySerializer,
    TransactionSerializer,
)
from .services import record_sale, refund_sale


class SaleViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                   mixins.CreateModelMixin, viewsets.GenericViewSet):
    """/api/v1/sales/ — the analytical/aggregated view (doc04 §9).
    Created only through record_sale (one Sale + one backing Transaction
    together) — never a bare Sale with no evidentiary Transaction."""

    serializer_class = SaleSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "sales:view", "retrieve": "sales:view", "create": "sales:create",
        "refund": "sales:create", "summary": "sales:view",
    }
    filterset_fields = ["status", "place", "access_plan"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Sale.objects.filter(
            organization_id=membership.organization_id
        ).select_related("place", "customer", "access_plan").order_by("-sold_at")

    def create(self, request, *args, **kwargs):
        membership = self.require_active_membership(self.request)
        input_serializer = SaleCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        v = input_serializer.validated_data

        def _scoped_or_404(model, field, pk):
            if not pk:
                return None
            try:
                return model.objects.get(id=pk, **{field: membership.organization_id})
            except model.DoesNotExist:
                raise ValidationError({field: ["Not found in this organization."]})

        from apps.access.models import AccessPlan, Voucher
        from apps.customers.models import Customer
        from apps.places.models import Place

        place = _scoped_or_404(Place, "organization_id", v.get("place_id"))
        customer = _scoped_or_404(Customer, "organization_id", v.get("customer_id"))
        access_plan = _scoped_or_404(AccessPlan, "organization_id", v.get("access_plan_id"))
        voucher = None
        if v.get("voucher_id"):
            try:
                voucher = Voucher.objects.get(
                    id=v["voucher_id"], plan__organization_id=membership.organization_id
                )
            except Voucher.DoesNotExist:
                raise ValidationError({"voucher_id": ["Not found in this organization."]})

        sale = record_sale(
            organization_id=membership.organization_id,
            total=v["total"], currency=v.get("currency", "UGX"),
            place=place, customer=customer, access_plan=access_plan, voucher=voucher,
            payment_reference=v.get("payment_reference", ""),
        )
        return Response(SaleSerializer(sale).data, status=201)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        sale = self.get_object()
        sale = refund_sale(sale)
        return Response(SaleSerializer(sale).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.get_queryset()
        aggregates = queryset.aggregate(
            total_revenue=Sum("total", filter=Q(status="COMPLETED")),
            refunded_count=Count("id", filter=Q(status="REFUNDED")),
        )
        data = {
            "total_sales": queryset.count(),
            "total_revenue": aggregates["total_revenue"] or 0,
            "refunded_count": aggregates["refunded_count"] or 0,
        }
        return Response(SalesSummarySerializer(data).data)


class TransactionViewSet(OrganizationScopedMixin, mixins.ListModelMixin,
                          mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """/api/v1/transactions/ — the immutable ledger view (doc04 §9).
    Strictly read-only: no create/update/destroy action anywhere in this
    app. Rows only ever come from apps.commercial.services."""

    serializer_class = TransactionSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {"list": "transactions:view", "retrieve": "transactions:view"}
    filterset_fields = ["status", "sale"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Transaction.objects.filter(
            sale__organization_id=membership.organization_id
        ).select_related("sale").order_by("-created_at")
