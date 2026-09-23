# apps/connectors/views.py
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin

from .models import Connector, Router
from .serializers import (
    ConnectorSerializer,
    DisconnectResultSerializer,
    HealthCheckResultSerializer,
    RouterSerializer,
)
from .services import disconnect_session, run_health_check


class ConnectorViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """/api/v1/connectors/ — vendor integrations, scoped through Place →
    Organization. Credentials are write-only at the serializer layer and
    never appear in any response body."""

    serializer_class = ConnectorSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "connectors:view",
        "retrieve": "connectors:view",
        "create": "connectors:manage",
        "update": "connectors:manage",
        "partial_update": "connectors:manage",
        "destroy": "connectors:manage",
    }
    filterset_fields = ["place", "status", "vendor_code"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Connector.objects.filter(
            place__organization_id=membership.organization_id
        ).select_related("place").order_by("name")


class RouterViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """/api/v1/routers/ — includes health-check and connection-test
    actions per doc04 §5 (Router detail: health, heartbeat, capabilities,
    events, actions / Connection test)."""

    serializer_class = RouterSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "routers:view",
        "retrieve": "routers:view",
        "create": "routers:manage",
        "update": "routers:manage",
        "partial_update": "routers:manage",
        "destroy": "routers:manage",
        "health_check": "routers:view",
        "test_connection": "routers:manage",
        "disconnect": "connections:disconnect",
    }
    filterset_fields = ["place", "status"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Router.objects.filter(
            place__organization_id=membership.organization_id
        ).select_related("place", "connector").order_by("name")

    @action(detail=True, methods=["get"], url_path="health")
    def health_check(self, request, pk=None):
        """Cheap, frequent-safe read of current health — does not
        require a network round trip if a recent result is cached
        (left as a future optimization; always live for now, matching
        doc06 'no fake progress')."""
        router = self.get_object()
        result = run_health_check(router)
        return Response(HealthCheckResultSerializer(result.__dict__).data)

    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        """Explicit operator-triggered connection test — distinct from
        the passive health_check GET so it's clearly an action, not a
        cached read (doc04 §5 'Connection test' screen)."""
        router = self.get_object()
        result = run_health_check(router)
        return Response(HealthCheckResultSerializer(result.__dict__).data)

    @action(detail=True, methods=["post"], url_path="disconnect")
    def disconnect(self, request, pk=None):
        """Authorized, explicit disconnect of a single session on this
        router. Exact target identified via session_identifier — no
        broad/ambiguous scope permitted (doc03 §10 safety rule)."""
        router = self.get_object()
        session_identifier = request.data.get("session_identifier", "")
        outcome = disconnect_session(router, session_identifier)
        return Response(DisconnectResultSerializer(outcome.__dict__).data)
