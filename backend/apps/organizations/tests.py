# apps/organizations/tests.py
import pytest

from apps.organizations.models import Membership, Organization, Role


@pytest.mark.django_db
class TestCreateOrganization:
    def test_creates_org_with_owner_membership(self, auth_client, user):
        resp = auth_client.post("/api/v1/organizations/create/", {"name": "New Org"}, format="json")
        assert resp.status_code == 201
        assert resp.data["role"] == "OWNER"
        assert Organization.objects.filter(name="New Org").exists()

    def test_blank_name_rejected(self, auth_client):
        resp = auth_client.post("/api/v1/organizations/create/", {"name": "  "}, format="json")
        assert resp.status_code == 400

    def test_list_only_shows_own_memberships(self, auth_client, membership, other_user):
        # A second, unrelated org should not appear for this user.
        other_org = Organization.objects.create(name="Not Mine")
        Membership.objects.create(user=other_user, organization=other_org, role=Role.OWNER)

        resp = auth_client.get("/api/v1/organizations/")
        names = [m["organization"]["name"] for m in resp.data["results"]]
        assert membership.organization.name in names
        assert "Not Mine" not in names


@pytest.mark.django_db
class TestPermissionMatrix:
    """Direct unit tests of Membership.has_permission — this is the exact
    logic behind Round 1's permission-ordering bug, tested in isolation
    from the HTTP/middleware layer so a regression here is caught
    immediately and unambiguously."""

    def test_owner_has_every_permission(self, membership):
        assert membership.has_permission("access_plans:create")
        assert membership.has_permission("hard_logout:schedule")
        assert membership.has_permission("anything:not_even_real")  # wildcard

    def test_agent_has_view_but_not_create(self, agent_membership):
        assert agent_membership.has_permission("places:view")
        assert not agent_membership.has_permission("places:create")

    def test_agent_can_issue_vouchers_but_not_revoke(self, agent_membership):
        assert agent_membership.has_permission("vouchers:issue")
        assert not agent_membership.has_permission("vouchers:revoke")

    def test_read_only_cannot_disconnect(self):
        from apps.accounts.models import User

        u = User.objects.create_user(email="ro@example.com", password="x", full_name="RO")
        org = Organization.objects.create(name="RO Org")
        m = Membership.objects.create(user=u, organization=org, role=Role.READ_ONLY)
        assert m.has_permission("connections:view")
        assert not m.has_permission("connections:disconnect")

    def test_suspended_membership_denied_even_for_owner_permissions(self, membership):
        membership.status = "SUSPENDED"
        membership.save()
        assert not membership.has_permission("places:view")

    def test_suspended_organization_denies_all_members(self, membership):
        membership.organization.status = "SUSPENDED"
        membership.organization.save()
        assert not membership.has_permission("places:view")

    def test_revoked_permission_overrides_role_grant(self, membership):
        membership.revoked_permissions = ["vouchers:revoke"]
        membership.save()
        assert not membership.has_permission("vouchers:revoke")
        assert membership.has_permission("vouchers:issue")  # unaffected
