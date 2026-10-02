# apps/access/tests/test_sessions.py
import pytest
from django.utils import timezone
from unittest.mock import patch

from apps.access.models import Session
from apps.connectors.adapters.base import CommandOutcome
from apps.customers.models import Customer


@pytest.mark.django_db
class TestSessionDisconnect:
    """Regression coverage for the doc09 shape fix: disconnect is an
    action on the specific session (the 'Connections' resource), not on
    the router with a session_identifier in the body."""

    def _active_session(self, place, connector, organization):
        from apps.connectors.models import Router

        router = Router.objects.create(place=place, connector=connector, name="R1", identity="10.0.0.1")
        customer = Customer.objects.create(organization=organization, mac_address="AA:CC:00:00:00:01")
        return Session.objects.create(
            customer=customer, router=router, place=place, started_at=timezone.now(), status="ACTIVE"
        )

    def test_disconnect_active_session_succeeds(
        self, auth_client, place, connector, organization, org_headers
    ):
        session = self._active_session(place, connector, organization)
        resp = auth_client.post(
            f"/api/v1/sessions/{session.id}/disconnect/", **org_headers
        )
        assert resp.status_code == 200
        assert resp.data["status"] == "DISCONNECTED"
        session.refresh_from_db()
        assert session.status == "DISCONNECTED"
        assert session.ended_at is not None

    def test_disconnect_already_disconnected_session_is_idempotent(
        self, auth_client, place, connector, organization, org_headers
    ):
        session = self._active_session(place, connector, organization)
        first = auth_client.post(f"/api/v1/sessions/{session.id}/disconnect/", **org_headers)
        second = auth_client.post(f"/api/v1/sessions/{session.id}/disconnect/", **org_headers)
        assert first.status_code == 200
        assert second.status_code == 200  # success, not an error, on repeat

    def test_disconnect_failure_from_adapter_returns_clean_conflict(
        self, auth_client, place, connector, organization, org_headers
    ):
        session = self._active_session(place, connector, organization)
        with patch(
            "apps.access.views.connector_services.disconnect_session",
            return_value=CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE", error_message="router unreachable"),
        ):
            resp = auth_client.post(f"/api/v1/sessions/{session.id}/disconnect/", **org_headers)
        assert resp.status_code == 409
        session.refresh_from_db()
        assert session.status == "ACTIVE"  # unchanged — the failed attempt must not falsely mark it disconnected

    def test_agent_can_disconnect_read_only_cannot(self, place, connector, organization):
        from apps.accounts.models import User
        from apps.organizations.models import Membership, Role
        from rest_framework.test import APIClient

        session = self._active_session(place, connector, organization)
        ro_user = User.objects.create_user(email="ro3@example.com", password="x", full_name="RO3")
        Membership.objects.create(user=ro_user, organization=organization, role=Role.READ_ONLY)
        client = APIClient()
        client.force_authenticate(user=ro_user)
        resp = client.post(
            f"/api/v1/sessions/{session.id}/disconnect/",
            HTTP_X_ORGANIZATION_ID=str(organization.id),
        )
        assert resp.status_code == 403
