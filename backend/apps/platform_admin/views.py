# apps/platform_admin/views.py
#
# CHANGED (Round 19):
#  * agents list/detail expose last_active_at (latest sign-in among the agent's
#    members) and max_places, so the UI can show plan capacity;
#  * dashboard adds "this month" deltas, expected monthly revenue and growth
#    series with a ?range= filter (7d, 30d, 3m, 6m, 1y);
#  * PlanViewSet.perform_destroy returns a clean 409 for plans in use (this was
#    listed as a manual edit in Round 11 and was missing from the pasted file).
#
# Privacy: nothing here reads Place names, Router identities, Connector
# credentials or Customer PII — only counts and account metadata.
from bisect import bisect_right
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count, Max, ProtectedError
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.access.models import Session
from apps.common.exceptions import ConflictError
from apps.common.permissions import IsPlatformStaff
from apps.customers.models import Customer
from apps.organizations.models import Membership, Organization, Role
from apps.places.models import Place

from .models import OrganizationSubscription, Plan, PlatformActivityEvent
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


def _max_places(org):
    try:
        return org.subscription.plan.max_places
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
    """/api/v1/platform-admin/agents/ — read/suspend/restore/change-plan only."""

    permission_classes = [IsPlatformStaff]
    queryset = Organization.objects.all()

    def list(self, request, *args, **kwargs):
        orgs = (
            self.get_queryset()
            .select_related("subscription__plan")
            .annotate(
                place_count=Count("places", distinct=True),
                last_active=Max("memberships__user__last_login"),
            )
            .order_by("name")
        )
        data = [
            {
                "id": o.id, "name": o.name, "status": o.status,
                "place_count": o.place_count, "max_places": _max_places(o),
                "plan_name": _plan_name(o), "last_active_at": o.last_active,
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
        last_active = Membership.objects.filter(organization=org).aggregate(
            m=Max("user__last_login")
        )["m"]
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
            "last_active_at": last_active,
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
    """/api/v1/platform-admin/plans/ — the platform's own billing catalog."""

    permission_classes = [IsPlatformStaff]
    serializer_class = PlanSerializer
    queryset = Plan.objects.all().order_by("name")
    filterset_fields = ["status", "billing_period"]

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ConflictError(
                "This plan has subscribed organizations. Archive it instead of deleting it."
            )


class PlatformActivityViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """/api/v1/platform-admin/activity/ — coarse, safe messages only.
    Filter by ?organization=<id> for one agent's timeline."""

    permission_classes = [IsPlatformStaff]
    serializer_class = PlatformActivityEventSerializer
    filterset_fields = ["action", "organization"]

    def get_queryset(self):
        return PlatformActivityEvent.objects.select_related("organization").order_by("-created_at")


# range -> (days covered, bucket size in days). 3m/6m/1y use 7/30/30-day buckets.
RANGES = {"7d": (7, 1), "30d": (30, 1), "3m": (90, 7), "6m": (180, 30), "1y": (365, 30)}


def _growth_series(created_times: list, days: int, step: int, now) -> list[dict]:
    """Cumulative + new counts at the end of each bucket, ending at `now`.
    `created_times` must be sorted ascending."""
    buckets = -(-days // step)  # ceil
    edges = [now - timedelta(days=step * (buckets - i - 1)) for i in range(buckets)]
    points, previous = [], bisect_right(created_times, edges[0] - timedelta(days=step))
    for edge in edges:
        total = bisect_right(created_times, edge)
        points.append({"date": edge.date(), "total": total, "new": total - previous})
        previous = total
    return points


def _expected_monthly_revenue() -> Decimal:
    total = Decimal("0")
    subs = OrganizationSubscription.objects.filter(organization__status="ACTIVE").select_related("plan")
    for sub in subs:
        price = sub.plan.price
        total += price if sub.plan.billing_period == "MONTHLY" else price / Decimal("12")
    return total.quantize(Decimal("0.01"))


class PlatformDashboardView(APIView):
    permission_classes = [IsPlatformStaff]

    def get(self, request):
        range_key = request.query_params.get("range", "30d")
        if range_key not in RANGES:
            raise ValidationError({"range": [f"Choose one of: {', '.join(RANGES)}."]})
        days, step = RANGES[range_key]

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        org_times = sorted(Organization.objects.values_list("created_at", flat=True))
        place_times = sorted(Place.objects.values_list("created_at", flat=True))

        data = {
            "total_agents": len(org_times),
            "active_agents": Organization.objects.filter(status="ACTIVE").count(),
            "suspended_agents": Organization.objects.filter(status="SUSPENDED").count(),
            "total_places": len(place_times),
            "total_active_sessions": Session.objects.filter(status="ACTIVE").count(),
            "new_agents_this_month": len(org_times) - bisect_right(org_times, month_start),
            "new_places_this_month": len(place_times) - bisect_right(place_times, month_start),
            "expected_monthly_revenue": _expected_monthly_revenue(),
            "range": range_key,
            "agent_growth": _growth_series(org_times, days, step, now),
            "network_growth": _growth_series(place_times, days, step, now),
        }
        return Response(PlatformDashboardSerializer(data).data)
