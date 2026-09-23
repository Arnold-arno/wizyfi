# apps/access/tests/test_hard_logout.py
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.access.models import HardLogoutEvent, Session
from apps.access.services import (
    cancel_hard_logout_event,
    execute_hard_logout_event,
    schedule_hard_logout_event,
)
from apps.common.exceptions import ConflictError
from apps.connectors.adapters.base import CommandOutcome
from apps.customers.models import Customer


@pytest.mark.django_db
class TestScheduleAndCancelHttp:
    def test_past_scheduled_time_rejected_with_single_clean_message(
        self, auth_client, place, org_headers
    ):
        resp = auth_client.post(
            "/api/v1/hard-logout-events/",
            {
                "place": str(place.id), "scopeType": "PLACE",
                "scheduledAt": "2020-01-01T00:00:00Z", "scheduledTimezone": "UTC",
            },
            format="json", **org_headers,
        )
        assert resp.status_code == 400
        detail = resp.data["fieldErrors"]["detail"]
        # Regression check: must be ONE message, not one ErrorDetail per character.
        assert isinstance(detail, list) and len(detail) == 1
        assert "future" in detail[0]

    def test_schedule_then_cancel(self, auth_client, place, org_headers):
        create = auth_client.post(
            "/api/v1/hard-logout-events/",
            {
                "place": str(place.id), "scopeType": "PLACE",
                "scheduledAt": "2027-01-01T00:00:00Z", "scheduledTimezone": "UTC",
            },
            format="json", **org_headers,
        )
        assert create.status_code == 201
        event_id = create.data["id"]

        cancel = auth_client.post(
            f"/api/v1/hard-logout-events/{event_id}/cancel/",
            {"reason": "testing"}, format="json", **org_headers,
        )
        assert cancel.status_code == 200
        assert cancel.data["status"] == "CANCELLED"

    def test_cancel_twice_conflicts(self, auth_client, place, org_headers):
        create = auth_client.post(
            "/api/v1/hard-logout-events/",
            {
                "place": str(place.id), "scopeType": "PLACE",
                "scheduledAt": "2027-01-01T00:00:00Z", "scheduledTimezone": "UTC",
            },
            format="json", **org_headers,
        )
        event_id = create.data["id"]
        auth_client.post(f"/api/v1/hard-logout-events/{event_id}/cancel/", {}, format="json", **org_headers)
        second = auth_client.post(f"/api/v1/hard-logout-events/{event_id}/cancel/", {}, format="json", **org_headers)
        assert second.status_code == 409

    def test_execute_on_cancelled_is_a_noop(self, auth_client, place, org_headers):
        create = auth_client.post(
            "/api/v1/hard-logout-events/",
            {
                "place": str(place.id), "scopeType": "PLACE",
                "scheduledAt": "2027-01-01T00:00:00Z", "scheduledTimezone": "UTC",
            },
            format="json", **org_headers,
        )
        event_id = create.data["id"]
        auth_client.post(f"/api/v1/hard-logout-events/{event_id}/cancel/", {}, format="json", **org_headers)
        exe = auth_client.post(f"/api/v1/hard-logout-events/{event_id}/execute/", {}, format="json", **org_headers)
        assert exe.status_code == 200
        assert exe.data["status"] == "CANCELLED"

    def test_nonexistent_event_gives_404(self, auth_client, org_headers):
        fake_id = "00000000-0000-0000-0000-000000000001"
        resp = auth_client.post(f"/api/v1/hard-logout-events/{fake_id}/cancel/", {}, format="json", **org_headers)
        assert resp.status_code == 404


