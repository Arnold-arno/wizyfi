# apps/access/tests/test_recurring_resets.py
#
# Round 17: recurring Wizyfi resets materialize ordinary one-off events.
from datetime import datetime, time, timedelta, timezone as dt_tz

import pytest
from django.utils import timezone

from apps.access.models import AccessPlan, HardLogoutEvent
from apps.access.recurring import (
    activate_recurring_reset,
    create_recurring_reset,
    deactivate_recurring_reset,
    materialize_all_recurring_resets,
    materialize_rule,
    occurrences_between,
)
from apps.access.recurring_models import RecurringReset, RecurringResetOccurrence
from apps.access.services import cancel_hard_logout_event, start_session
from apps.audit.models import AuditEvent
from apps.common.exceptions import ConflictError
from apps.customers.models import Customer

URL = "/api/v1/recurring-resets/"


def soon_time(minutes=90):
    return (timezone.now() + timedelta(minutes=minutes)).time().replace(second=0, microsecond=0)


def make_rule(place, user, weekdays=(), scope="PLACE", routers=()):
    return create_recurring_reset(
        place=place, scope_type=scope, router_ids=[r.id for r in routers],
        time_of_day=soon_time(), weekdays=list(weekdays), created_by=user,
    )


def scheduled(rule):
    return HardLogoutEvent.objects.filter(recurrence_occurrence__recurring_reset=rule, status="SCHEDULED")


class TestOccurrences:
    def test_daily_in_place_timezone(self):
        rule = RecurringReset(time_of_day=time(0, 0), weekdays=[], timezone="Africa/Kampala")
        start = datetime(2027, 1, 1, 10, 0, tzinfo=dt_tz.utc)
        got = occurrences_between(rule, start, start + timedelta(days=3))
        # Kampala is UTC+3, so local midnight is 21:00 UTC the previous day.
        assert got == [
            datetime(2027, 1, 1, 21, 0, tzinfo=dt_tz.utc),
            datetime(2027, 1, 2, 21, 0, tzinfo=dt_tz.utc),
            datetime(2027, 1, 3, 21, 0, tzinfo=dt_tz.utc),
        ]

    def test_weekday_filter(self):
        rule = RecurringReset(time_of_day=time(9, 0), weekdays=[0], timezone="UTC")  # Mondays
        start = datetime(2027, 1, 1, 0, 0, tzinfo=dt_tz.utc)  # a Friday
        got = occurrences_between(rule, start, start + timedelta(days=14))
        assert got == [datetime(2027, 1, 4, 9, 0, tzinfo=dt_tz.utc), datetime(2027, 1, 11, 9, 0, tzinfo=dt_tz.utc)]

    def test_start_is_exclusive_end_inclusive(self):
        rule = RecurringReset(time_of_day=time(9, 0), weekdays=[], timezone="UTC")
        at = datetime(2027, 1, 4, 9, 0, tzinfo=dt_tz.utc)
        assert at not in occurrences_between(rule, at, at + timedelta(hours=1))
        assert at in occurrences_between(rule, at - timedelta(hours=1), at)


@pytest.mark.django_db
class TestMaterialize:
    def test_creates_lookahead_events_with_audit(self, place, user):
        rule = make_rule(place, user)
        assert scheduled(rule).count() == 2
        assert RecurringResetOccurrence.objects.filter(recurring_reset=rule).count() == 2
        assert AuditEvent.objects.filter(action="hard_logout.recurrence_created").exists()
        assert all(e.created_by_id == user.id for e in scheduled(rule))

    def test_is_idempotent(self, place, user):
        rule = make_rule(place, user)
        assert materialize_rule(rule.id) == 0
        assert materialize_all_recurring_resets() == 0
        assert scheduled(rule).count() == 2

    def test_cancelled_occurrence_is_not_recreated_and_next_one_is_added(self, place, user):
        rule = make_rule(place, user)
        first = scheduled(rule).order_by("scheduled_at").first()
        cancel_hard_logout_event(first, actor=user)
        assert materialize_rule(rule.id) == 1
        assert scheduled(rule).count() == 2
        assert not scheduled(rule).filter(id=first.id).exists()
        assert RecurringResetOccurrence.objects.filter(recurring_reset=rule, scheduled_at=first.scheduled_at).count() == 1

    def test_suspended_organization_gets_no_events(self, place, user, organization):
        organization.status = "SUSPENDED"
        organization.save()
        rule = make_rule(place, user)
        assert scheduled(rule).count() == 0

    def test_plan_until_reset_binds_to_materialized_event(self, place, router, user, organization):
        rule = make_rule(place, user)
        plan = AccessPlan.objects.create(
            organization=organization, name="R", price="1", duration_minutes=600,
            status="ACTIVE", validity_mode="UNTIL_NEXT_RESET",
        )
        c = Customer.objects.create(organization=organization, mac_address="AA:00:00:30:00:01")
        s = start_session(customer=c, router=router, place=place, access_plan=plan)
        nxt = scheduled(rule).order_by("scheduled_at").first()
        assert s.bound_reset_event_id == nxt.id and s.expires_at == nxt.scheduled_at


