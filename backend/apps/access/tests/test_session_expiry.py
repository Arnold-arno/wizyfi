# apps/access/tests/test_session_expiry.py
#
# Round 15: the session expiry sweep. EXPIRED = "access period ended";
# DISCONNECTED = "terminated" (doc03 §5) — they stay different statuses.
import threading
from unittest.mock import patch

import pytest
from django.db import connection
from django.utils import timezone

from apps.access.models import HardLogoutEvent, Session
from apps.access.services import (
    execute_hard_logout_event,
    expire_due_sessions,
    schedule_hard_logout_event,
)
from apps.access.tasks import expire_due_sessions_task
from apps.audit.models import AuditEvent
from apps.connectors.adapters.base import CommandOutcome
from apps.connectors.models import Router
from apps.customers.models import Customer

DISCONNECT = "apps.access.services.connector_services.disconnect_session"
OK = CommandOutcome(success=True)
DOWN = CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE")


def add_router(place, connector, name):
    return Router.objects.create(place=place, connector=connector, name=name, identity="10.2.0.1")


def make_session(place, router, organization, mac, overdue=30, status="ACTIVE", expires=True):
    c = Customer.objects.create(organization=organization, mac_address=mac)
    return Session.objects.create(
        customer=c, router=router, place=place, status=status,
        started_at=timezone.now() - timezone.timedelta(hours=3),
        expires_at=(timezone.now() - timezone.timedelta(seconds=overdue)) if expires else None,
    )


@pytest.mark.django_db
class TestConfirmedExpiry:
    def test_due_session_expires_once_router_confirms(self, place, router, organization):
        s = make_session(place, router, organization, "AA:00:00:10:00:01")
        with patch(DISCONNECT, return_value=OK) as m:
            result = expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED"
        assert s.ended_at == s.expires_at  # when access ended, not when we noticed
        assert (result.examined, result.expired, result.pending, result.unconfirmed) == (1, 1, 0, 0)
        m.assert_called_once()
        assert m.call_args.args[1] == str(s.id)

    def test_expired_is_a_different_fact_from_disconnected(self, place, router, organization):
        s = make_session(place, router, organization, "AA:00:00:10:00:02")
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED" and s.status != "DISCONNECTED"

    def test_future_and_no_expiry_sessions_are_left_alone(self, place, router, organization):
        future = make_session(place, router, organization, "AA:00:00:10:00:03", overdue=-600)
        forever = make_session(place, router, organization, "AA:00:00:10:00:04", expires=False)
        with patch(DISCONNECT) as m:
            result = expire_due_sessions()
        m.assert_not_called()
        assert result.examined == 0
        future.refresh_from_db(); forever.refresh_from_db()
        assert future.status == "ACTIVE" and forever.status == "ACTIVE"

    @pytest.mark.parametrize("status", ["DISCONNECTED", "EXPIRED", "FAILED", "PENDING"])
    def test_sessions_not_currently_connected_are_ignored(self, place, router, organization, status):
        s = make_session(place, router, organization, "AA:00:00:10:00:05", status=status)
        with patch(DISCONNECT) as m:
            expire_due_sessions()
        m.assert_not_called()
        s.refresh_from_db()
        assert s.status == status

    def test_expiring_sessions_are_swept_too(self, place, router, organization):
        s = make_session(place, router, organization, "AA:00:00:10:00:06", status="EXPIRING")
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED"

    def test_routine_expiry_writes_no_audit_rows(self, place, router, organization):
        for i in range(5):
            make_session(place, router, organization, f"AA:00:00:10:01:0{i}", overdue=10 + i)
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions()
        assert not AuditEvent.objects.filter(action__startswith="session.").exists()

    def test_dashboard_overcount_is_fixed_end_to_end(self, auth_client, org_headers, place, router, organization):
        make_session(place, router, organization, "AA:00:00:10:02:01")
        make_session(place, router, organization, "AA:00:00:10:02:02")
        before = auth_client.get("/api/v1/places/", **org_headers).json()["results"][0]["activeConnectionCount"]
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions()
        after = auth_client.get("/api/v1/places/", **org_headers).json()["results"][0]["activeConnectionCount"]
        assert (before, after) == (2, 0)


