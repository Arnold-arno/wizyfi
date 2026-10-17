# apps/access/tests/test_until_next_reset.py
#
# Round 16: plans whose access lasts "until the next Wizyfi reset". A session that
# starts after the last reset ends at the next scheduled reset covering its
# router, so everyone is cut together. duration_minutes is only the fallback.
import threading
from unittest.mock import patch

import pytest
from django.db import connection
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.access.codes import generate_code, hash_code, last4_of
from apps.access.models import AccessPlan, HardLogoutEvent, Session, Voucher
from apps.access.services import (
    cancel_hard_logout_event,
    execute_hard_logout_event,
    expire_due_sessions,
    next_reset_for,
    schedule_hard_logout_event,
    start_session,
)
from apps.audit.models import AuditEvent
from apps.connectors.adapters.base import CommandOutcome
from apps.connectors.models import Router
from apps.customers.models import Customer

DISCONNECT = "apps.access.services.connector_services.disconnect_session"
OK = CommandOutcome(success=True)
DOWN = CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE")
FALLBACK_MINUTES = 120


def minutes(n):
    return timezone.now() + timezone.timedelta(minutes=n)


@pytest.fixture
def reset_plan(organization):
    return AccessPlan.objects.create(
        organization=organization, name="Until reset", price="1000", duration_minutes=FALLBACK_MINUTES,
        status="ACTIVE", validity_mode="UNTIL_NEXT_RESET",
    )


def reset_at(place, user, in_minutes, scope="PLACE", routers=()):
    return schedule_hard_logout_event(
        place=place, scope_type=scope, router_ids=[str(r.id) for r in routers],
        scheduled_at=minutes(in_minutes), scheduled_timezone="UTC", created_by=user,
    )


def login(place, router, plan, organization, mac="AA:00:00:20:00:01"):
    c = Customer.objects.create(organization=organization, mac_address=mac)
    return start_session(customer=c, router=router, place=place, access_plan=plan)


@pytest.mark.django_db
class TestPlanApi:
    def test_defaults_to_duration(self, auth_client, org_headers):
        resp = auth_client.post("/api/v1/access-plans/", {"name": "P", "price": "10", "durationMinutes": 60}, format="json", **org_headers)
        assert resp.status_code == 201 and resp.json()["validityMode"] == "DURATION"

    def test_can_create_and_update_until_next_reset(self, auth_client, org_headers):
        created = auth_client.post("/api/v1/access-plans/", {"name": "R", "price": "10", "durationMinutes": 60, "validityMode": "UNTIL_NEXT_RESET"}, format="json", **org_headers)
        assert created.status_code == 201 and created.json()["validityMode"] == "UNTIL_NEXT_RESET"
        back = auth_client.patch(f"/api/v1/access-plans/{created.json()['id']}/", {"validityMode": "DURATION"}, format="json", **org_headers)
        assert back.json()["validityMode"] == "DURATION"

    def test_unknown_mode_rejected(self, auth_client, org_headers):
        resp = auth_client.post("/api/v1/access-plans/", {"name": "X", "price": "10", "durationMinutes": 60, "validityMode": "FOREVER"}, format="json", **org_headers)
        assert resp.status_code == 400 and "validityMode" in resp.data["fieldErrors"] or "validity_mode" in resp.data["fieldErrors"]