@pytest.mark.django_db
class TestLifecycle:
    def test_pause_cancels_upcoming_and_stops_materializing(self, place, user):
        rule = make_rule(place, user)
        deactivate_recurring_reset(rule, actor=user)
        assert scheduled(rule).count() == 0
        assert materialize_all_recurring_resets() == 0
        assert AuditEvent.objects.filter(action="hard_logout.recurrence_paused").exists()

    def test_pause_twice_conflicts(self, place, user):
        rule = make_rule(place, user)
        deactivate_recurring_reset(rule, actor=user)
        with pytest.raises(ConflictError):
            deactivate_recurring_reset(rule, actor=user)

    def test_resume_schedules_again(self, place, user):
        rule = make_rule(place, user)
        deactivate_recurring_reset(rule, actor=user)
        activate_recurring_reset(rule, actor=user)
        assert scheduled(rule).count() == 2

    def test_pausing_moves_bound_sessions_to_fallback_not_a_dead_reset(self, place, router, user, organization):
        rule = make_rule(place, user)
        plan = AccessPlan.objects.create(
            organization=organization, name="R", price="1", duration_minutes=120,
            status="ACTIVE", validity_mode="UNTIL_NEXT_RESET",
        )
        c = Customer.objects.create(organization=organization, mac_address="AA:00:00:30:00:02")
        s = start_session(customer=c, router=router, place=place, access_plan=plan)
        deactivate_recurring_reset(rule, actor=user)
        s.refresh_from_db()
        assert s.bound_reset_event_id is None  # not left tied to a cancelled reset


@pytest.mark.django_db
class TestValidation:
    def test_bad_weekday(self, place, user):
        with pytest.raises(ValueError):
            make_rule(place, user, weekdays=[7])

    def test_router_from_another_place_rejected(self, place, user, organization, connector):
        from apps.connectors.models import Router
        from apps.places.models import Place

        other = Place.objects.create(organization=organization, name="Other")
        foreign = Router.objects.create(place=other, connector=connector, name="F", identity="10.9.0.1")
        with pytest.raises(ValueError):
            make_rule(place, user, scope="ROUTERS", routers=[foreign])

    def test_duplicate_active_rule_conflicts(self, place, user):
        t = soon_time()
        kw = dict(place=place, scope_type="PLACE", router_ids=[], time_of_day=t, weekdays=[], created_by=user)
        create_recurring_reset(**kw)
        with pytest.raises(ConflictError):
            create_recurring_reset(**kw)


@pytest.mark.django_db
class TestApi:
    BODY = {"scopeType": "PLACE", "timeOfDay": "03:00", "weekdays": []}

    def test_create_list_pause_resume(self, auth_client, org_headers, place):
        created = auth_client.post(URL, {**self.BODY, "place": str(place.id)}, format="json", **org_headers)
        assert created.status_code == 201
        body = created.json()
        assert body["isActive"] is True and body["timeOfDay"].startswith("03:00") and body["nextOccurrence"]
        assert auth_client.get(URL, **org_headers).json()["count"] == 1

        paused = auth_client.post(f"{URL}{body['id']}/deactivate/", **org_headers)
        assert paused.status_code == 200 and paused.json()["isActive"] is False
        assert paused.json()["nextOccurrence"] is None
        assert auth_client.post(f"{URL}{body['id']}/deactivate/", **org_headers).status_code == 409
        assert auth_client.post(f"{URL}{body['id']}/activate/", **org_headers).json()["isActive"] is True

    def test_agent_cannot_create_or_pause(self, agent_client, agent_membership, org_headers, place, auth_client):
        assert agent_client.post(URL, {**self.BODY, "place": str(place.id)}, format="json", **org_headers).status_code == 403
        made = auth_client.post(URL, {**self.BODY, "place": str(place.id)}, format="json", **org_headers).json()
        assert agent_client.post(f"{URL}{made['id']}/deactivate/", **org_headers).status_code == 403

    def test_tenant_isolation(self, auth_client, org_headers, place, other_org_headers):
        auth_client.post(URL, {**self.BODY, "place": str(place.id)}, format="json", **org_headers)
        assert auth_client.get(URL, **other_org_headers).status_code == 403

    def test_foreign_place_rejected(self, auth_client, org_headers, other_organization):
        from apps.places.models import Place

        foreign = Place.objects.create(organization=other_organization, name="Elsewhere")
        resp = auth_client.post(URL, {**self.BODY, "place": str(foreign.id)}, format="json", **org_headers)
        assert resp.status_code == 400