@pytest.mark.django_db
class TestRouterFailures:
    def test_unreachable_router_stays_active_and_is_tried_once(self, place, router, organization):
        sessions = [make_session(place, router, organization, f"AA:00:00:11:00:0{i}", overdue=30 + i) for i in range(3)]
        with patch(DISCONNECT, return_value=DOWN) as m:
            result = expire_due_sessions()
        assert m.call_count == 1  # not once per session
        assert (result.expired, result.pending) == (0, 3)
        for s in sessions:
            s.refresh_from_db()
            assert s.status == "ACTIVE"  # honest: we can't confirm they're off the network

    def test_one_dead_router_does_not_block_another(self, place, connector, organization):
        dead = add_router(place, connector, "Dead")
        live = add_router(place, connector, "Live")
        make_session(place, dead, organization, "AA:00:00:11:01:01", overdue=50)
        ok = make_session(place, live, organization, "AA:00:00:11:01:02", overdue=40)

        def by_router(router, sid):
            return DOWN if router.id == dead.id else OK

        with patch(DISCONNECT, side_effect=by_router):
            result = expire_due_sessions()
        ok.refresh_from_db()
        assert ok.status == "EXPIRED" and (result.expired, result.pending) == (1, 1)

    def test_session_level_failure_does_not_skip_siblings(self, place, router, organization):
        for i in range(3):
            make_session(place, router, organization, f"AA:00:00:11:02:0{i}", overdue=30 + i)
        with patch(DISCONNECT, return_value=CommandOutcome(success=False, error_code="SESSION_GONE")) as m:
            expire_due_sessions()
        assert m.call_count == 3

    def test_adapter_exception_does_not_stop_the_sweep(self, place, router, organization):
        for i in range(3):
            make_session(place, router, organization, f"AA:00:00:11:03:0{i}", overdue=300 - i * 10)
        with patch(DISCONNECT, side_effect=[RuntimeError("bug"), OK, OK]):
            result = expire_due_sessions()
        assert (result.expired, result.pending) == (2, 1)


@pytest.mark.django_db
class TestGracePeriod:
    def test_unconfirmed_past_grace_is_forced_and_audited(self, place, router, organization):
        s = make_session(place, router, organization, "AA:00:00:12:00:01", overdue=7200)
        with patch(DISCONNECT, return_value=DOWN):
            result = expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED" and result.unconfirmed == 1 and result.expired == 0
        ev = AuditEvent.objects.get(action="session.expired_unconfirmed")
        assert ev.resource_id == str(s.id)
        assert ev.metadata["router_id"] == str(router.id)
        assert ev.metadata["last_error_code"] == "NETWORK_UNAVAILABLE"
        assert ev.metadata["overdue_seconds"] >= 7200

    def test_inside_grace_is_not_forced(self, place, router, organization):
        s = make_session(place, router, organization, "AA:00:00:12:00:02", overdue=600)
        with patch(DISCONNECT, return_value=DOWN):
            expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "ACTIVE"

    def test_grace_is_configurable(self, place, router, organization, settings):
        settings.SESSION_EXPIRY_GRACE_SECONDS = 60
        s = make_session(place, router, organization, "AA:00:00:12:00:03", overdue=300)
        with patch(DISCONNECT, return_value=DOWN):
            expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "EXPIRED"

    def test_forcing_still_tries_the_router_only_once(self, place, router, organization):
        old = make_session(place, router, organization, "AA:00:00:12:00:04", overdue=7200)
        recent = make_session(place, router, organization, "AA:00:00:12:00:05", overdue=60)
        with patch(DISCONNECT, return_value=DOWN) as m:
            expire_due_sessions()
        old.refresh_from_db(); recent.refresh_from_db()
        assert m.call_count == 1
        assert old.status == "EXPIRED" and recent.status == "ACTIVE"


