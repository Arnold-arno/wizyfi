# apps/access/tests/test_network_cycles.py
import pytest


@pytest.mark.django_db
class TestNetworkCycleValidation:
    def test_ends_before_starts_rejected_cleanly(self, auth_client, place, org_headers):
        resp = auth_client.post(
            "/api/v1/network-cycles/",
            {
                "place": str(place.id), "name": "Bad",
                "startsAt": "2027-01-02T00:00:00Z", "endsAt": "2027-01-01T00:00:00Z",
            },
            format="json", **org_headers,
        )
        assert resp.status_code == 400
        assert "ends_at" in resp.data["fieldErrors"] or "endsAt" in resp.data["fieldErrors"]

    def test_equal_starts_and_ends_rejected(self, auth_client, place, org_headers):
        resp = auth_client.post(
            "/api/v1/network-cycles/",
            {
                "place": str(place.id), "name": "Zero-length",
                "startsAt": "2027-01-01T00:00:00Z", "endsAt": "2027-01-01T00:00:00Z",
            },
            format="json", **org_headers,
        )
        assert resp.status_code == 400

    def test_valid_range_succeeds(self, auth_client, place, org_headers):
        resp = auth_client.post(
            "/api/v1/network-cycles/",
            {
                "place": str(place.id), "name": "Good",
                "startsAt": "2027-01-01T18:00:00Z", "endsAt": "2027-01-01T23:00:00Z",
            },
            format="json", **org_headers,
        )
        assert resp.status_code == 201
        assert resp.data["status"] == "SCHEDULED"
