# apps/access/tests/test_voucher_connect.py  (Round 22 — NOT yet run: repo not on disk when written)
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.access.codes import generate_code, hash_code, last4_of
from apps.access.models import AccessPlan, Session, Voucher
from apps.access.voucher_maintenance import expire_due_vouchers
from apps.audit.models import AuditEvent
from apps.connectors.adapters.base import CommandOutcome
from apps.connectors.health import sweep_router_health
from apps.connectors.models import Connector, Router
from apps.customers.models import Customer

AUTH = "apps.access.connect.connector_services.authorize_session"
OK = CommandOutcome(success=True)
DOWN = CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE")


def voucher_for(plan, **kw):
    code = generate_code()
    v = Voucher.objects.create(plan=plan, code_hash=hash_code(code), code_last4=last4_of(code), status="AVAILABLE", **kw)
    return v, code


def redeem(client, place, router, code, mac):
    return client.post(
        f"/api/v1/portal/places/{place.id}/redeem/",
        {"code": code, "macAddress": mac, "routerId": str(router.id)}, format="json",
    )


@pytest.mark.django_db
class TestAuthorizeAtTheRouter:
    def test_success_activates_and_sends_the_data_cap(self, api_client, place, router, access_plan):
        access_plan.data_cap_mb = 2048
        access_plan.save()
        v, code = voucher_for(access_plan)
        with patch(AUTH, return_value=OK) as m:
            resp = redeem(api_client, place, router, code, "aa-bb-cc-dd-ee-01")
        assert resp.status_code == 201 and resp.json()["status"] == "ACTIVE"
        grant = m.call_args.args[1]
        assert grant.data_cap_mb == 2048 and grant.mac_address == "AA:BB:CC:DD:EE:01"

    def test_router_refusal_restores_the_voucher_and_is_a_clean_503(self, api_client, place, router, access_plan):
        v, code = voucher_for(access_plan)
        with patch(AUTH, return_value=DOWN):
            resp = redeem(api_client, place, router, code, "AA:BB:CC:DD:EE:02")
        assert resp.status_code == 503 and resp.data["code"] == "NETWORK_UNAVAILABLE"
        v.refresh_from_db()
        assert v.status == "AVAILABLE" and v.redeemed_by_customer_id is None
        assert Session.objects.get().status == "FAILED"
        assert AuditEvent.objects.filter(action="session.authorize_failed").exists()
        with patch(AUTH, return_value=OK):  # the customer can simply try again
            assert redeem(api_client, place, router, code, "AA:BB:CC:DD:EE:02").status_code == 201

    def test_adapter_exception_is_handled_like_a_refusal(self, api_client, place, router, access_plan):
        v, code = voucher_for(access_plan)
        with patch(AUTH, side_effect=RuntimeError("boom")):
            assert redeem(api_client, place, router, code, "AA:BB:CC:DD:EE:03").status_code == 503
        v.refresh_from_db()
        assert v.status == "AVAILABLE"

    def test_unsupported_adapter_default_refuses(self):
        from apps.connectors.adapters.base import RouterAdapter, SessionGrant

        class Bare(RouterAdapter):
            def health_check(self): ...
            def list_active_sessions(self): return []
            def disconnect_session(self, s): return OK

        out = Bare("h", {}).authorize_session(SessionGrant("s", "AA:BB:CC:00:00:01", None))
        assert out.success is False and out.error_code == "UNSUPPORTED"


@pytest.mark.django_db
class TestPlanRules:
    def test_paused_plan_blocks_new_redemption(self, api_client, place, router, access_plan):
        v, code = voucher_for(access_plan)
        AccessPlan.objects.filter(id=access_plan.id).update(status="PAUSED")
        resp = redeem(api_client, place, router, code, "AA:BB:CC:DD:EE:04")
        assert resp.status_code == 409
        v.refresh_from_db()
        assert v.status == "AVAILABLE"  # not consumed; works again once the plan is active

    def test_outside_availability_window_blocks_redemption(self, api_client, place, router, access_plan):
        access_plan.available_until = timezone.now() - timezone.timedelta(hours=1)
        access_plan.save()
        v, code = voucher_for(access_plan)
        assert redeem(api_client, place, router, code, "AA:BB:CC:DD:EE:05").status_code == 409

    def test_single_device_by_default(self, api_client, place, router, access_plan):
        v, code = voucher_for(access_plan)
        assert redeem(api_client, place, router, code, "AA:BB:CC:00:10:01").status_code == 201
        assert redeem(api_client, place, router, code, "AA:BB:CC:00:10:02").status_code == 409

    def test_device_limit_shares_one_voucher_and_one_end_time(self, api_client, place, router, access_plan):
        access_plan.max_concurrent_devices = 2
        access_plan.save()
        v, code = voucher_for(access_plan)
        first = redeem(api_client, place, router, code, "AA:BB:CC:00:11:01")
        second = redeem(api_client, place, router, code, "AA:BB:CC:00:11:02")
        third = redeem(api_client, place, router, code, "AA:BB:CC:00:11:03")
        assert first.status_code == second.status_code == 201
        assert second.json()["expiresAt"] == first.json()["expiresAt"]  # extra devices never extend access
        assert third.status_code == 409 and "2 devices" in third.data["message"]

    def test_same_device_reconnect_reauthorizes_instead_of_failing(self, api_client, place, router, access_plan):
        v, code = voucher_for(access_plan)
        a = redeem(api_client, place, router, code, "AA:BB:CC:00:12:01")
        with patch(AUTH, return_value=OK) as m:
            b = redeem(api_client, place, router, code, "AA:BB:CC:00:12:01")
        assert b.status_code == 201 and b.json()["sessionId"] == a.json()["sessionId"]
        m.assert_called_once()
        assert Session.objects.count() == 1

    def test_blocked_customer_cannot_connect_and_voucher_is_kept(self, api_client, place, router, access_plan, organization):
        Customer.objects.create(organization=organization, mac_address="AA:BB:CC:00:13:01", status="BLOCKED")
        v, code = voucher_for(access_plan)
        assert redeem(api_client, place, router, code, "AA:BB:CC:00:13:01").status_code == 409
        v.refresh_from_db()
        assert v.status == "AVAILABLE"


