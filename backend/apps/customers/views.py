# apps/customers/views.py
from django.db import IntegrityError
from rest_framework import viewsets

from apps.common.exceptions import ConflictError
from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """/api/v1/customers/ — Wi-Fi end-users, org-scoped. Search/filter
    per doc04 §7 ('Users | Search/filter, identity, status, recent
    session | Permission-filtered data')."""

    serializer_class = CustomerSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "customers:view",
        "retrieve": "customers:view",
        "create": "customers:manage",
        "update": "customers:manage",
        "partial_update": "customers:manage",
        "destroy": "customers:manage",
    }
    filterset_fields = ["status"]
    search_fields = ["full_name", "phone", "mac_address"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Customer.objects.filter(
            organization_id=membership.organization_id
        ).order_by("-created_at")

    def perform_create(self, serializer):
        membership = self.require_active_membership(self.request)
        try:
            serializer.save(organization_id=membership.organization_id)
        except IntegrityError:
            # Only reachable when phone or mac_address is actually set —
            # the conditional constraints let any number of blank-valued
            # customers coexist (see models.py).
            raise ConflictError(
                "A customer with this phone number or device already exists "
                "in this organization."
            )