@pytest.mark.django_db
class TestEndTimeIsTheNextReset:
    def test_duration_plan_ignores_resets(self, place, router, access_plan, organization, user):
        reset_at(place, user, 30)
        s = login(place, router, access_plan, organization)
        assert s.bound_reset_event_id is None
        assert s.expires_at > minutes(access_plan.duration_minutes - 1)

    def test_reset_plan_ends_exactly_at_the_next_reset(self, place, router, reset_plan, organization, user):
        ev = reset_at(place, user, 30)
        s = login(place, router, reset_plan, organization)
        assert s.expires_at == ev.scheduled_at
        assert s.bound_reset_event_id == ev.id

    def test_earliest_reset_wins(self, place, router, reset_plan, organization, user):
        reset_at(place, user, 300)
        early = reset_at(place, user, 45)
        reset_at(place, user, 120)
        assert login(place, router, reset_plan, organization).bound_reset_event_id == early.id

    @pytest.mark.parametrize("status", ["CANCELLED", "COMPLETED", "PARTIAL", "FAILED", "RUNNING"])
    def test_only_scheduled_resets_count(self, place, router, reset_plan, organization, user, status):
        ev = reset_at(place, user, 30)
        HardLogoutEvent.objects.filter(id=ev.id).update(status=status)
        s = login(place, router, reset_plan, organization)
        assert s.bound_reset_event_id is None  # falls back instead

    def test_a_reset_already_due_is_not_the_next_one(self, place, router, reset_plan, organization, user):
        ev = reset_at(place, user, 30)
        HardLogoutEvent.objects.filter(id=ev.id).update(scheduled_at=minutes(-1))
        assert login(place, router, reset_plan, organization).bound_reset_event_id is None

    def test_other_places_resets_are_ignored(self, place, router, reset_plan, organization, user):
        from apps.places.models import Place
        other = Place.objects.create(organization=organization, name="Elsewhere")
        reset_at(other, user, 30)
        assert login(place, router, reset_plan, organization).bound_reset_event_id is None

    def test_router_scoped_reset_only_applies_to_its_routers(self, place, connector, reset_plan, organization, user):
        mine = Router.objects.create(place=place, connector=connector, name="Mine", identity="10.3.0.1")
        theirs = Router.objects.create(place=place, connector=connector, name="Theirs", identity="10.3.0.2")
        ev = reset_at(place, user, 30, scope="ROUTER", routers=[theirs])
        assert login(place, mine, reset_plan, organization, "AA:00:00:20:01:01").bound_reset_event_id is None
        assert login(place, theirs, reset_plan, organization, "AA:00:00:20:01:02").bound_reset_event_id == ev.id

    def test_multi_router_scope(self, place, connector, reset_plan, organization, user):
        a = Router.objects.create(place=place, connector=connector, name="A", identity="10.3.1.1")
        b = Router.objects.create(place=place, connector=connector, name="B", identity="10.3.1.2")
        ev = reset_at(place, user, 30, scope="ROUTERS", routers=[a, b])
        assert login(place, b, reset_plan, organization).bound_reset_event_id == ev.id

    def test_place_wide_reset_skips_a_disabled_router(self, place, connector, reset_plan, organization, user):
        off = Router.objects.create(place=place, connector=connector, name="Off", identity="10.3.2.1", status="DISABLED")
        reset_at(place, user, 30)
        assert login(place, off, reset_plan, organization).bound_reset_event_id is None

    def test_no_reset_scheduled_falls_back_to_duration_never_unlimited(self, place, router, reset_plan, organization):
        s = login(place, router, reset_plan, organization)
        assert s.bound_reset_event_id is None and s.expires_at is not None
        assert minutes(FALLBACK_MINUTES - 1) < s.expires_at < minutes(FALLBACK_MINUTES + 1)

    def test_a_reset_cancelled_between_choosing_and_locking_is_not_used(self, place, router, reset_plan, organization, user):
        """Deterministic version of the cancel/login race: the reset is cancelled
        AFTER the login picked it but BEFORE it locked it. The re-check under the
        lock must notice and fall through (here: to the fallback)."""
        from apps.access import services

        ev = reset_at(place, user, 30)
        real = services.next_reset_for
        calls = {"n": 0}

        def pick_then_someone_cancels(*args, **kwargs):
            found = real(*args, **kwargs)
            calls["n"] += 1
            if calls["n"] == 1 and found is not None:
                HardLogoutEvent.objects.filter(id=found.id).update(status="CANCELLED")
            return found

        with patch("apps.access.services.next_reset_for", side_effect=pick_then_someone_cancels):
            s = login(place, router, reset_plan, organization)
        assert s.bound_reset_event_id is None and s.expires_at != ev.scheduled_at

    def test_next_reset_for_is_read_only(self, place, router, user):
        reset_at(place, user, 30)
        before = HardLogoutEvent.objects.count()
        next_reset_for(place, router)
        assert HardLogoutEvent.objects.count() == before


