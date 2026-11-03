# apps/access/tests/test_access_plan_lifecycle.py  (Round 21 — NOT yet run: repo not on disk when written)
import pytest
from django.utils import timezone

from apps.access.codes import generate_code, hash_code, last4_of
from apps.access.models import AccessPlan, Voucher

PLANS = "/api/v1/access-plans/"


def portal_names(api_client, place):
    return [p["name"] for p in api_client.get(f"/api/v1/portal/places/{place.id}/plans/").json()]


def make_plan(organization, name, **kw):
    return AccessPlan.objects.create(
        organization=organization, name=name, price="1000", duration_minutes=60, status="ACTIVE", **kw
    )


@pytest.mark.django_db
class TestDelete:
    def test_unused_plan_can_be_deleted(self, auth_client, org_headers, organization):
        plan = make_plan(organization, "Unused")
        assert auth_client.delete(f"{PLANS}{plan.id}/", **org_headers).status_code == 204

    def test_plan_with_vouchers_is_a_clean_conflict_not_500(self, auth_client, org_headers, access_plan):
        code = generate_code()
        Voucher.objects.create(plan=access_plan, code_hash=hash_code(code), code_last4=last4_of(code))
        resp = auth_client.delete(f"{PLANS}{access_plan.id}/", **org_headers)
        assert resp.status_code == 409 and resp.data["code"] == "CONFLICT"
        assert AccessPlan.objects.filter(id=access_plan.id).exists()


@pytest.mark.django_db
class TestStatusAndPortalVisibility:
    def test_status_only_patch_works_and_hides_plan_from_portal(self, auth_client, org_headers, api_client, place, access_plan):
        access_plan.is_publicly_listed = True
        access_plan.save()
        assert portal_names(api_client, place) == [access_plan.name]
        resp = auth_client.patch(f"{PLANS}{access_plan.id}/", {"status": "PAUSED"}, format="json", **org_headers)
        assert resp.status_code == 200 and resp.json()["status"] == "PAUSED"
        assert portal_names(api_client, place) == []

    def test_availability_window_is_enforced_on_the_portal(self, api_client, place, organization):
        now = timezone.now()
        day = timezone.timedelta(days=1)
        make_plan(organization, "Open now", available_from=now - day, available_until=now + day)
        make_plan(organization, "Not yet", available_from=now + day)
        make_plan(organization, "Ended", available_until=now - day)
        make_plan(organization, "No window")
        assert sorted(portal_names(api_client, place)) == ["No window", "Open now"]
