# apps/platform_admin/views.py
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.access.models import Session
from apps.common.exceptions import ConflictError
from apps.common.permissions import IsPlatformStaff
from apps.customers.models import Customer
from apps.organizations.models import Membership, Organization, Role
from apps.places.models import Place

from .models import Plan, PlatformActivityEvent
from .serializers import (
    AgentChangePlanRequestSerializer,
    AgentDetailSerializer,
    AgentListSerializer,
    AgentSuspendRequestSerializer,
    PlanSerializer,
    PlatformActivityEventSerializer,
    PlatformDashboardSerializer,
)
from .services import change_agent_plan, restore_agent, suspend_agent


def _plan_name(org):
    try:
        return org.subscription.plan.name
    except ObjectDoesNotExist:
        return None


def _plan_summary(org):
    try:
        sub = org.subscription
    except ObjectDoesNotExist:
        return None
    return {
        "id": sub.plan.id, "name": sub.plan.name, "max_places": sub.plan.max_places,
        "price": sub.plan.price, "billing_period": sub.plan.billing_period,
    }


class AgentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """/api/v1/platform-admin/agents/ — read/suspend/restore/change-plan
    only. Every representation goes through the strict allow-list
    serializers in serializers.py; nothing here ever queries or exposes
    Place names, Router identities, Connector credentials, or Customer
    PII, per doc11's Super Admin privacy boundary."""

    permission_classes = [IsPlatformStaff]
    queryset = Organization.objects.all()

    def list(self, request, *args, **kwargs):
        orgs = (
            self.get_queryset()
            .select_related("subscription__plan")
            .annotate(place_count=Count("places", distinct=True))
            .order_by("name")
        )
        data = [
            {
                "id": o.id, "name": o.name, "status": o.status,
                "place_count": o.place_count, "plan_name": _plan_name(o),
                "created_at": o.created_at,
            }
            for o in orgs
        ]
        return Response(AgentListSerializer(data, many=True).data)

    def retrieve(self, request, *args, **kwargs):
        org = self.get_object()
        owner_membership = (
            Membership.objects.filter(organization=org, role=Role.OWNER)
            .select_related("user").first()
        )
        data = {
            "id": org.id, "name": org.name, "status": org.status,
            "place_count": Place.objects.filter(organization=org).count(),
            "customer_count": Customer.objects.filter(organization=org).count(),
            "active_session_count": Session.objects.filter(
                place__organization=org, status="ACTIVE"
            ).count(),
            "plan": _plan_summary(org),
            "owner_email": owner_membership.user.email if owner_membership else None,
            "owner_name": owner_membership.user.full_name if owner_membership else None,
            "created_at": org.created_at,
        }
        return Response(AgentDetailSerializer(data).data)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        org = self.get_object()
        input_serializer = AgentSuspendRequestSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        suspend_agent(org, actor=request.user, reason=input_serializer.validated_data.get("reason", ""))
        return self.retrieve(request, pk=pk)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        org = self.get_object()
        restore_agent(org, actor=request.user)
        return self.retrieve(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="change-plan")
    def change_plan(self, request, pk=None):
        org = self.get_object()
        input_serializer = AgentChangePlanRequestSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        try:
            plan = Plan.objects.get(id=input_serializer.validated_data["plan_id"], status="ACTIVE")
        except Plan.DoesNotExist:
            raise ConflictError("Plan not found or not active.")
        change_agent_plan(org, plan=plan, actor=request.user)
        return self.retrieve(request, pk=pk)


class PlanViewSet(viewsets.ModelViewSet):
    """/api/v1/platform-admin/plans/ — the platform's own billing
    catalog. Full CRUD; Plan carries no per-organization data."""

    permission_classes = [IsPlatformStaff]
    serializer_class = PlanSerializer
    queryset = Plan.objects.all().order_by("name")
    filterset_fields = ["status", "billing_period"]


class PlatformActivityViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """/api/v1/platform-admin/activity/ — coarse, safe messages only
    (see PlatformActivityEvent's docstring for why this is a separate
    model from apps.audit.AuditEvent, not a filtered view of it)."""

    permission_classes = [IsPlatformStaff]
    serializer_class = PlatformActivityEventSerializer
    filterset_fields = ["action", "organization"]

    def get_queryset(self):
        return PlatformActivityEvent.objects.select_related("organization").order_by("-created_at")


class PlatformDashboardView(APIView):
    permission_classes = [IsPlatformStaff]

    def get(self, request):
        data = {
            "total_agents": Organization.objects.count(),
            "active_agents": Organization.objects.filter(status="ACTIVE").count(),
            "suspended_agents": Organization.objects.filter(status="SUSPENDED").count(),
            "total_places": Place.objects.count(),
            "total_active_sessions": Session.objects.filter(status="ACTIVE").count(),
        }
        return Response(PlatformDashboardSerializer(data).data)
