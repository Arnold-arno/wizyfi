# apps/platform_admin/test_seed_demo.py  (Round 21 — NOT yet run: repo not on disk when written)
import io

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.access.models import AccessPlan
from apps.accounts.models import User
from apps.organizations.models import Organization
from apps.places.models import Place
from apps.platform_admin.management.commands.seed_demo import DEFAULT_PASSWORD

ADMIN = "admin@demo.wizyfi.test"


def seed():
    call_command("seed_demo", stdout=io.StringIO())


@pytest.mark.django_db
class TestSeedDemo:
    def test_refuses_when_debug_is_off(self, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError):
            seed()
        assert not User.objects.filter(email__endswith="demo.wizyfi.test").exists()

    def test_creates_admin_three_clients_and_users(self, settings, api_client):
        settings.DEBUG = True
        seed()
        assert Organization.objects.filter(name__endswith="(demo)").count() == 3
        assert User.objects.filter(email__endswith="demo.wizyfi.test").count() == 13  # admin + 3 x 4 roles
        login = api_client.post("/api/v1/auth/login/", {"email": ADMIN, "password": DEFAULT_PASSWORD}, format="json")
        assert login.status_code == 200
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        assert api_client.get("/api/v1/auth/me/").json()["isPlatformStaff"] is True

    def test_is_idempotent(self, settings):
        settings.DEBUG = True
        seed()
        seed()
        assert Organization.objects.filter(name__endswith="(demo)").count() == 3
        assert User.objects.filter(email__endswith="demo.wizyfi.test").count() == 13
        assert AccessPlan.objects.filter(organization__name__endswith="(demo)").count() == 15

    def test_portal_lists_only_the_live_plans(self, settings, api_client):
        settings.DEBUG = True
        seed()
        place = Place.objects.get(name="Lakeview Café")
        names = [p["name"] for p in api_client.get(f"/api/v1/portal/places/{place.id}/plans/").json()]
        assert sorted(names) == ["1 hour", "Full day", "Half day", "Until next reset"]  # draft hidden
