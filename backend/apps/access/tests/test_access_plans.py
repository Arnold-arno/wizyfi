# apps/access/tests/test_access_plans.py
import pytest


@pytest.mark.django_db
class TestAccessPlanNestedShape:
    def test_create_with_nested_quota_and_availability(self, auth_client, org_headers):
        resp = auth_client.post(
            "/api/v1/access-plans/",
            {
                "name": "1-Day Unlimited", "price": "5000.00", "currency": "UGX",
                "durationMinutes": 1440,
                "quota": {"dataCapMb": None, "maxConcurrentDevices": 2},
                "availability": {"isPubliclyListed": True},
                "status": "ACTIVE",
            },
            format="json", **org_headers,
        )
        assert resp.status_code == 201
        assert resp.data["quota"] == {"dataCapMb": None, "maxConcurrentDevices": 2}
        assert resp.data["availability"]["isPubliclyListed"] is True

    def test_round_trips_on_retrieve(self, auth_client, access_plan, org_headers):
        access_plan.data_cap_mb = 2048
        access_plan.max_concurrent_devices = 3
        access_plan.save()

        resp = auth_client.get(f"/api/v1/access-plans/{access_plan.id}/", **org_headers)
        assert resp.data["quota"]["dataCapMb"] == 2048
        assert resp.data["quota"]["maxConcurrentDevices"] == 3

    def test_negative_price_rejected(self, auth_client, org_headers):
        resp = auth_client.post(
            "/api/v1/access-plans/",
            {"name": "Bad Plan", "price": "-5.00", "durationMinutes": 60},
            format="json", **org_headers,
        )
        # A CheckConstraint violation must never surface as an unhandled 500.
        assert resp.status_code == 400
