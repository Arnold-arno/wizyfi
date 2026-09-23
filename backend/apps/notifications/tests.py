# apps/notifications/tests.py
import pytest

from apps.notifications.models import Notification, NotificationLevel
from apps.notifications.services import notify


@pytest.mark.django_db
class TestNotificationVisibility:
    def test_own_and_broadcast_both_visible(self, auth_client, user, organization, org_headers):
        Notification.objects.create(
            organization=organization, recipient=user, level=NotificationLevel.INFO, title="Mine"
        )
        Notification.objects.create(
            organization=organization, recipient=None, level=NotificationLevel.INFO, title="Broadcast"
        )
        resp = auth_client.get("/api/v1/notifications/", **org_headers)
        titles = {n["title"] for n in resp.data["results"]}
        assert titles == {"Mine", "Broadcast"}

    def test_does_not_see_other_users_personal_notifications(
        self, auth_client, other_user, organization, org_headers
    ):
        from apps.organizations.models import Membership, Role

        Membership.objects.create(user=other_user, organization=organization, role=Role.AGENT)
        Notification.objects.create(
            organization=organization, recipient=other_user, level=NotificationLevel.INFO,
            title="Not for you",
        )
        resp = auth_client.get("/api/v1/notifications/", **org_headers)
        titles = {n["title"] for n in resp.data["results"]}
        assert "Not for you" not in titles

    def test_tenant_isolation(self, auth_client, organization, other_org_headers):
        Notification.objects.create(
            organization=organization, recipient=None, level=NotificationLevel.INFO, title="X"
        )
        resp = auth_client.get("/api/v1/notifications/", **other_org_headers)
        assert resp.status_code == 403


@pytest.mark.django_db
class TestMarkRead:
    def test_mark_own_notification_read(self, auth_client, user, organization, org_headers):
        n = Notification.objects.create(
            organization=organization, recipient=user, level=NotificationLevel.INFO, title="Mine"
        )
        resp = auth_client.post(f"/api/v1/notifications/{n.id}/mark-read/", **org_headers)
        assert resp.status_code == 200
        n.refresh_from_db()
        assert n.is_read is True

    def test_broadcast_mark_read_is_a_noop_not_a_shared_mutation(
        self, auth_client, organization, org_headers
    ):
        """Regression guard: a broadcast notification (recipient=None) is
        one row shared by the whole organization. Marking it read must
        NOT mutate that shared row, or one person dismissing it would
        mark it read for every other member too."""
        broadcast = Notification.objects.create(
            organization=organization, recipient=None, level=NotificationLevel.INFO, title="Broadcast"
        )
        resp = auth_client.post(f"/api/v1/notifications/{broadcast.id}/mark-read/", **org_headers)
        assert resp.status_code == 200
        broadcast.refresh_from_db()
        assert broadcast.is_read is False  # unchanged — this is the whole point

    def test_mark_all_read_only_touches_own_notifications(
        self, auth_client, user, other_user, organization, org_headers
    ):
        from apps.organizations.models import Membership, Role

        Membership.objects.create(user=other_user, organization=organization, role=Role.AGENT)
        mine = Notification.objects.create(
            organization=organization, recipient=user, level=NotificationLevel.INFO, title="Mine"
        )
        theirs = Notification.objects.create(
            organization=organization, recipient=other_user, level=NotificationLevel.INFO, title="Theirs"
        )
        broadcast = Notification.objects.create(
            organization=organization, recipient=None, level=NotificationLevel.INFO, title="Broadcast"
        )

        resp = auth_client.post("/api/v1/notifications/mark-all-read/", **org_headers)
        assert resp.status_code == 200
        assert resp.data["marked_count"] == 1

        mine.refresh_from_db(); theirs.refresh_from_db(); broadcast.refresh_from_db()
        assert mine.is_read is True
        assert theirs.is_read is False  # untouched
        assert broadcast.is_read is False  # untouched


@pytest.mark.django_db
class TestNotificationWiring:
    def test_hard_logout_completion_broadcasts_notification(self, place, connector, organization, user):
        from django.utils import timezone

        from apps.access.models import Session
        from apps.access.services import execute_hard_logout_event, schedule_hard_logout_event
        from apps.connectors.models import Router
        from apps.customers.models import Customer

        router = Router.objects.create(place=place, connector=connector, name="R1", identity="10.0.0.1")
        customer = Customer.objects.create(organization=organization, mac_address="AA:BB:CC:00:00:01")
        Session.objects.create(
            customer=customer, router=router, place=place, started_at=timezone.now(), status="ACTIVE"
        )

        event = schedule_hard_logout_event(
            place=place, scope_type="ROUTERS", router_ids=[str(router.id)],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=1),
            scheduled_timezone="UTC", created_by=user,
        )
        execute_hard_logout_event(event.id)

        notification = Notification.objects.get(resource_type="HardLogoutEvent", resource_id=str(event.id))
        assert notification.level == NotificationLevel.SUCCESS
        assert notification.recipient is None  # org-wide broadcast