@pytest.mark.django_db
class TestPortal:
    def _redeem(self, api_client, place, router, plan, mac="AA:BB:CC:20:00:01"):
        code = generate_code()
        Voucher.objects.create(plan=plan, code_hash=hash_code(code), code_last4=last4_of(code), status="AVAILABLE")
        return api_client.post(f"/api/v1/portal/places/{place.id}/redeem/", {"code": code, "macAddress": mac, "routerId": str(router.id)}, format="json")

    def test_redeeming_a_reset_plan_ends_at_the_reset(self, api_client, place, router, reset_plan, user):
        ev = reset_at(place, user, 30)
        resp = self._redeem(api_client, place, router, reset_plan)
        assert resp.status_code == 201
        assert parse_datetime(resp.json()["expiresAt"]) == ev.scheduled_at

    def test_plans_tell_the_user_when_access_ends(self, api_client, place, router, reset_plan, access_plan, user):
        ev = reset_at(place, user, 30)
        rows = {p["name"]: p for p in api_client.get(f"/api/v1/portal/places/{place.id}/plans/").json()}
        assert rows["Until reset"]["validityMode"] == "UNTIL_NEXT_RESET"
        assert parse_datetime(rows["Until reset"]["accessEndsAt"]) == ev.scheduled_at
        assert rows["Test Plan"]["accessEndsAt"] is None  # duration plans don't have one

    def test_no_reset_scheduled_means_no_end_time_shown(self, api_client, place, reset_plan):
        row = api_client.get(f"/api/v1/portal/places/{place.id}/plans/").json()[0]
        assert row["accessEndsAt"] is None

    def test_router_param_reflects_router_scoped_resets(self, api_client, place, connector, reset_plan, user):
        mine = Router.objects.create(place=place, connector=connector, name="Mine", identity="10.4.0.1")
        theirs = Router.objects.create(place=place, connector=connector, name="Theirs", identity="10.4.0.2")
        ev = reset_at(place, user, 30, scope="ROUTER", routers=[theirs])
        url = f"/api/v1/portal/places/{place.id}/plans/"
        assert api_client.get(f"{url}?router={mine.id}").json()[0]["accessEndsAt"] is None
        assert parse_datetime(api_client.get(f"{url}?router={theirs.id}").json()[0]["accessEndsAt"]) == ev.scheduled_at
        assert api_client.get(url).json()[0]["accessEndsAt"] is None  # no router: only place-wide resets can be promised

    @pytest.mark.parametrize("status", ["CANCELLED", "COMPLETED", "PARTIAL", "FAILED", "RUNNING"])
    def test_a_cancelled_or_finished_reset_is_never_promised_to_users(self, api_client, place, reset_plan, user, status):
        ev = reset_at(place, user, 30)
        HardLogoutEvent.objects.filter(id=ev.id).update(status=status)
        row = api_client.get(f"/api/v1/portal/places/{place.id}/plans/").json()[0]
        assert row["accessEndsAt"] is None

    def test_bad_or_foreign_router_param_is_ignored_not_an_error(self, api_client, place, reset_plan, user, organization, connector):
        from apps.places.models import Place
        reset_at(place, user, 30)
        other_place = Place.objects.create(organization=organization, name="Other")
        foreign = Router.objects.create(place=other_place, connector=connector, name="F", identity="10.4.0.9")
        url = f"/api/v1/portal/places/{place.id}/plans/"
        assert api_client.get(f"{url}?router=not-a-uuid").status_code == 200
        assert api_client.get(f"{url}?router={foreign.id}").status_code == 200

    def test_sessions_api_flags_reset_bound_sessions(self, auth_client, org_headers, place, router, reset_plan, access_plan, organization, user):
        reset_at(place, user, 30)
        login(place, router, reset_plan, organization, "AA:00:00:20:02:01")
        login(place, router, access_plan, organization, "AA:00:00:20:02:02")
        rows = {r["accessPlanName"]: r["endsWithReset"] for r in auth_client.get("/api/v1/sessions/", **org_headers).json()["results"]}
        assert rows == {"Until reset": True, "Test Plan": False}


