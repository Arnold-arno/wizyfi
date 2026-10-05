# apps/dashboard/tests.py
from decimal import Decimal

import pytest

from apps.access.models import Session
from apps.commercial.services import record_sale
from apps.customers.models import Customer
from apps.places.models import Place


def _start_session(place, router, organization, mac):
    from django.utils import timezone

    customer = Customer.objects.create(organization=organization, mac_address=mac)
    return Session.objects.create(
        customer=customer, router=router, place=place,
        started_at=timezone.now(), status="ACTIVE",
    )


@pytest.mark.django_db
class TestDashboardAccess:
    def test_requires_org_header(self, auth_client, membership):
        assert auth_client.get("/api/v1/dashboard/").status_code == 403

    def test_unauthenticated_denied(self, api_client):
        assert api_client.get("/api/v1/dashboard/").status_code == 401

    def test_tenant_isolation(self, auth_client, membership, other_org_headers):
        # auth_client's user has no membership in the other organization.
        assert auth_client.get("/api/v1/dashboard/", **other_org_headers).status_code == 403

    def test_read_only_method_only(self, auth_client, org_headers):
        resp = auth_client.post("/api/v1/dashboard/", {}, format="json", **org_headers)
        assert resp.status_code == 403  # no mapped action -> deny by default


@pytest.mark.django_db
class TestDashboardNumbers:
    def test_kpis_and_router_health(self, auth_client, org_headers, organization, place, router):
        router.status = "ONLINE"
        router.save()
        _start_session(place, router, organization, "AA:BB:CC:00:00:01")
        _start_session(place, router, organization, "AA:BB:CC:00:00:02")

        body = auth_client.get("/api/v1/dashboard/", **org_headers).json()

        assert body["kpis"] == {
            "placeCount": 1, "routersOnline": 1, "routersTotal": 1, "activeSessions": 2,
        }
        health = {h["status"]: h["count"] for h in body["routerHealth"]}
        assert health["ONLINE"] == 1
        assert health["OFFLINE"] == 0  # zero-filled, stable legend
        assert len(body["routerHealth"]) == 5

    def test_disconnected_sessions_not_counted(self, auth_client, org_headers, organization, place, router):
        s = _start_session(place, router, organization, "AA:BB:CC:00:00:03")
        s.status = "DISCONNECTED"
        s.save()
        body = auth_client.get("/api/v1/dashboard/", **org_headers).json()
        assert body["kpis"]["activeSessions"] == 0

    def test_top_places_ordered_by_active_sessions(
        self, auth_client, org_headers, organization, place, router, connector
    ):
        from apps.connectors.models import Router

        busy = Place.objects.create(organization=organization, name="Busy Place", status="ACTIVE")
        busy_router = Router.objects.create(place=busy, connector=connector, name="BR", identity="10.0.0.9")
        _start_session(busy, busy_router, organization, "AA:BB:CC:00:00:04")
        _start_session(busy, busy_router, organization, "AA:BB:CC:00:00:05")
        _start_session(place, router, organization, "AA:BB:CC:00:00:06")

        top = auth_client.get("/api/v1/dashboard/", **org_headers).json()["topPlaces"]
        assert [p["name"] for p in top] == ["Busy Place", "Test Place"]
        assert [p["activeSessions"] for p in top] == [2, 1]

    def test_archived_places_excluded(self, auth_client, org_headers, organization, place):
        Place.objects.create(organization=organization, name="Old", status="ARCHIVED")
        body = auth_client.get("/api/v1/dashboard/", **org_headers).json()
        assert body["kpis"]["placeCount"] == 1

    def test_other_organizations_data_never_included(
        self, auth_client, org_headers, other_organization, place
    ):
        Place.objects.create(organization=other_organization, name="Elsewhere", status="ACTIVE")
        record_sale(organization_id=other_organization.id, total=Decimal("999.00"))

        body = auth_client.get("/api/v1/dashboard/", **org_headers).json()
        assert body["kpis"]["placeCount"] == 1
        assert body["sales"]["todayCount"] == 0
        assert [p["name"] for p in body["topPlaces"]] == ["Test Place"]


@pytest.mark.django_db
class TestDashboardSales:
    def test_trend_is_zero_filled_seven_days_ending_today(self, auth_client, org_headers):
        sales = auth_client.get("/api/v1/dashboard/", **org_headers).json()["sales"]
        assert len(sales["trend"]) == 7
        assert sales["currency"] is None
        assert all(float(p["revenue"]) == 0 for p in sales["trend"])

    def test_todays_sales_counted(self, auth_client, org_headers, organization):
        record_sale(organization_id=organization.id, total=Decimal("1500.00"))
        record_sale(organization_id=organization.id, total=Decimal("500.00"))

        sales = auth_client.get("/api/v1/dashboard/", **org_headers).json()["sales"]
        assert sales["currency"] == "UGX"
        assert sales["todayCount"] == 2
        assert float(sales["todayRevenue"]) == 2000.00
        assert float(sales["trend"][-1]["revenue"]) == 2000.00

    def test_refunded_sales_excluded_from_revenue(self, auth_client, org_headers, organization):
        from apps.commercial.services import refund_sale

        sale = record_sale(organization_id=organization.id, total=Decimal("700.00"))
        refund_sale(sale)
        sales = auth_client.get("/api/v1/dashboard/", **org_headers).json()["sales"]
        assert sales["todayCount"] == 0

    def test_multiple_currencies_flagged_not_summed(self, auth_client, org_headers, organization):
        record_sale(organization_id=organization.id, total=Decimal("5000.00"), currency="UGX")
        record_sale(organization_id=organization.id, total=Decimal("3.00"), currency="USD")

        sales = auth_client.get("/api/v1/dashboard/", **org_headers).json()["sales"]
        assert sales["currency"] == "UGX"
        assert sales["multipleCurrencies"] is True
        assert float(sales["todayRevenue"]) == 5000.00  # USD not mixed in

    def test_sales_hidden_without_sales_view(self, auth_client, org_headers, membership):
        membership.revoked_permissions = ["sales:view"]
        membership.save()
        resp = auth_client.get("/api/v1/dashboard/", **org_headers)
        assert resp.status_code == 200  # rest of the dashboard still available
        assert resp.json()["sales"] is None
        assert "kpis" in resp.json()
