# apps/devices/views.py
from rest_framework import viewsets

from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin

from .models import Device
from .serializers import DeviceSerializer


class DeviceViewSet(OrganizationScopedMixin, viewsets.ReadOnlyModelViewSet):
    """/api/v1/devices/ — read-only directory (doc04 §6: 'Server-side
    pagination'). Devices are created/updated by the network-observation
    pipeline (connector/adapter layer), not through direct API writes."""

    serializer_class = DeviceSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "devices:view",
        "retrieve": "devices:view",
    }
    filterset_fields = ["place", "router"]
    search_fields = ["mac_address", "hostname"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Device.objects.filter(
            place__organization_id=membership.organization_id
        ).select_related("place", "router").order_by("-last_seen_at")