@pytest.mark.django_db
class TestExecutionSequence:
    """Direct service-layer tests of the lock -> disconnect -> verify ->
    record -> finalize sequence — the part of this whole backend
    Expectations_and_workflow is most insistent about getting right."""

    def _two_routers_with_active_sessions(self, place, connector, organization):
        from apps.connectors.models import Router

        router1 = Router.objects.create(place=place, connector=connector, name="R1", identity="10.0.0.1")
        router2 = Router.objects.create(place=place, connector=connector, name="R2", identity="10.0.0.2")
        c1 = Customer.objects.create(organization=organization, mac_address="AA:AA:AA:00:00:01")
        c2 = Customer.objects.create(organization=organization, mac_address="AA:AA:AA:00:00:02")
        Session.objects.create(customer=c1, router=router1, place=place, started_at=timezone.now(), status="ACTIVE")
        Session.objects.create(customer=c2, router=router2, place=place, started_at=timezone.now(), status="ACTIVE")
        return router1, router2

    def test_full_success_disconnects_all_sessions(self, place, connector, organization, user):
        router1, router2 = self._two_routers_with_active_sessions(place, connector, organization)
        event = schedule_hard_logout_event(
            place=place, scope_type="ROUTERS", router_ids=[str(router1.id), str(router2.id)],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=1),
            scheduled_timezone="UTC", created_by=user,
        )
        result = execute_hard_logout_event(event.id)

        assert result.status == "COMPLETED"
        assert result.succeeded_count == 2
        assert result.failed_count == 0
        assert Session.objects.filter(status="DISCONNECTED").count() == 2

    def test_partial_outcome_on_one_router_failure(self, place, connector, organization, user):
        router1, router2 = self._two_routers_with_active_sessions(place, connector, organization)
        event = schedule_hard_logout_event(
            place=place, scope_type="ROUTERS", router_ids=[str(router1.id), str(router2.id)],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=1),
            scheduled_timezone="UTC", created_by=user,
        )

        def fake_disconnect(router, session_identifier):
            if router.id == router1.id:
                return CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE", error_message="boom")
            return CommandOutcome(success=True)

        with patch("apps.access.services.connector_services.disconnect_session", side_effect=fake_disconnect):
            result = execute_hard_logout_event(event.id)

        assert result.status == "PARTIAL"
        assert result.succeeded_count == 1
        assert result.failed_count == 1
        failed_target = result.target_results.get(router=router1)
        assert failed_target.status == "FAILED"
        assert failed_target.error_message

    def test_all_routers_fail_gives_failed_status(self, place, connector, organization, user):
        router1, router2 = self._two_routers_with_active_sessions(place, connector, organization)
        event = schedule_hard_logout_event(
            place=place, scope_type="ROUTERS", router_ids=[str(router1.id), str(router2.id)],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=1),
            scheduled_timezone="UTC", created_by=user,
        )
        with patch(
            "apps.access.services.connector_services.disconnect_session",
            return_value=CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE", error_message="down"),
        ):
            result = execute_hard_logout_event(event.id)

        assert result.status == "FAILED"
        assert result.succeeded_count == 0
        assert result.failed_count == 2

    def test_reexecuting_completed_event_does_not_reprocess(self, place, connector, organization, user):
        router1, router2 = self._two_routers_with_active_sessions(place, connector, organization)
        event = schedule_hard_logout_event(
            place=place, scope_type="ROUTERS", router_ids=[str(router1.id), str(router2.id)],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=1),
            scheduled_timezone="UTC", created_by=user,
        )
        execute_hard_logout_event(event.id)
        target_count_before = event.target_results.count()

        result = execute_hard_logout_event(event.id)  # HL-09: must not reprocess

        assert result.target_results.count() == target_count_before
        assert result.status == "COMPLETED"

    def test_place_scope_excludes_disabled_routers(self, place, connector, organization, user):
        from apps.connectors.models import Router

        online_router = Router.objects.create(place=place, connector=connector, name="Online", identity="10.0.0.3")
        disabled_router = Router.objects.create(
            place=place, connector=connector, name="Disabled", identity="10.0.0.4", status="DISABLED"
        )
        c = Customer.objects.create(organization=organization, mac_address="BB:BB:BB:00:00:01")
        Session.objects.create(customer=c, router=online_router, place=place, started_at=timezone.now(), status="ACTIVE")

        event = schedule_hard_logout_event(
            place=place, scope_type="PLACE", router_ids=[],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=1),
            scheduled_timezone="UTC", created_by=user,
        )
        result = execute_hard_logout_event(event.id)

        targeted_router_ids = set(result.target_results.values_list("router_id", flat=True))
        assert online_router.id in targeted_router_ids
        assert disabled_router.id not in targeted_router_ids

    def test_no_fk_dependency_on_voucher_or_access_plan(self):
        """Architectural regression check: HardLogoutEvent must never
        gain a real FK to Voucher/AccessPlan/NetworkCycle/Session — this
        introspects the actual model fields rather than trusting a
        comment to stay true."""
        fk_targets = {
            f.related_model.__name__
            for f in HardLogoutEvent._meta.get_fields()
            if f.is_relation and f.concrete
        }
        forbidden = {"Voucher", "AccessPlan", "NetworkCycle", "Session"}
        assert not (fk_targets & forbidden), f"Forbidden FK found: {fk_targets & forbidden}"
