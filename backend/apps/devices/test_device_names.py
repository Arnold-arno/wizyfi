# apps/devices/test_device_names.py
import pytest

from apps.devices.models import Device


@pytest.mark.django_db
class TestDeviceNames:
    def test_place_and_router_names_present(self, auth_client, org_headers, place, router):
        Device.objects.create(place=place, router=router, mac_address="AA:BB:CC:00:10:01")
        row = auth_client.get("/api/v1/devices/", **org_headers).json()["results"][0]
        assert row["placeName"] == "Test Place"
        assert row["routerName"] == "Test Router"

    def test_router_name_null_when_unassigned(self, auth_client, org_headers, place):
        Device.objects.create(place=place, mac_address="AA:BB:CC:00:10:02")
        row = auth_client.get("/api/v1/devices/", **org_headers).json()["results"][0]
        assert row["routerName"] is None
