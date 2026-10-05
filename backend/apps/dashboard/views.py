# apps/dashboard/views.py
#
# doc04 §4 Dashboard: KPI row, network health, sales trend, top places.
# One aggregate endpoint instead of five round trips from the browser, and
# every number is computed server-side from persisted state (doc00 §4:
# "The UI never invents network state").
#
# Tenant scoping: every query below filters on the caller's *resolved*
# active membership (OrganizationScopedMixin), never on a client-supplied id.
#
# Design notes
#  * "Today" is the UTC calendar day (settings.TIME_ZONE = "UTC"). Organization
#    has no timezone field; Place does. Per-place "today" is a future refinement.
#  * Sales are only returned to members holding sales:view. A member without
#    it gets `sales: null` rather than a 403 — the rest of the dashboard is
#    still theirs to see, and the UI explains the missing section.
#  * Revenue is never summed across currencies. The trend uses the currency
#    with the highest revenue in the window; `multiple_currencies` tells the
#    UI that other currencies exist.

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response

from apps.access.models import Session
from apps.commercial.models import Sale
from apps.common.permissions import HasPermissionCode
from apps.common.views import OrganizationScopedMixin
from apps.connectors.models import Router
from apps.places.models import Place

TREND_DAYS = 7
TOP_PLACES_LIMIT = 5


def _router_health(org_id) -> list[dict]:
    counts = dict(
        Router.objects.filter(place__organization_id=org_id)
        .values_list("status")
        .annotate(n=Count("id"))
    )
    # Every state is always present (zero-filled) so the chart legend is stable.
    return [{"status": code, "count": counts.get(code, 0)} for code, _label in Router.STATUS_CHOICES]


def _top_places(org_id) -> list[dict]:
    places = (
        Place.objects.filter(organization_id=org_id)
        .exclude(status="ARCHIVED")
        .annotate(active_sessions=Count("sessions", filter=Q(sessions__status="ACTIVE")))
        .order_by("-active_sessions", "name")[:TOP_PLACES_LIMIT]
    )
    return [{"id": p.id, "name": p.name, "active_sessions": p.active_sessions} for p in places]


def _sales_block(org_id) -> dict:
    today = timezone.localdate()
    first_day = today - timedelta(days=TREND_DAYS - 1)

    window = Sale.objects.filter(
        organization_id=org_id, status="COMPLETED",
        sold_at__date__gte=first_day, sold_at__date__lte=today,
    )

    by_currency = list(
        window.values("currency").annotate(total=Sum("total")).order_by("-total")
    )
    currency = by_currency[0]["currency"] if by_currency else None

    per_day = {}
    if currency:
        rows = (
            window.filter(currency=currency)
            .annotate(day=TruncDate("sold_at"))
            .values("day")
            .annotate(revenue=Sum("total"), count=Count("id"))
        )
        per_day = {row["day"]: row for row in rows}

    trend = []
    for offset in range(TREND_DAYS):
        day = first_day + timedelta(days=offset)
        row = per_day.get(day)
        trend.append({
            "date": day,
            "revenue": row["revenue"] if row else Decimal("0.00"),
            "count": row["count"] if row else 0,
        })

    today_point = trend[-1]
    return {
        "currency": currency,
        "multiple_currencies": len(by_currency) > 1,
        "today_revenue": today_point["revenue"],
        "today_count": today_point["count"],
        "trend": trend,
    }


class DashboardViewSet(OrganizationScopedMixin, viewsets.ViewSet):
    """GET /api/v1/dashboard/ — org-scoped aggregates for the Dashboard.

    Gated by places:view, which every role holds: the page itself is the
    baseline "overview" screen. Sales detail is additionally gated below."""

    permission_classes = [HasPermissionCode]
    required_permission_map = {"list": "places:view"}

    def list(self, request):
        membership = self.require_active_membership(request)
        org_id = membership.organization_id

        health = _router_health(org_id)
        data = {
            "generated_at": timezone.now(),
            "kpis": {
                "place_count": Place.objects.filter(organization_id=org_id)
                .exclude(status="ARCHIVED").count(),
                "routers_online": next((h["count"] for h in health if h["status"] == "ONLINE"), 0),
                "routers_total": sum(h["count"] for h in health),
                "active_sessions": Session.objects.filter(
                    place__organization_id=org_id, status="ACTIVE"
                ).count(),
            },
            "router_health": health,
            "top_places": _top_places(org_id),
            "sales": _sales_block(org_id) if membership.has_permission("sales:view") else None,
        }
        return Response(data)
