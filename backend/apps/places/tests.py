# apps/places/tests.py
import pytest


@pytest.mark.django_db
class TestPlaceCreation:
    def test_requires_org_header(self, auth_client):
        """Regression test for the Round 1 bug: OrganizationScopedMixin
        resolved active_membership AFTER check_permissions ran, so every
        request — including valid ones — was wrongly denied. This test
        would have caught that immediately."""
        resp = auth_client.post("/api/v1/places/", {"name": "No Header Place"}, format="json")
        assert resp.status_code == 403

    def test_owner_can_create_place(self, auth_client, organization, org_headers):
        resp = auth_client.post(
            "/api/v1/places/", {"name": "Ntinda Branch", "timezone": "Africa/Kampala"},
            format="json", **org_headers,
        )
        assert resp.status_code == 201
        assert resp.data["status"] == "SETUP"

    def test_agent_cannot_create_place(self, agent_client, agent_membership, org_headers):
        resp = agent_client.post("/api/v1/places/", {"name": "Agent Place"}, format="json", **org_headers)
        assert resp.status_code == 403

    def test_agent_can_list_places(self, agent_client, agent_membership, place, org_headers):
        resp = agent_client.get("/api/v1/places/", **org_headers)
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_duplicate_name_returns_clean_conflict(self, auth_client, organization, org_headers):
        auth_client.post("/api/v1/places/", {"name": "Dup"}, format="json", **org_headers)
        resp = auth_client.post("/api/v1/places/", {"name": "Dup"}, format="json", **org_headers)
        assert resp.status_code == 409
        assert resp.data["code"] == "CONFLICT"

    def test_missing_name_gives_field_error_not_500(self, auth_client, org_headers):
        resp = auth_client.post("/api/v1/places/", {}, format="json", **org_headers)
        assert resp.status_code == 400
        assert "name" in resp.data["fieldErrors"]

    def test_tenant_isolation(self, auth_client, place, other_org_headers):
        resp = auth_client.get("/api/v1/places/", **other_org_headers)
        # auth_client's user has no membership in other_organization at all,
        # so this should be denied, not merely empty.
        assert resp.status_code == 403

    def test_second_org_of_same_user_sees_no_cross_org_places(
        self, auth_client, user, place, organization
    ):
        from apps.organizations.models import Membership, Organization, Role

        org2 = Organization.objects.create(name="Second Org For Same User")
        Membership.objects.create(user=user, organization=org2, role=Role.OWNER)

        resp = auth_client.get("/api/v1/places/", HTTP_X_ORGANIZATION_ID=str(org2.id))
        assert resp.status_code == 200
        assert resp.data["count"] == 0
