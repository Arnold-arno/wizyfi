# conftest.py
#
# Shared fixtures for every app's test suite. `force_authenticate` is used
# instead of a real JWT round-trip in most tests — it exercises the same
# request.user/permission/tenant-scoping code path (that's the part worth
# testing repeatedly); the JWT mechanics themselves are covered separately
# in apps/accounts/tests.py.

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Membership, Organization, Role


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="owner@example.com", password="TestPass123!", full_name="Test Owner"
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        email="other@example.com", password="TestPass123!", full_name="Other User"
    )


@pytest.fixture
def organization(db):
    return Organization.objects.create(name="Test Org")


@pytest.fixture
def other_organization(db):
    return Organization.objects.create(name="Other Org")


@pytest.fixture
def membership(db, user, organization):
    """OWNER membership — passes every permission check (see
    organizations.models.DEFAULT_ROLE_PERMISSIONS)."""
    return Membership.objects.create(user=user, organization=organization, role=Role.OWNER)


@pytest.fixture
def agent_membership(db, other_user, organization):
    """A second, lower-privileged membership on the SAME organization —
    for testing the role matrix, not just tenant isolation."""
    return Membership.objects.create(user=other_user, organization=organization, role=Role.AGENT)


@pytest.fixture
def org_headers(membership):
    return {"HTTP_X_ORGANIZATION_ID": str(membership.organization_id)}


@pytest.fixture
def other_org_headers(other_organization):
    return {"HTTP_X_ORGANIZATION_ID": str(other_organization.id)}


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def agent_client(other_user):
    client = APIClient()
    client.force_authenticate(user=other_user)
    return client


@pytest.fixture
def place(db, organization):
    from apps.places.models import Place

    return Place.objects.create(organization=organization, name="Test Place", status="ACTIVE")


@pytest.fixture
def connector(db, place):
    from apps.connectors.models import Connector

    c = Connector(place=place, vendor_code="MIKROTIK", name="Test Connector")
    c.set_credentials({"username": "admin", "password": "hunter2"})
    c.save()
    return c


@pytest.fixture
def router(db, place, connector):
    from apps.connectors.models import Router

    return Router.objects.create(
        place=place, connector=connector, name="Test Router", identity="10.0.0.1"
    )


@pytest.fixture
def access_plan(db, organization):
    from apps.access.models import AccessPlan

    return AccessPlan.objects.create(
        organization=organization,
        name="Test Plan",
        price="1000.00",
        duration_minutes=60,
        status="ACTIVE",
    )


@pytest.fixture
def platform_staff_user(db):
    from apps.platform_admin.models import PlatformRole, PlatformStaff

    u = User.objects.create_user(
        email="platform@wizyfi.internal", password="TestPass123!", full_name="Platform Staff"
    )
    PlatformStaff.objects.create(user=u, role=PlatformRole.SUPERADMIN)
    return u


@pytest.fixture
def platform_client(platform_staff_user):
    client = APIClient()
    client.force_authenticate(user=platform_staff_user)
    return client
