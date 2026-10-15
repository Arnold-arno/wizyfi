# apps/access/tests/test_wizyfi_dispatch.py
import pytest
from django.utils import timezone

from apps.access.models import HardLogoutEvent, Session
from apps.access.services import cancel_hard_logout_event, schedule_hard_logout_event
from apps.access.tasks import dispatch_due_hard_logout_events
from apps.customers.models import Customer

URL = "/api/v1/hard-logout-events/"


def _scheduled(place, user):
    return schedule_hard_logout_event(
        place=place, scope_type="PLACE", router_ids=[],
        scheduled_at=timezone.now() + timezone.timedelta(minutes=5),
        scheduled_timezone="UTC", created_by=user,
    )


def _make_due(event):
    HardLogoutEvent.objects.filter(id=event.id).update(
        scheduled_at=timezone.now() - timezone.timedelta(seconds=1)
    )


@pytest.mark.django_db
class TestDispatch:
    def test_future_event_not_dispatched(self, place, user, router):
        event = _scheduled(place, user)
        assert dispatch_due_hard_logout_events() == 0
        event.refresh_from_db()
        assert event.status == "SCHEDULED"

    def test_due_event_runs_without_any_browser(self, place, user, router, organization):
        customer = Customer.objects.create(organization=organization, mac_address="AA:00:00:00:00:01")
        Session.objects.create(customer=customer, router=router, place=place,
                               started_at=timezone.now(), status="ACTIVE")
        event = _scheduled(place, user)
        _make_due(event)
        assert dispatch_due_hard_logout_events() == 1  # CELERY_TASK_ALWAYS_EAGER in test settings
        event.refresh_from_db()
        assert event.status == "COMPLETED"
        assert Session.objects.get().status == "DISCONNECTED"

    def test_cancelled_event_never_dispatched(self, place, user, router):
        event = _scheduled(place, user)
        cancel_hard_logout_event(event, actor=user)
        _make_due(event)
        assert dispatch_due_hard_logout_events() == 0

    def test_second_sweep_does_not_rerun_completed_event(self, place, user, router):
        event = _scheduled(place, user)
        _make_due(event)
        dispatch_due_hard_logout_events()
        assert dispatch_due_hard_logout_events() == 0  # HL-09


@pytest.mark.django_db
class TestScheduleIdempotency:
    PAYLOAD = {"scopeType": "PLACE", "scheduledAt": "2027-01-01T00:00:00Z", "scheduledTimezone": "UTC"}

    def test_same_key_replays_without_duplicate_event(self, auth_client, place, org_headers):
        body = {**self.PAYLOAD, "place": str(place.id)}
        first = auth_client.post(URL, body, format="json", HTTP_IDEMPOTENCY_KEY="hl-1", **org_headers)
        second = auth_client.post(URL, body, format="json", HTTP_IDEMPOTENCY_KEY="hl-1", **org_headers)
        assert first.status_code == 201 and second.status_code == 201
        assert second.data["id"] == first.data["id"]
        assert HardLogoutEvent.objects.count() == 1  # HL-04

    def test_same_key_different_body_conflicts(self, auth_client, place, org_headers):
        body = {**self.PAYLOAD, "place": str(place.id)}
        auth_client.post(URL, body, format="json", HTTP_IDEMPOTENCY_KEY="hl-2", **org_headers)
        other = {**body, "scheduledAt": "2027-02-01T00:00:00Z"}
        resp = auth_client.post(URL, other, format="json", HTTP_IDEMPOTENCY_KEY="hl-2", **org_headers)
        assert resp.status_code == 409
        assert resp.data["code"] == "IDEMPOTENCY_CONFLICT"

    def test_key_is_optional_for_now(self, auth_client, place, org_headers):
        resp = auth_client.post(URL, {**self.PAYLOAD, "place": str(place.id)}, format="json", **org_headers)
        assert resp.status_code == 201
