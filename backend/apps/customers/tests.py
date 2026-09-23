# apps/customers/tests.py
import pytest


@pytest.mark.django_db
class TestConditionalUniqueness:
    """Regression suite for the specific bug Expectations_and_workflow
    flagged: a plain UniqueConstraint on (organization, phone) treats
    every blank phone as a duplicate of every other blank phone, breaking
    voucher-only (MAC-only) customer creation."""

    def test_multiple_blank_phone_customers_allowed(self, auth_client, org_headers):
        r1 = auth_client.post(
            "/api/v1/customers/", {"macAddress": "AA:BB:CC:00:00:01"}, format="json", **org_headers
        )
        r2 = auth_client.post(
            "/api/v1/customers/", {"macAddress": "AA:BB:CC:00:00:02"}, format="json", **org_headers
        )
        assert r1.status_code == 201
        assert r2.status_code == 201  # this is the exact case that used to break

    def test_duplicate_phone_rejected(self, auth_client, org_headers):
        auth_client.post(
            "/api/v1/customers/", {"phone": "+256700000001"}, format="json", **org_headers
        )
        resp = auth_client.post(
            "/api/v1/customers/", {"phone": "+256700000001"}, format="json", **org_headers
        )
        assert resp.status_code == 409

    def test_duplicate_mac_rejected(self, auth_client, org_headers):
        auth_client.post(
            "/api/v1/customers/", {"macAddress": "AA:BB:CC:00:00:09"}, format="json", **org_headers
        )
        resp = auth_client.post(
            "/api/v1/customers/", {"macAddress": "AA:BB:CC:00:00:09"}, format="json", **org_headers
        )
        assert resp.status_code == 409

    def test_same_phone_allowed_in_different_org(
        self, auth_client, org_headers, user, organization
    ):
        from apps.organizations.models import Membership, Organization, Role

        org2 = Organization.objects.create(name="Different Org")
        Membership.objects.create(user=user, organization=org2, role=Role.OWNER)

        auth_client.post(
            "/api/v1/customers/", {"phone": "+256700000099"}, format="json", **org_headers
        )
        resp = auth_client.post(
            "/api/v1/customers/", {"phone": "+256700000099"}, format="json",
            HTTP_X_ORGANIZATION_ID=str(org2.id),
        )
        assert resp.status_code == 201  # scoped per-org, not global
