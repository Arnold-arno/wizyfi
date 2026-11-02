# apps/connectors/views.py
#
# CHANGED (Round 20):
#  * SECURITY FIX — tenant isolation on create/update. The serializers accept
#    `place` / `connector` ids from the request body, but nothing checked they
#    belong to the caller's organization, so a member could attach a connector
#    or router to ANOTHER organization's place. Both now verify ownership.
#  * Plan entitlements enforced on the backend: vendor allowed on the plan
#    (connector), network limit (router), PAST_DUE blocks adding, optional
#    verified-email requirement.
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.billing import entitlements
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


def _require_own_place(membership, place):
    if place.organization_id != membership.organization_id:
        raise ValidationError({"place": ["Place not found in this organization."]})


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

    def perform_create(self, serializer):
        membership = self.require_active_membership(self.request)
        _require_own_place(membership, serializer.validated_data["place"])
        entitlements.assert_email_verified(self.request.user)
        entitlements.assert_vendor_allowed(membership.organization, serializer.validated_data["vendor_code"])
        serializer.save()

    def perform_update(self, serializer):
        membership = self.require_active_membership(self.request)
        if "place" in serializer.validated_data:
            _require_own_place(membership, serializer.validated_data["place"])
        if "vendor_code" in serializer.validated_data:
            entitlements.assert_vendor_allowed(membership.organization, serializer.validated_data["vendor_code"])
        serializer.save()


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

    def _check_links(self, membership, data):
        place = data.get("place")
        connector = data.get("connector")
        if place is not None:
            _require_own_place(membership, place)
        if connector is not None:
            if connector.place.organization_id != membership.organization_id:
                raise ValidationError({"connector": ["Connector not found in this organization."]})
            if place is not None and connector.place_id != place.id:
                raise ValidationError({"connector": ["This connector belongs to a different place."]})

    def perform_create(self, serializer):
        membership = self.require_active_membership(self.request)
        self._check_links(membership, serializer.validated_data)
        entitlements.assert_email_verified(self.request.user)
        entitlements.assert_can_add_router(membership.organization)
        serializer.save()

    def perform_update(self, serializer):
        membership = self.require_active_membership(self.request)
        self._check_links(membership, serializer.validated_data)
        serializer.save()

    @action(detail=True, methods=["get"], url_path="health")
    def health_check(self, request, pk=None):
        """Always live, never cached (doc06 'no fake progress')."""
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
