# apps/organizations/test_membership_permissions.py
import pytest


@pytest.mark.django_db
class TestMembershipPermissionsContract:
    def test_owner_gets_wildcard(self, auth_client, membership):
        results = auth_client.get("/api/v1/organizations/").json()["results"]
        assert results[0]["permissions"] == ["*"]
        assert results[0]["revokedPermissions"] == []

    def test_agent_gets_exact_role_codes(self, agent_client, agent_membership):
        results = agent_client.get("/api/v1/organizations/").json()["results"]
        perms = set(results[0]["permissions"])
        assert "vouchers:issue" in perms
        assert "vouchers:revoke" not in perms
        assert "*" not in perms

    def test_extra_permissions_included(self, agent_client, agent_membership):
        agent_membership.extra_permissions = ["vouchers:revoke"]
        agent_membership.save()
        perms = agent_client.get("/api/v1/organizations/").json()["results"][0]["permissions"]
        assert "vouchers:revoke" in perms

    def test_revoked_listed_so_owner_wildcard_can_be_overridden(self, auth_client, membership):
        membership.revoked_permissions = ["vouchers:revoke"]
        membership.save()
        row = auth_client.get("/api/v1/organizations/").json()["results"][0]
        assert row["permissions"] == ["*"]
        assert row["revokedPermissions"] == ["vouchers:revoke"]

    def test_suspended_organization_has_no_permissions(self, auth_client, membership):
        membership.organization.status = "SUSPENDED"
        membership.organization.save()
        row = auth_client.get("/api/v1/organizations/").json()["results"][0]
        assert row["permissions"] == []

    def test_matches_has_permission_for_every_role_code(self, agent_membership, agent_client):
        """The advertised list must never grant something has_permission denies."""
        from apps.organizations.models import DEFAULT_ROLE_PERMISSIONS, Role

        advertised = set(agent_client.get("/api/v1/organizations/").json()["results"][0]["permissions"])
        for code in DEFAULT_ROLE_PERMISSIONS[Role.AGENT]:
            assert agent_membership.has_permission(code)
            assert code in advertised