@pytest.mark.django_db
class TestCancellingAResetMovesItsSessions:
    def test_sessions_move_to_the_following_reset(self, place, router, reset_plan, organization, user):
        first = reset_at(place, user, 30)
        second = reset_at(place, user, 200)
        s = login(place, router, reset_plan, organization)
        assert s.bound_reset_event_id == first.id
        cancel_hard_logout_event(first, actor=user)
        s.refresh_from_db()
        assert s.expires_at == second.scheduled_at and s.bound_reset_event_id == second.id
        assert AuditEvent.objects.get(action="hard_logout.sessions_extended").metadata == {"sessions": 1}

    def test_no_following_reset_gives_a_fresh_full_fallback_window(self, place, router, reset_plan, organization, user):
        only = reset_at(place, user, 30)
        s = login(place, router, reset_plan, organization)
        cancel_hard_logout_event(only, actor=user)
        s.refresh_from_db()
        assert s.bound_reset_event_id is None
        assert minutes(FALLBACK_MINUTES - 1) < s.expires_at < minutes(FALLBACK_MINUTES + 1)  # not an instant cut

    @pytest.mark.parametrize("status", ["CANCELLED", "COMPLETED", "FAILED", "RUNNING"])
    def test_a_following_reset_that_is_not_upcoming_is_never_used(self, place, router, reset_plan, organization, user, status):
        first = reset_at(place, user, 30)
        dead = reset_at(place, user, 90)
        HardLogoutEvent.objects.filter(id=dead.id).update(status=status)
        s = login(place, router, reset_plan, organization)
        cancel_hard_logout_event(first, actor=user)
        s.refresh_from_db()
        assert s.bound_reset_event_id is None  # fallback window, not a reset that will never cut anyone

    def test_following_reset_that_doesnt_cover_the_router_is_skipped(self, place, connector, reset_plan, organization, user):
        mine = Router.objects.create(place=place, connector=connector, name="Mine", identity="10.5.0.1")
        other = Router.objects.create(place=place, connector=connector, name="Other", identity="10.5.0.2")
        first = reset_at(place, user, 30)
        reset_at(place, user, 90, scope="ROUTER", routers=[other])
        s = login(place, mine, reset_plan, organization)
        cancel_hard_logout_event(first, actor=user)
        s.refresh_from_db()
        assert s.bound_reset_event_id is None

    def test_only_affected_sessions_change(self, place, router, reset_plan, access_plan, organization, user):
        target = reset_at(place, user, 30)
        keep = reset_at(place, user, 400)
        bound_here = login(place, router, reset_plan, organization, "AA:00:00:21:00:01")
        duration = login(place, router, access_plan, organization, "AA:00:00:21:00:02")
        gone = login(place, router, reset_plan, organization, "AA:00:00:21:00:03")
        Session.objects.filter(id=gone.id).update(status="DISCONNECTED")
        before = {s.id: (s.expires_at, s.bound_reset_event_id) for s in (duration, gone)}
        cancel_hard_logout_event(target, actor=user)
        for s in (duration, gone):
            s.refresh_from_db()
            assert (s.expires_at, s.bound_reset_event_id) == before[s.id]
        bound_here.refresh_from_db()
        assert bound_here.bound_reset_event_id == keep.id

    def test_no_audit_noise_when_nothing_was_bound(self, place, user):
        ev = reset_at(place, user, 30)
        cancel_hard_logout_event(ev, actor=user)
        assert not AuditEvent.objects.filter(action="hard_logout.sessions_extended").exists()

    def test_cancel_really_means_nobody_is_cut(self, place, router, reset_plan, organization, user):
        ev = reset_at(place, user, 30)
        s = login(place, router, reset_plan, organization)
        cancel_hard_logout_event(ev, actor=user)
        with patch(DISCONNECT) as m:
            result = expire_due_sessions()
        m.assert_not_called()
        s.refresh_from_db()
        assert result.examined == 0 and s.status == "ACTIVE"


