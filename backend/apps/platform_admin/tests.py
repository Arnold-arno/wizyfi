# apps/platform_admin/tests.py
import pytest

from apps.platform_admin.models import Plan


@pytest.mark.django_db
class TestPrivilegeBoundary:
    """The single most important property of this whole app: regular
    organization members — even OWNERs — must have zero access here,
    and platform staff must never be treated as an organization member."""

    def test_regular_org_owner_denied(self, auth_client):
        resp = auth_client.get("/api/v1/platform-admin/agents/")
        assert resp.status_code == 403

    def test_unauthenticated_denied(self, api_client):
        resp = api_client.get("/api/v1/platform-admin/agents/")
        assert resp.status_code == 401

    def test_inactive_platform_staff_denied(self, api_client, platform_staff_user):
        platform_staff_user.platform_staff.is_active = False
        platform_staff_user.platform_staff.save()
        api_client.force_authenticate(user=platform_staff_user)
        resp = api_client.get("/api/v1/platform-admin/agents/")
        assert resp.status_code == 403

    def test_platform_staff_has_no_organization_membership_by_default(self, platform_staff_user):
        assert platform_staff_user.memberships.count() == 0

    def test_platform_staff_can_access(self, platform_client):
        resp = platform_client.get("/api/v1/platform-admin/agents/")
        assert resp.status_code == 200


@pytest.mark.django_db
class TestAgentListNeverLeaksInternals:
    def test_list_shape_is_the_strict_allow_list_only(
        self, platform_client, organization, place, connector, access_plan
    ):
        resp = platform_client.get("/api/v1/platform-admin/agents/")
        assert resp.status_code == 200
        body = resp.json()
        agent = next(a for a in body if a["id"] == str(organization.id))

        # Only these keys — nothing else leaks through.
        assert set(agent.keys()) == {
            "id", "name", "status", "placeCount", "planName", "createdAt"
        }
        assert agent["placeCount"] == 1

    def test_response_never_contains_place_name_or_connector_secrets(
        self, platform_client, organization, place, connector
    ):
        resp = platform_client.get("/api/v1/platform-admin/agents/")
        body = str(resp.data)
        assert place.name not in body
        assert "hunter2" not in body  # the connector fixture's password
        assert str(connector.id) not in body

    def test_detail_never_contains_customer_pii(self, platform_client, organization, place, org_headers):
        from apps.customers.models import Customer

        Customer.objects.create(organization=organization, phone="+256700000001", full_name="Jane Real Name")

        resp = platform_client.get(f"/api/v1/platform-admin/agents/{organization.id}/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["customerCount"] == 1  # aggregate only
        assert "Jane Real Name" not in str(body)
        assert "+256700000001" not in str(body)

    def test_detail_includes_owner_contact_but_not_router_identity(
        self, platform_client, organization, user, membership, place, router
    ):
        resp = platform_client.get(f"/api/v1/platform-admin/agents/{organization.id}/")
        body = resp.json()
        assert body["ownerEmail"] == user.email  # staff contact — fine to expose
        assert router.identity not in str(body)  # router internals — never


@pytest.mark.django_db
class TestAgentMutations:
    def test_suspend_then_restore(self, platform_client, organization):
        suspend = platform_client.post(
            f"/api/v1/platform-admin/agents/{organization.id}/suspend/",
            {"reason": "non-payment"}, format="json",
        )
        assert suspend.status_code == 200
        assert suspend.data["status"] == "SUSPENDED"

        restore = platform_client.post(f"/api/v1/platform-admin/agents/{organization.id}/restore/")
        assert restore.status_code == 200
        assert restore.data["status"] == "ACTIVE"

    def test_suspend_twice_conflicts(self, platform_client, organization):
        platform_client.post(f"/api/v1/platform-admin/agents/{organization.id}/suspend/", {}, format="json")
        second = platform_client.post(f"/api/v1/platform-admin/agents/{organization.id}/suspend/", {}, format="json")
        assert second.status_code == 409

    def test_suspending_an_org_blocks_its_own_place_creation(
        self, platform_client, auth_client, organization, org_headers
    ):
        platform_client.post(f"/api/v1/platform-admin/agents/{organization.id}/suspend/", {}, format="json")
        resp = auth_client.post("/api/v1/places/", {"name": "Blocked Place"}, format="json", **org_headers)
        assert resp.status_code == 403

    def test_change_plan(self, platform_client, organization):
        plan = Plan.objects.create(name="Pro", max_places=10, price="50000.00")
        resp = platform_client.post(
            f"/api/v1/platform-admin/agents/{organization.id}/change-plan/",
            {"planId": str(plan.id)}, format="json",
        )
        assert resp.status_code == 200
        assert resp.data["plan"]["name"] == "Pro"

    def test_change_to_nonexistent_plan_rejected(self, platform_client, organization):
        fake_id = "00000000-0000-0000-0000-000000000099"
        resp = platform_client.post(
            f"/api/v1/platform-admin/agents/{organization.id}/change-plan/",
            {"planId": fake_id}, format="json",
        )
        assert resp.status_code == 409

    def test_mutations_produce_platform_activity_not_audit_event(self, platform_client, organization):
        from apps.audit.models import AuditEvent
        from apps.platform_admin.models import PlatformActivityEvent

        platform_client.post(f"/api/v1/platform-admin/agents/{organization.id}/suspend/", {}, format="json")

        assert PlatformActivityEvent.objects.filter(organization=organization, action="agent.suspended").exists()
        # Distinct model — the platform's own action must not also create
        # a row in that organization's own AuditEvent log.
        assert not AuditEvent.objects.filter(organization=organization, action__startswith="agent.").exists()


@pytest.mark.django_db
class TestPlanLimitEnforcement:
    def test_no_subscription_means_unlimited(self, auth_client, organization, org_headers):
        for i in range(3):
            resp = auth_client.post(
                "/api/v1/places/", {"name": f"Place {i}"}, format="json", **org_headers
            )
            assert resp.status_code == 201

    def test_plan_limit_blocks_further_creation(self, platform_client, auth_client, organization, org_headers):
        plan = Plan.objects.create(name="Starter", max_places=1, price="0.00")
        platform_client.post(
            f"/api/v1/platform-admin/agents/{organization.id}/change-plan/",
            {"planId": str(plan.id)}, format="json",
        )
        first = auth_client.post("/api/v1/places/", {"name": "Only Place"}, format="json", **org_headers)
        assert first.status_code == 201

        second = auth_client.post("/api/v1/places/", {"name": "Over Limit"}, format="json", **org_headers)
        assert second.status_code == 409


@pytest.mark.django_db
class TestPlatformDashboardAndActivity:
    def test_dashboard_aggregate_counts(self, platform_client, organization, place):
        resp = platform_client.get("/api/v1/platform-admin/dashboard/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["totalAgents"] >= 1
        assert body["totalPlaces"] >= 1

    def test_activity_log_visible_to_platform_staff_only(self, platform_client, auth_client, organization):
        from apps.platform_admin.services import suspend_agent

        suspend_agent(organization, actor=None)
        platform_resp = platform_client.get("/api/v1/platform-admin/activity/")
        assert platform_resp.status_code == 200
        assert platform_resp.data["count"] >= 1

        org_resp = auth_client.get("/api/v1/platform-admin/activity/")
        assert org_resp.status_code == 403