@pytest.mark.django_db
class TestRacesAndBatching:
    def test_session_ended_meanwhile_is_never_overwritten(self, place, router, organization):
        s = make_session(place, router, organization, "AA:00:00:13:00:01")

        def hard_logout_wins(router_, sid):
            Session.objects.filter(id=sid).update(status="DISCONNECTED", ended_at=timezone.now())
            return OK

        with patch(DISCONNECT, side_effect=hard_logout_wins):
            result = expire_due_sessions()
        s.refresh_from_db()
        assert s.status == "DISCONNECTED" and result.expired == 0

    def test_batch_limit_continues_on_the_next_run(self, place, router, organization):
        for i in range(3):
            make_session(place, router, organization, f"AA:00:00:13:01:0{i}", overdue=100 - i)
        with patch(DISCONNECT, return_value=OK):
            first = expire_due_sessions(limit=2)
            second = expire_due_sessions(limit=2)
            third = expire_due_sessions(limit=2)
        assert (first.expired, second.expired, third.examined) == (2, 1, 0)

    def test_oldest_expiries_go_first(self, place, router, organization):
        newer = make_session(place, router, organization, "AA:00:00:13:02:01", overdue=10)
        older = make_session(place, router, organization, "AA:00:00:13:02:02", overdue=500)
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions(limit=1)
        newer.refresh_from_db(); older.refresh_from_db()
        assert older.status == "EXPIRED" and newer.status == "ACTIVE"

    def test_hard_logout_also_disconnects_expiring_sessions(self, place, router, organization, user):
        s = make_session(place, router, organization, "AA:00:00:13:03:01", overdue=-600, status="EXPIRING")
        event = schedule_hard_logout_event(
            place=place, scope_type="PLACE", router_ids=[],
            scheduled_at=timezone.now() + timezone.timedelta(minutes=5), scheduled_timezone="UTC", created_by=user,
        )
        result = execute_hard_logout_event(event.id)
        s.refresh_from_db()
        assert result.status == "COMPLETED" and s.status == "DISCONNECTED"


@pytest.mark.django_db
class TestTaskAndSchema:
    def test_task_returns_counts(self, place, router, organization):
        make_session(place, router, organization, "AA:00:00:14:00:01")
        with patch(DISCONNECT, return_value=OK):
            out = expire_due_sessions_task()
        assert out == {"examined": 1, "expired": 1, "unconfirmed": 0, "pending": 0}

    def test_sweep_index_exists(self):
        with connection.cursor() as cur:
            constraints = connection.introspection.get_constraints(cur, Session._meta.db_table)
        assert any(c["index"] and c["columns"] == ["status", "expires_at"] for c in constraints.values())


@pytest.mark.skipif(connection.vendor != "postgresql", reason="needs real concurrent transactions")
@pytest.mark.django_db(transaction=True)
class TestConcurrentSweeps:
    def test_overlapping_sweeps_never_double_count(self, place, router, organization):
        for i in range(20):
            make_session(place, router, organization, f"AA:00:00:15:{i:02x}:01", overdue=30 + i)
        barrier = threading.Barrier(2)
        results, errors = [], []

        def sweep():
            try:
                barrier.wait()
                results.append(expire_due_sessions())
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                connection.close()

        with patch(DISCONNECT, return_value=OK):
            ts = [threading.Thread(target=sweep) for _ in range(2)]
            [t.start() for t in ts]
            [t.join() for t in ts]

        assert not errors, errors
        assert Session.objects.filter(status="EXPIRED").count() == 20
        assert sum(r.expired for r in results) == 20  # each session expired exactly once overall
