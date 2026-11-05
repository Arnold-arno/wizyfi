# apps/platform_admin/views.py
#
# CHANGED (Round 20):
#  * GET /agents/ is PAGINATED server-side: ?page ?page_size ?search ?status
#    ?ordering (name, created_at, place_count, last_active, each optionally "-");
#  * PATCH /agents/{id}/ renames an account (audited in platform activity);
#  * agents carry subscription status and amount due (open invoices), via a
#    subquery so joins can never multiply the sum;
#  * "networks" now means routers; places are counted separately (non-archived);
#  * dashboard gains total/new networks and network growth from routers.
#
# Privacy: nothing here reads Place names, Router identities, Connector
# credentials or Customer PII — only counts and account metadata.
from bisect import bisect_right
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count, DecimalField, F, Max, OuterRef, ProtectedError, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.access.models import Session
#from apps.billing.models import Invoice, InvoiceStatus
from apps.common.exceptions import ConflictError
from apps.common.permissions import IsPlatformStaff
from apps.connectors.models import Router
from apps.customers.models import Customer
from apps.organizations.models import Membership, Organization, Role
from apps.places.models import Place

from .models import OrganizationSubscription, Plan, PlatformActivityEvent
from .serializers import (
    AgentChangePlanRequestSerializer,
    AgentDetailSerializer,
    AgentListSerializer,
    AgentSuspendRequestSerializer,
    AgentUpdateSerializer,
    PlanSerializer,
    PlatformActivityEventSerializer,
    PlatformDashboardSerializer,
)
from .services import change_agent_plan, rename_agent, restore_agent, suspend_agent

MONEY = DecimalField(max_digits=12, decimal_places=2)


def _subscription(org):
    try:
        return org.subscription
    except ObjectDoesNotExist:
        return None


def _plan_summary(sub):
    if sub is None:
        return None
    p = sub.plan
    return {
        "id": p.id, "name": p.name, "max_places": p.max_places, "max_networks": p.max_networks,
        "allowed_vendors": p.allowed_vendors or [], "price": p.price, "currency": p.currency,
        "billing_period": p.billing_period,
    }


def _amount_due_subquery():
    open_total = (
        Invoice.objects.filter(organization=OuterRef("pk"), status=InvoiceStatus.OPEN)
        .order_by().values("organization").annotate(t=Sum("amount")).values("t")
    )
    return Coalesce(Subquery(open_total, output_field=MONEY), Value(Decimal("0.00"), output_field=MONEY))


# Allow-listed ordering: never pass a client string to order_by().
_ORDERING = {
    "name": F("name").asc(), "-name": F("name").desc(),
    "created_at": F("created_at").asc(), "-created_at": F("created_at").desc(),
    "place_count": F("place_count").asc(), "-place_count": F("place_count").desc(),
    "last_active": F("last_active").asc(nulls_last=True), "-last_active": F("last_active").desc(nulls_last=True),
}


class AgentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """/api/v1/platform-admin/agents/ — list (paginated), read, rename,
    suspend, restore, change plan."""

    permission_classes = [IsPlatformStaff]
    queryset = Organization.objects.all()

    def _annotated(self):
        return (
            self.get_queryset()
            .select_related("subscription__plan")
            .annotate(
                place_count=Count("places", filter=~Q(places__status="ARCHIVED"), distinct=True),
                last_active=Max("memberships__user__last_login"),
                amount_due=_amount_due_subquery(),
            )
        )

    def list(self, request, *args, **kwargs):
        qs = self._annotated()
        status_filter = request.query_params.get("status")
        if status_filter in ("ACTIVE", "SUSPENDED"):
            qs = qs.filter(status=status_filter)
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(name__icontains=search)
        ordering = _ORDERING.get(request.query_params.get("ordering", "name"), _ORDERING["name"])
        qs = qs.order_by(ordering, "id")

        page = self.paginate_queryset(qs)
        rows = []
        for o in page:
            sub = _subscription(o)
            rows.append({
                "id": o.id, "name": o.name, "status": o.status, "place_count": o.place_count,
                "max_places": sub.plan.max_places if sub else None,
                "plan_name": sub.plan.name if sub else None,
                "subscription_status": sub.status if sub else None,
                "amount_due": o.amount_due, "last_active_at": o.last_active, "created_at": o.created_at,
            })
        return self.get_paginated_response(AgentListSerializer(rows, many=True).data)

    def _detail(self, org):
        org = self._annotated().get(id=org.id)
        sub = _subscription(org)
        owner = Membership.objects.filter(organization=org, role=Role.OWNER).select_related("user").first()
        last_active = Membership.objects.filter(organization=org).aggregate(m=Max("user__last_login"))["m"]
        return AgentDetailSerializer({
            "id": org.id, "name": org.name, "status": org.status,
            "place_count": org.place_count,
            "network_count": Router.objects.filter(place__organization=org).count(),
            "customer_count": Customer.objects.filter(organization=org).count(),
            "active_session_count": Session.objects.filter(place__organization=org, status="ACTIVE").count(),
            "plan": _plan_summary(sub),
            "subscription_status": sub.status if sub else None,
            "current_period_end": sub.current_period_end if sub else None,
            "amount_due": org.amount_due,
            "owner_email": owner.user.email if owner else None,
            "owner_name": owner.user.full_name if owner else None,
            "owner_email_verified": bool(owner and owner.user.email_verified_at),
            "last_active_at": last_active, "created_at": org.created_at,
        }).data

    def retrieve(self, request, *args, **kwargs):
        return Response(self._detail(self.get_object()))

    def partial_update(self, request, *args, **kwargs):
        """PATCH — rename only."""
        org = self.get_object()
        serializer = AgentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rename_agent(org, name=serializer.validated_data["name"], actor=request.user)
        return Response(self._detail(org))

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        org = self.get_object()
        s = AgentSuspendRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        suspend_agent(org, actor=request.user, reason=s.validated_data.get("reason", ""))
        return Response(self._detail(org))

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        org = self.get_object()
        restore_agent(org, actor=request.user)
        return Response(self._detail(org))

    @action(detail=True, methods=["post"], url_path="change-plan")
    def change_plan(self, request, pk=None):
        org = self.get_object()
        s = AgentChangePlanRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            plan = Plan.objects.get(id=s.validated_data["plan_id"], status="ACTIVE")
        except Plan.DoesNotExist:
            raise ConflictError("Plan not found or not active.")
        change_agent_plan(org, plan=plan, actor=request.user)
        return Response(self._detail(org))


# PATCH needs the method allowed on the detail route.
AgentViewSet.http_method_names = ["get", "post", "patch", "head", "options"]


class PlanViewSet(viewsets.ModelViewSet):
    """/api/v1/platform-admin/plans/ — the platform's own billing catalog."""

    permission_classes = [IsPlatformStaff]
    serializer_class = PlanSerializer
    queryset = Plan.objects.all().order_by("price", "name")
    filterset_fields = ["status", "billing_period"]

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise ConflictError("This plan has subscribed organizations. Archive it instead of deleting it.")


class PlatformActivityViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """/api/v1/platform-admin/activity/ — coarse, safe messages only.
    Filter by ?organization=<id> for one agent's timeline."""

    permission_classes = [IsPlatformStaff]
    serializer_class = PlatformActivityEventSerializer
    filterset_fields = ["action", "organization"]

    def get_queryset(self):
        return PlatformActivityEvent.objects.select_related("organization").order_by("-created_at")


# range -> (days covered, bucket size in days).
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
        place_times = sorted(Place.objects.exclude(status="ARCHIVED").values_list("created_at", flat=True))
        network_times = sorted(Router.objects.values_list("created_at", flat=True))

        data = {
            "total_agents": len(org_times),
            "active_agents": Organization.objects.filter(status="ACTIVE").count(),
            "suspended_agents": Organization.objects.filter(status="SUSPENDED").count(),
            "total_places": len(place_times),
            "total_networks": len(network_times),
            "total_active_sessions": Session.objects.filter(status="ACTIVE").count(),
            "new_agents_this_month": len(org_times) - bisect_right(org_times, month_start),
            "new_places_this_month": len(place_times) - bisect_right(place_times, month_start),
            "new_networks_this_month": len(network_times) - bisect_right(network_times, month_start),
            "expected_monthly_revenue": _expected_monthly_revenue(),
            "range": range_key,
            "agent_growth": _growth_series(org_times, days, step, now),
            "network_growth": _growth_series(network_times, days, step, now),
        }
        return Response(PlatformDashboardSerializer(data).data)
