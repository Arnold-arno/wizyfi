# apps/portal/tests.py
import pytest
from django.core.cache import cache
from rest_framework.throttling import ScopedRateThrottle
from unittest.mock import patch

from apps.access.models import AccessPlan, Voucher
from apps.access.codes import generate_code, hash_code, last4_of
from apps.portal.models import PortalConfig


@pytest.mark.django_db
class TestPortalWelcome:
    def test_welcome_for_place_with_no_config_uses_defaults(self, api_client, place):
        resp = api_client.get(f"/api/v1/portal/places/{place.id}/welcome/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["placeName"] == place.name
        assert body["welcomeMessage"] == ""

    def test_welcome_uses_configured_message(self, api_client, place):
        PortalConfig.objects.create(place=place, welcome_message="Welcome to the cafe!")
        resp = api_client.get(f"/api/v1/portal/places/{place.id}/welcome/")
        assert resp.json()["welcomeMessage"] == "Welcome to the cafe!"

    def test_disabled_portal_gives_404(self, api_client, place):
        PortalConfig.objects.create(place=place, is_enabled=False)
        resp = api_client.get(f"/api/v1/portal/places/{place.id}/welcome/")
        assert resp.status_code == 404

    def test_nonexistent_place_gives_404(self, api_client):
        fake_id = "00000000-0000-0000-0000-000000000001"
        resp = api_client.get(f"/api/v1/portal/places/{fake_id}/welcome/")
        assert resp.status_code == 404

    def test_no_authentication_required(self, api_client, place):
        # Explicitly no credentials set — this must still work.
        resp = api_client.get(f"/api/v1/portal/places/{place.id}/welcome/")
        assert resp.status_code == 200


@pytest.mark.django_db
class TestPortalPlans:
    def test_only_active_and_publicly_listed_plans_appear(self, api_client, place, organization):
        AccessPlan.objects.create(
            organization=organization, name="Public Active", price="1000",
            duration_minutes=60, status="ACTIVE", is_publicly_listed=True,
        )
        AccessPlan.objects.create(
            organization=organization, name="Draft Plan", price="1000",
            duration_minutes=60, status="DRAFT", is_publicly_listed=True,
        )
        AccessPlan.objects.create(
            organization=organization, name="Hidden Plan", price="1000",
            duration_minutes=60, status="ACTIVE", is_publicly_listed=False,
        )
        resp = api_client.get(f"/api/v1/portal/places/{place.id}/plans/")
        names = [p["name"] for p in resp.data]
        assert names == ["Public Active"]

    def test_plans_do_not_expose_internal_fields(self, api_client, place, access_plan):
        access_plan.is_publicly_listed = True
        access_plan.save()
        resp = api_client.get(f"/api/v1/portal/places/{place.id}/plans/")
        body = resp.json()
        assert "status" not in body[0]
        assert "createdAt" not in body[0]
        assert "organizationId" not in body[0] and "organization" not in body[0]


@pytest.mark.django_db
class TestPortalRedeem:
    def _make_voucher(self, plan):
        code = generate_code()
        v = Voucher.objects.create(
            plan=plan, code_hash=hash_code(code), code_last4=last4_of(code), status="AVAILABLE"
        )
        return v, code

    def test_full_redeem_flow_creates_session(self, api_client, place, router, access_plan):
        voucher, code = self._make_voucher(access_plan)
        resp = api_client.post(
            f"/api/v1/portal/places/{place.id}/redeem/",
            {"code": code, "macAddress": "AA:BB:CC:DD:EE:FF", "routerId": str(router.id)},
            format="json",
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "ACTIVE"
        assert body["planName"] == access_plan.name
        assert body["expiresAt"] is not None

    def test_redeem_with_router_from_different_place_rejected(
        self, api_client, place, router, access_plan, organization
    ):
        from apps.places.models import Place

        other_place = Place.objects.create(organization=organization, name="Other Place")
        voucher, code = self._make_voucher(access_plan)
        resp = api_client.post(
            f"/api/v1/portal/places/{other_place.id}/redeem/",
            {"code": code, "macAddress": "AA:BB:CC:DD:EE:01", "routerId": str(router.id)},
            format="json",
        )
        assert resp.status_code == 400  # router belongs to `place`, not `other_place`

    def test_double_redeem_via_portal_rejected(self, api_client, place, router, access_plan):
        voucher, code = self._make_voucher(access_plan)
        first = api_client.post(
            f"/api/v1/portal/places/{place.id}/redeem/",
            {"code": code, "macAddress": "AA:BB:CC:DD:EE:02", "routerId": str(router.id)},
            format="json",
        )
        assert first.status_code == 201
        second = api_client.post(
            f"/api/v1/portal/places/{place.id}/redeem/",
            {"code": code, "macAddress": "AA:BB:CC:DD:EE:03", "routerId": str(router.id)},
            format="json",
        )
        assert second.status_code == 409

    def test_invalid_code_rejected(self, api_client, place, router):
        resp = api_client.post(
            f"/api/v1/portal/places/{place.id}/redeem/",
            {"code": "ZZZZ-ZZZZ", "macAddress": "AA:BB:CC:DD:EE:04", "routerId": str(router.id)},
            format="json",
        )
        assert resp.status_code == 409

    def test_missing_fields_give_clean_validation_error(self, api_client, place):
        resp = api_client.post(f"/api/v1/portal/places/{place.id}/redeem/", {}, format="json")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestPortalThrottling:
    """Proves the rate limit actually engages — not just that the scope
    is configured. Uses a deliberately tiny rate and clears the cache
    before/after so this doesn't leak state into other tests."""

    def test_voucher_redeem_throttled_after_limit(self, api_client, place, router):
        cache.clear()
        try:
            with patch.object(
                ScopedRateThrottle, "THROTTLE_RATES", {"portal": "60/min", "voucher_redeem": "2/min"}
            ):
                responses = [
                    api_client.post(
                        f"/api/v1/portal/places/{place.id}/redeem/",
                        {"code": "ZZZZ-ZZZZ", "macAddress": "AA:BB:CC:00:00:00", "routerId": str(router.id)},
                        format="json",
                    )
                    for _ in range(3)
                ]
            # First two hit the (deliberately wrong-code) redeem logic and get 409;
            # the third must be throttled before it even reaches that logic.
            assert responses[0].status_code == 409
            assert responses[1].status_code == 409
            assert responses[2].status_code == 429
        finally:
            cache.clear()