@pytest.mark.django_db
class TestVoucherBatchLimitsAndSummary:
    URL = "/api/v1/vouchers/batches/"

    def _post(self, client, headers, plan, key, **extra):
        return client.post(self.URL, {"planId": str(plan.id), "quantity": 3, **extra}, format="json",
                           HTTP_IDEMPOTENCY_KEY=key, **headers)

    def test_inactive_plan_cannot_get_vouchers(self, auth_client, org_headers, access_plan):
        AccessPlan.objects.filter(id=access_plan.id).update(status="DRAFT")
        assert self._post(auth_client, org_headers, access_plan, "k1").status_code == 400

    def test_expiry_must_be_in_the_future(self, auth_client, org_headers, access_plan):
        resp = self._post(auth_client, org_headers, access_plan, "k2", expiresAt="2020-01-01T00:00:00Z")
        assert resp.status_code == 400

    def test_unused_voucher_cap_per_organization(self, auth_client, org_headers, access_plan, settings):
        settings.VOUCHER_MAX_AVAILABLE_PER_ORG = 4
        assert self._post(auth_client, org_headers, access_plan, "k3").status_code == 201
        resp = self._post(auth_client, org_headers, access_plan, "k4")  # 3 + 3 > 4
        assert resp.status_code == 400 and "limit" in str(resp.data).lower()

    def test_summary_counts_every_status_and_respects_plan_filter(self, auth_client, org_headers, access_plan, organization):
        voucher_for(access_plan); voucher_for(access_plan)
        v, _ = voucher_for(access_plan); Voucher.objects.filter(id=v.id).update(status="REVOKED")
        other = AccessPlan.objects.create(organization=organization, name="Other", price="1", duration_minutes=60, status="ACTIVE")
        voucher_for(other)
        body = auth_client.get("/api/v1/vouchers/summary/", **org_headers).json()
        counts = {c["status"]: c["count"] for c in body["counts"]}
        assert body["total"] == 4 and counts == {"AVAILABLE": 3, "ISSUED": 0, "REDEEMED": 0, "EXPIRED": 0, "REVOKED": 1}
        only = auth_client.get(f"/api/v1/vouchers/summary/?plan={access_plan.id}", **org_headers).json()
        assert only["total"] == 3

    def test_summary_tenant_isolation(self, auth_client, other_org_headers):
        assert auth_client.get("/api/v1/vouchers/summary/", **other_org_headers).status_code == 403


@pytest.mark.django_db
class TestMaintenance:
    def test_expired_vouchers_are_marked_but_redeemed_ones_are_not(self, access_plan):
        past = timezone.now() - timezone.timedelta(days=1)
        old, _ = voucher_for(access_plan, expires_at=past)
        used, _ = voucher_for(access_plan, expires_at=past)
        Voucher.objects.filter(id=used.id).update(status="REDEEMED")
        fresh, _ = voucher_for(access_plan)
        assert expire_due_vouchers() == 1
        for v in (old, used, fresh):
            v.refresh_from_db()
        assert (old.status, used.status, fresh.status) == ("EXPIRED", "REDEEMED", "AVAILABLE")

    def test_router_health_sweep_updates_status_and_skips_provisioning(self, place, connector):
        bad = Connector(place=place, vendor_code="MIKROTIK", name="No creds")
        bad.set_credentials({})
        bad.save()
        stale_ok = Router.objects.create(place=place, connector=connector, name="A", identity="10.0.1.1", status="OFFLINE")
        now_bad = Router.objects.create(place=place, connector=bad, name="B", identity="10.0.1.2", status="ONLINE")
        setting_up = Router.objects.create(place=place, connector=connector, name="C", identity="10.0.1.3", status="PROVISIONING")
        out = sweep_router_health()
        for r in (stale_ok, now_bad, setting_up):
            r.refresh_from_db()
        assert (stale_ok.status, now_bad.status, setting_up.status) == ("ONLINE", "OFFLINE", "PROVISIONING")
        assert stale_ok.last_seen_at is not None and out["checked"] == 2
