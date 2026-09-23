# apps/audit/views.py
from rest_framework import viewsets

from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin

from .models import AuditEvent
from .serializers import AuditEventSerializer


class AuditEventViewSet(OrganizationScopedMixin, viewsets.ReadOnlyModelViewSet):
    """/api/v1/audit-events/ — list/retrieve only. There is no create,
    update, or destroy action anywhere in this app (doc11: 'restricted
    writes'); events are only ever produced by apps.audit.services.record_event
    called from domain services, never through this API."""

    serializer_class = AuditEventSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {"list": "audit:view", "retrieve": "audit:view"}
    filterset_fields = ["action", "resource_type", "actor_type"]
    search_fields = ["resource_id", "action"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return AuditEvent.objects.filter(
            organization_id=membership.organization_id
        ).select_related("actor").order_by("-created_at")
