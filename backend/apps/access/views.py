# apps/access/views.py
from django.db import IntegrityError
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin
from apps.places.models import Place

from .models import AccessPlan, HardLogoutEvent, NetworkCycle, Session, Voucher
from .serializers import (
    AccessPlanSerializer,
    HardLogoutEventSerializer,
    HardLogoutScheduleSerializer,
    NetworkCycleSerializer,
    SessionSerializer,
    VoucherBatchCreateSerializer,
    VoucherSerializer,
)
from .services import (
    cancel_hard_logout_event,
    create_voucher_batch_idempotent,
    execute_hard_logout_event,
    revoke_voucher,
    schedule_hard_logout_event,
)


class AccessPlanViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """/api/v1/access-plans/"""

    serializer_class = AccessPlanSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "access_plans:view",
        "retrieve": "access_plans:view",
        "create": "access_plans:create",
        "update": "access_plans:edit",
        "partial_update": "access_plans:edit",
        "destroy": "access_plans:edit",
    }
    filterset_fields = ["status"]
    search_fields = ["name"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return AccessPlan.objects.filter(
            organization_id=membership.organization_id
        ).order_by("name")

    def perform_create(self, serializer):
        membership = self.require_active_membership(self.request)
        try:
            serializer.save(organization_id=membership.organization_id)
        except IntegrityError:
            # Safety net behind validate_price/validate_duration_minutes
            # above — same pattern as Places/Customers/NetworkCycle: a
            # CheckConstraint violation must never reach the client as an
            # unhandled 500.
            raise ValidationError({"detail": ["This plan's price or duration is invalid."]})


class VoucherViewSet(
    OrganizationScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """/api/v1/vouchers/ — read/list/revoke/batch-create only. There is no
    plain `create`: vouchers only come into existence through the batch
    endpoint (doc04 §7: 'Bulk voucher wizard')."""

    serializer_class = VoucherSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "vouchers:view",
        "retrieve": "vouchers:view",
        "revoke": "vouchers:revoke",
        "create_batch": "vouchers:issue",
    }
    filterset_fields = ["status", "plan"]
    search_fields = ["code_last4"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Voucher.objects.filter(
            plan__organization_id=membership.organization_id
        ).select_related("plan").order_by("-created_at")

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        voucher = self.get_object()
        voucher = revoke_voucher(voucher, actor=request.user)
        return Response(VoucherSerializer(voucher).data)

    @action(detail=False, methods=["post"], url_path="batches")
    def create_batch(self, request):
        membership = self.require_active_membership(self.request)

        idempotency_key = request.headers.get("Idempotency-Key") or request.data.get(
            "idempotency_key"
        )
        if not idempotency_key:
            raise ValidationError({"idempotency_key": ["This field (or the Idempotency-Key header) is required."]})

        input_serializer = VoucherBatchCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        validated = input_serializer.validated_data

        try:
            status_code, body = create_voucher_batch_idempotent(
                organization_id=membership.organization_id,
                idempotency_key=idempotency_key,
                plan_id=str(validated["plan_id"]),
                quantity=validated["quantity"],
                expires_at=validated.get("expires_at"),
                prefix=validated.get("prefix", ""),
            )
        except ValueError as exc:
            raise ValidationError({"detail": [str(exc)]})

        return Response(body, status=status_code)


class NetworkCycleViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """/api/v1/network-cycles/"""

    serializer_class = NetworkCycleSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "network_cycles:view",
        "retrieve": "network_cycles:view",
        "create": "network_cycles:manage",
        "update": "network_cycles:manage",
        "partial_update": "network_cycles:manage",
        "destroy": "network_cycles:manage",
    }
    filterset_fields = ["place", "status"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return NetworkCycle.objects.filter(
            place__organization_id=membership.organization_id
        ).select_related("place").order_by("-starts_at")

    def perform_create(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            # Safety net behind the serializer-level check above — covers
            # any path (bulk ops, future direct DB writes) that bypasses
            # serializer validation but still hits the DB constraint.
            raise ValidationError({"ends_at": ["Must be after startsAt."]})

    def perform_update(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({"ends_at": ["Must be after startsAt."]})


class SessionViewSet(OrganizationScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """/api/v1/sessions/ — read-only. Sessions are created by the
    redemption/auth flow (apps.portal, next round) and mutated only by
    the Hard Logout execution path and connection-disconnect actions,
    never by a direct client write (doc07: 'React never owns business
    truth')."""

    serializer_class = SessionSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {"list": "connections:view", "retrieve": "connections:view"}
    filterset_fields = ["status", "place", "router"]

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return Session.objects.filter(
            place__organization_id=membership.organization_id
        ).select_related("customer", "router", "place").order_by("-started_at")


class HardLogoutEventViewSet(
    OrganizationScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """/api/v1/hard-logout-events/ — schedule, list, inspect, cancel.
    No update/destroy: a scheduled event is either cancelled (explicit
    action) or runs to a terminal state; it is never silently edited
    (doc03 §10: 'Immutable event history')."""

    serializer_class = HardLogoutEventSerializer
    permission_classes = [HasPermissionCode]
    required_permission_map = {
        "list": "hard_logout:view",
        "retrieve": "hard_logout:view",
        "create": "hard_logout:schedule",
        "cancel": "hard_logout:cancel",
        # TEMPORARY test-only trigger — see DELIVERY_NOTES: production
        # dispatch is a Celery task calling execute_hard_logout_event()
        # directly, not an HTTP action. Gated behind the same schedule
        # permission for now so it isn't reachable by a lower-privilege
        # role while Celery isn't wired yet.
        "execute": "hard_logout:schedule",
    }

    def get_queryset(self):
        membership = self.require_active_membership(self.request)
        return HardLogoutEvent.objects.filter(
            place__organization_id=membership.organization_id
        ).prefetch_related("target_results").order_by("-scheduled_at")

    def create(self, request, *args, **kwargs):
        membership = self.require_active_membership(self.request)
        input_serializer = HardLogoutScheduleSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        v = input_serializer.validated_data

        try:
            place = Place.objects.get(id=v["place"], organization_id=membership.organization_id)
        except Place.DoesNotExist:
            raise ValidationError({"place": ["Place not found in this organization."]})

        try:
            event = schedule_hard_logout_event(
                place=place,
                scope_type=v["scope_type"],
                router_ids=[str(r) for r in v.get("router_ids", [])],
                scheduled_at=v["scheduled_at"],
                scheduled_timezone=v["scheduled_timezone"],
                created_by=request.user,
                impact_estimate_connections=v.get("impact_estimate_connections"),
            )
        except ValueError as exc:
            raise ValidationError({"detail": [str(exc)]})

        return Response(HardLogoutEventSerializer(event).data, status=201)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        event = self.get_object()
        reason = request.data.get("reason", "")
        event = cancel_hard_logout_event(event, actor=request.user, reason=reason)
        return Response(HardLogoutEventSerializer(event).data)

    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        event = self.get_object()
        event = execute_hard_logout_event(event.id)
        return Response(HardLogoutEventSerializer(event).data)
