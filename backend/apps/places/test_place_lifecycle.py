# apps/places/test_place_lifecycle.py
import pytest
from django.utils import timezone

from apps.access.models import Session
from apps.connectors.models import Connector, Router
from apps.customers.models import Customer

URL = "/api/v1/places/"


def _new_place(client, headers, name="Fresh Place"):
    return client.post(URL, {"name": name, "timezone": "Africa/Kampala"}, format="json", **headers)


@pytest.mark.django_db
class TestPlaceCounts:
    def test_router_and_active_connection_counts(self, auth_client, org_headers, organization, place, router):
        c1 = Customer.objects.create(organization=organization, mac_address="AA:11:00:00:00:01")
        c2 = Customer.objects.create(organization=organization, mac_address="AA:11:00:00:00:02")
        Session.objects.create(customer=c1, router=router, place=place, started_at=timezone.now(), status="ACTIVE")
        Session.objects.create(customer=c2, router=router, place=place, started_at=timezone.now(), status="DISCONNECTED")
        row = auth_client.get(URL, **org_headers).json()["results"][0]
        assert row["routerCount"] == 1
        assert row["activeConnectionCount"] == 1  # disconnected not counted, joins not multiplied

    def test_new_place_has_zero_counts(self, auth_client, org_headers):
        resp = _new_place(auth_client, org_headers)
        assert resp.status_code == 201
        assert resp.json()["routerCount"] == 0


@pytest.mark.django_db
class TestPlaceStatusLifecycle:
    def test_cannot_choose_status_on_create(self, auth_client, org_headers):
        resp = auth_client.post(URL, {"name": "X", "status": "ACTIVE"}, format="json", **org_headers)
        assert resp.status_code == 400
        assert "status" in resp.data["fieldErrors"]

    def test_activation_requires_an_online_router(self, auth_client, org_headers):
        created = _new_place(auth_client, org_headers).json()
        assert created["status"] == "SETUP"
        resp = auth_client.patch(f"{URL}{created['id']}/", {"status": "ACTIVE"}, format="json", **org_headers)
        assert resp.status_code == 400
        assert "status" in resp.data["fieldErrors"]

    def test_activation_succeeds_with_online_router(self, auth_client, org_headers):
        from apps.places.models import Place

        created = _new_place(auth_client, org_headers).json()
        p = Place.objects.get(id=created["id"])
        conn = Connector(place=p, vendor_code="MIKROTIK", name="c")
        conn.set_credentials({"username": "a", "password": "b"})
        conn.save()
        Router.objects.create(place=p, connector=conn, name="R", identity="10.1.1.1", status="ONLINE")
        resp = auth_client.patch(f"{URL}{created['id']}/", {"status": "ACTIVE"}, format="json", **org_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACTIVE"

    def test_archive_and_setup_not_settable(self, auth_client, org_headers, place):
        ok = auth_client.patch(f"{URL}{place.id}/", {"status": "ARCHIVED"}, format="json", **org_headers)
        assert ok.status_code == 200 and ok.json()["status"] == "ARCHIVED"
        bad = auth_client.patch(f"{URL}{place.id}/", {"status": "SETUP"}, format="json", **org_headers)
        assert bad.status_code == 400

    def test_editing_name_does_not_touch_status(self, auth_client, org_headers, place):
        resp = auth_client.patch(f"{URL}{place.id}/", {"name": "Renamed"}, format="json", **org_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACTIVE"

    def test_agent_cannot_change_status(self, agent_client, agent_membership, org_headers, place):
        resp = agent_client.patch(f"{URL}{place.id}/", {"status": "ARCHIVED"}, format="json", **org_headers)
        assert resp.status_code == 403


@pytest.mark.django_db
class TestTimezoneValidation:
    def test_invalid_timezone_rejected(self, auth_client, org_headers):
        resp = auth_client.post(URL, {"name": "Bad TZ", "timezone": "Mars/Olympus"}, format="json", **org_headers)
        assert resp.status_code == 400
        assert "timezone" in resp.data["fieldErrors"]

    def test_valid_timezone_accepted(self, auth_client, org_headers):
        resp = auth_client.post(URL, {"name": "Good TZ", "timezone": "Africa/Kampala"}, format="json", **org_headers)
        assert resp.status_code == 201
