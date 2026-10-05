# apps/platform_admin/test_plan_delete.py
import pytest

from apps.platform_admin.models import Plan


@pytest.mark.django_db
class TestPlanDeletion:
    def test_unused_plan_can_be_deleted(self, platform_client):
        plan = Plan.objects.create(name="Unused", max_places=1, price="0.00")
        resp = platform_client.delete(f"/api/v1/platform-admin/plans/{plan.id}/")
        assert resp.status_code == 204

    def test_plan_with_subscribers_returns_clean_conflict_not_500(self, platform_client, organization):
        plan = Plan.objects.create(name="In Use", max_places=5, price="10.00")
        platform_client.post(
            f"/api/v1/platform-admin/agents/{organization.id}/change-plan/",
            {"planId": str(plan.id)}, format="json",
        )
        resp = platform_client.delete(f"/api/v1/platform-admin/plans/{plan.id}/")
        assert resp.status_code == 409
        assert resp.json()["code"] == "CONFLICT"
        assert Plan.objects.filter(id=plan.id).exists()
