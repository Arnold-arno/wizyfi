# apps/platform_admin/test_admin_metrics.py  (Round 19 — NOT yet run: no repo on disk when written)
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.platform_admin.models import OrganizationSubscription, Plan

DASH = "/api/v1/platform-admin/dashboard/"


@pytest.mark.django_db
class TestDashboardMetrics:
    def test_default_range_is_30_daily_points_ending_at_current_total(self, platform_client, organization):
        body = platform_client.get(DASH).json()
        assert body["range"] == "30d" and len(body["agentGrowth"]) == 30
        assert body["agentGrowth"][-1]["total"] == body["totalAgents"]

    @pytest.mark.parametrize("key,points", [("7d", 7), ("30d", 30), ("3m", 13), ("6m", 6), ("1y", 13)])
    def test_range_bucket_counts(self, platform_client, key, points):
        assert len(platform_client.get(f"{DASH}?range={key}").json()["agentGrowth"]) == points

    def test_bad_range_rejected(self, platform_client):
        resp = platform_client.get(f"{DASH}?range=forever")
        assert resp.status_code == 400 and "range" in resp.data["fieldErrors"]

    def test_this_month_counts(self, platform_client, organization, place):
        body = platform_client.get(DASH).json()
        assert body["newAgentsThisMonth"] >= 1 and body["newPlacesThisMonth"] >= 1

    def test_new_counts_sum_to_growth_within_window(self, platform_client, organization):
        pts = platform_client.get(f"{DASH}?range=7d").json()["agentGrowth"]
        assert pts[-1]["total"] - pts[0]["total"] == sum(p["new"] for p in pts[1:])

    def test_expected_revenue_monthly_plus_annual_over_twelve(self, platform_client, organization, other_organization):
        monthly = Plan.objects.create(name="M", max_places=5, price="30000.00", billing_period="MONTHLY")
        annual = Plan.objects.create(name="A", max_places=5, price="120000.00", billing_period="ANNUAL")
        OrganizationSubscription.objects.create(organization=organization, plan=monthly)
        OrganizationSubscription.objects.create(organization=other_organization, plan=annual)
        assert Decimal(platform_client.get(DASH).json()["expectedMonthlyRevenue"]) == Decimal("40000.00")

    def test_suspended_agents_do_not_count_toward_expected_revenue(self, platform_client, organization):
        plan = Plan.objects.create(name="M", max_places=5, price="30000.00")
        OrganizationSubscription.objects.create(organization=organization, plan=plan)
        organization.status = "SUSPENDED"
        organization.save()
        assert Decimal(platform_client.get(DASH).json()["expectedMonthlyRevenue"]) == 0

    def test_regular_member_denied(self, auth_client):
        assert auth_client.get(DASH).status_code == 403


@pytest.mark.django_db
class TestLastActive:
    def test_list_and_detail_show_latest_member_login(self, platform_client, organization, user, membership):
        when = timezone.now() - timedelta(days=2)
        type(user).objects.filter(id=user.id).update(last_login=when)
        row = next(a for a in platform_client.get("/api/v1/platform-admin/agents/").json() if a["id"] == str(organization.id))
        assert row["lastActiveAt"] is not None
        detail = platform_client.get(f"/api/v1/platform-admin/agents/{organization.id}/").json()
        assert detail["lastActiveAt"] is not None

    def test_never_signed_in_is_null_and_max_places_exposed(self, platform_client, organization):
        plan = Plan.objects.create(name="P", max_places=7, price="1.00")
        OrganizationSubscription.objects.create(organization=organization, plan=plan)
        row = next(a for a in platform_client.get("/api/v1/platform-admin/agents/").json() if a["id"] == str(organization.id))
        assert row["lastActiveAt"] is None and row["maxPlaces"] == 7

    def test_activity_filterable_by_agent(self, platform_client, organization, other_organization):
        from apps.platform_admin.services import suspend_agent
        suspend_agent(organization, actor=None)
        suspend_agent(other_organization, actor=None)
        resp = platform_client.get(f"/api/v1/platform-admin/activity/?organization={organization.id}").json()
        assert resp["count"] == 1 and resp["results"][0]["organizationId"] == str(organization.id)
