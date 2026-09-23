# apps/devices/tests.py
import pytest

from apps.devices.models import Device


@pytest.mark.django_db
class TestDevices:
    def test_list_devices(self, auth_client, place, org_headers):
        Device.objects.create(place=place, mac_address="AA:BB:CC:00:00:01")
        resp = auth_client.get("/api/v1/devices/", **org_headers)
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_no_create_endpoint(self, auth_client, org_headers):
        """Devices are populated by the network-observation pipeline, not
        typed in by an operator (doc04). ReadOnlyModelViewSet has no
        `create` action, so HasPermissionCode's deny-by-default rule
        (no entry in required_permission_map for this action -> denied)
        intercepts before DRF's own 405-method-not-allowed logic would —
        the request is rejected with 403, not 405. That's a stricter,
        more conservative outcome than a plain 405 and is the correct
        behavior, not a bug."""
        resp = auth_client.post(
            "/api/v1/devices/", {"macAddress": "AA:BB:CC:00:00:02"}, format="json", **org_headers
        )
        assert resp.status_code == 403

    def test_search_by_mac_fragment(self, auth_client, place, org_headers):
        Device.objects.create(place=place, mac_address="AA:BB:CC:11:11:11", hostname="phone-1")
        Device.objects.create(place=place, mac_address="FF:FF:FF:22:22:22", hostname="laptop-1")
        resp = auth_client.get("/api/v1/devices/?search=laptop", **org_headers)
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["hostname"] == "laptop-1"