@pytest.mark.django_db
class TestSweepAndResetCoordinate:
    def _bound_due_session(self, place, router, reset_plan, organization, user, status="SCHEDULED"):
        ev = reset_at(place, user, 30)
        s = login(place, router, reset_plan, organization)
        due = minutes(-1)
        HardLogoutEvent.objects.filter(id=ev.id).update(scheduled_at=due, status=status)
        Session.objects.filter(id=s.id).update(expires_at=due)
        return ev, s

    @pytest.mark.parametrize("status", ["SCHEDULED", "RUNNING"])
    def test_sweep_leaves_the_disconnecting_to_a_pending_reset(self, place, router, reset_plan, organization, user, status):
        _, s = self._bound_due_session(place, router, reset_plan, organization, user, status)
        with patch(DISCONNECT) as m:
            result = expire_due_sessions()
        m.assert_not_called()
        s.refresh_from_db()
        assert s.status == "ACTIVE" and result.deferred == 1

    def test_the_reset_ends_them_as_disconnected_not_expired(self, place, router, reset_plan, organization, user):
        ev, s = self._bound_due_session(place, router, reset_plan, organization, user)
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions()                 # deferred
            execute_hard_logout_event(ev.id)      # the reset runs
            result = expire_due_sessions()        # nothing left to expire
        s.refresh_from_db()
        assert s.status == "DISCONNECTED" and result.examined == 0

    @pytest.mark.parametrize("status", ["COMPLETED", "PARTIAL", "FAILED"])
    def test_sweep_takes_over_once_the_reset_is_finished(self, place, router, reset_plan, organization, user, status):
        _, s = self._bound_due_session(place, router, reset_plan, organization, user, status)
        with patch(DISCONNECT, return_value=OK):
            result = expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED" and result.expired == 1  # e.g. the router failed to drop them during the reset

    def test_a_stuck_reset_cannot_block_the_sweep_forever(self, place, router, reset_plan, organization, user):
        _, s = self._bound_due_session(place, router, reset_plan, organization, user)
        Session.objects.filter(id=s.id).update(expires_at=minutes(-180))  # past the 1h grace
        with patch(DISCONNECT, return_value=DOWN):
            result = expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED" and result.unconfirmed == 1


@pytest.mark.skipif(connection.vendor != "postgresql", reason="needs real concurrent transactions")
@pytest.mark.django_db(transaction=True)
class TestLoginRacingCancel:
    def test_a_session_is_never_left_bound_to_a_cancelled_reset(self, place, router, reset_plan, organization, user):
        for i in range(15):
            ev = reset_at(place, user, 30)
            c = Customer.objects.create(organization=organization, mac_address=f"AA:00:00:22:{i:02x}:01")
            out = {}

            def do_login():
                try:
                    out["s"] = start_session(customer=c, router=router, place=place, access_plan=reset_plan)
                finally:
                    connection.close()

            def do_cancel():
                try:
                    cancel_hard_logout_event(ev, actor=user)
                finally:
                    connection.close()

            ts = [threading.Thread(target=do_login), threading.Thread(target=do_cancel)]
            [t.start() for t in ts]
            [t.join() for t in ts]

            s = Session.objects.get(id=out["s"].id)
            ev.refresh_from_db()
            assert ev.status == "CANCELLED"
            assert s.bound_reset_event_id != ev.id          # never tied to a reset that no longer happens
            assert s.expires_at != ev.scheduled_at          # and so never cut at its time
            Session.objects.filter(id=s.id).delete()
