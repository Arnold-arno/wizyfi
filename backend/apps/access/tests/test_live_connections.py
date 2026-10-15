# apps/access/tests/test_live_connections.py
# Requires the Round-13 SessionSerializer / SessionViewSet changes (see notes).
import pytest
from django.utils import timezone

from apps.access.models import Session
from apps.customers.models import Customer
from apps.devices.models import Device

URL = "/api/v1/sessions/"


def _session(place, router, organization, plan=None, name="", mac="AA:CC:00:00:00:01", device=None, phone=""):
    customer = Customer.objects.create(organization=organization, full_name=name, mac_address=mac, phone=phone)
    return Session.objects.create(
        customer=customer, router=router, place=place, access_plan=plan, device=device,
        started_at=timezone.now(), status="ACTIVE",
    )


@pytest.mark.django_db
class TestLiveConnectionsShape:
    def test_readable_names_present(self, auth_client, org_headers, place, router, organization, access_plan):
        _session(place, router, organization, plan=access_plan, name="Jane")
        row = auth_client.get(URL, **org_headers).json()["results"][0]
        assert row["placeName"] == "Test Place"
        assert row["routerName"] == "Test Router"
        assert row["accessPlanName"] == "Test Plan"
        assert row["customerLabel"] == "Jane"

    def test_label_falls_back_to_mac_and_phone_never_exposed(self, auth_client, org_headers, place, router, organization):
        _session(place, router, organization, mac="AA:CC:00:00:00:09", phone="+256700000777")
        resp = auth_client.get(URL, **org_headers)
        assert resp.json()["results"][0]["customerLabel"] == "AA:CC:00:00:00:09"
        assert "+256700000777" not in str(resp.json())

    def test_plan_name_null_when_no_plan(self, auth_client, org_headers, place, router, organization):
        _session(place, router, organization)
        assert auth_client.get(URL, **org_headers).json()["results"][0]["accessPlanName"] is None


@pytest.mark.django_db
class TestLiveConnectionsFilters:
    def test_filter_by_device(self, auth_client, org_headers, place, router, organization):
        d = Device.objects.create(place=place, router=router, mac_address="AA:CC:00:00:00:20")
        _session(place, router, organization, mac="AA:CC:00:00:00:20", device=d)
        _session(place, router, organization, mac="AA:CC:00:00:00:21")
        resp = auth_client.get(f"{URL}?device={d.id}", **org_headers)
        assert resp.json()["count"] == 1

    def test_search_by_mac_fragment_and_name(self, auth_client, org_headers, place, router, organization):
        _session(place, router, organization, name="Jane", mac="AA:CC:00:00:00:30")
        _session(place, router, organization, name="Bob", mac="BB:DD:00:00:00:31")
        assert auth_client.get(f"{URL}?search=BB:DD", **org_headers).json()["count"] == 1
        assert auth_client.get(f"{URL}?search=jane", **org_headers).json()["count"] == 1

    def test_tenant_isolation(self, auth_client, place, router, organization, other_org_headers):
        _session(place, router, organization)
        assert auth_client.get(URL, **other_org_headers).status_code == 403
