# apps/access/tests/test_wizyfi_hardening.py
#
# Round 14: execution hardening for Wizyfi (Hard Logout). Covers crash
# recovery, lease/fencing, bounded retries, secret-free failures, the
# missed-window rule, dispatcher recovery and (on PostgreSQL only — SQLite has
# no row locks) real concurrent workers.
import threading
import time
import uuid
from unittest.mock import patch

import pytest
from django.db import connection
from django.db.models import F
from django.utils import timezone

from apps.access import services
from apps.access.models import HardLogoutEvent, HardLogoutTargetResult, Session
from apps.access.services import (
    MAX_ATTEMPTS,
    cancel_hard_logout_event,
    execute_hard_logout_event,
    schedule_hard_logout_event,
)
from apps.access.tasks import dispatch_due_hard_logout_events
from apps.audit.models import AuditEvent
from apps.common.exceptions import ConflictError, NetworkUnavailable
from apps.connectors.adapters.base import CommandOutcome
from apps.connectors.models import Router
from apps.customers.models import Customer
from apps.notifications.models import Notification

DISCONNECT = "apps.access.services.connector_services.disconnect_session"
PER_ROUTER = "apps.access.services._disconnect_router_sessions"


def add_router(place, connector, name, **kw):
    return Router.objects.create(place=place, connector=connector, name=name, identity=f"10.1.0.{abs(hash(name)) % 250}", **kw)


def add_session(place, router, organization, mac):
    c = Customer.objects.create(organization=organization, mac_address=mac)
    return Session.objects.create(customer=c, router=router, place=place, started_at=timezone.now(), status="ACTIVE")


def make_event(place, user, router_ids, scope="ROUTERS", **updates):
    event = schedule_hard_logout_event(
        place=place, scope_type=scope, router_ids=[str(r) for r in router_ids],
        scheduled_at=timezone.now() + timezone.timedelta(minutes=5), scheduled_timezone="UTC", created_by=user,
    )
    if updates:
        HardLogoutEvent.objects.filter(id=event.id).update(**updates)
        event.refresh_from_db()
    return event


def past(seconds=5):
    return timezone.now() - timezone.timedelta(seconds=seconds)


def future(seconds=60):
    return timezone.now() + timezone.timedelta(seconds=seconds)


@pytest.mark.django_db
class TestClaimAndLease:
    def test_run_persists_execution_state_and_audit_trail(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:01:01")
        event = make_event(place, user, [r.id])

        result = execute_hard_logout_event(event.id)

        assert result.status == "COMPLETED"
        assert result.attempt_count == 1
        assert result.lease_expires_at is None  # released on finalize
        assert result.resolved_router_ids == [str(r.id)]
        assert result.started_at is not None
        actions = set(AuditEvent.objects.filter(resource_id=str(event.id)).values_list("action", flat=True))
        assert {"hard_logout.scheduled", "hard_logout.started", "hard_logout.target_succeeded", "hard_logout.completed"} <= actions
        assert Notification.objects.filter(resource_id=str(event.id)).count() == 1

    def test_live_lease_blocks_a_second_worker(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:01:02")
        event = make_event(place, user, [r.id], status="RUNNING", attempt_count=1,
                           lease_expires_at=future(), resolved_router_ids=[str(r.id)], started_at=timezone.now())
        with patch(DISCONNECT) as m:
            result = execute_hard_logout_event(event.id)
        m.assert_not_called()
        assert result.status == "RUNNING" and result.attempt_count == 1

    def test_expired_lease_is_taken_over_and_finishes(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:01:03")
        event = make_event(place, user, [r.id], status="RUNNING", attempt_count=1,
                           lease_expires_at=past(), resolved_router_ids=[str(r.id)], started_at=timezone.now())
        result = execute_hard_logout_event(event.id)
        assert result.status == "COMPLETED" and result.attempt_count == 2

    def test_scope_is_frozen_at_start(self, place, connector, organization, user):
        r1 = add_router(place, connector, "R1")
        event = make_event(place, user, [], scope="PLACE")
        with patch(PER_ROUTER, side_effect=RuntimeError("worker died")):
            with pytest.raises(RuntimeError):
                execute_hard_logout_event(event.id)
        r2 = add_router(place, connector, "R2")  # appears AFTER the run started
        result = execute_hard_logout_event(event.id)
        assert set(result.target_results.values_list("router_id", flat=True)) == {r1.id}
        assert r2.id not in result.resolved_router_ids


@pytest.mark.django_db
class TestCrashRecovery:
    def test_progress_survives_a_crash_and_is_not_repeated(self, place, connector, organization, user):
        r1 = add_router(place, connector, "R1")
        r2 = add_router(place, connector, "R2")
        s = {r1.id: add_session(place, r1, organization, "AA:00:00:00:02:01"),
             r2.id: add_session(place, r2, organization, "AA:00:00:00:02:02")}
        event = make_event(place, user, [r1.id, r2.id])

        real = services._disconnect_router_sessions
        calls = {"n": 0}

        def die_on_second_router(ev, router, attempt):
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("worker died")
            return real(ev, router, attempt)

        with patch(PER_ROUTER, side_effect=die_on_second_router):
            with pytest.raises(RuntimeError):
                execute_hard_logout_event(event.id)

        event.refresh_from_db()
        assert event.status == "RUNNING" and event.attempt_count == 1
        assert event.lease_expires_at <= timezone.now()  # released so the sweep resumes promptly
        done = HardLogoutTargetResult.objects.get(event=event, status="SUCCEEDED")  # DURABLE
        pending = HardLogoutTargetResult.objects.get(event=event, status="ATTEMPTED")
        s[done.router_id].refresh_from_db()
        s[pending.router_id].refresh_from_db()
        assert s[done.router_id].status == "DISCONNECTED"
        assert s[pending.router_id].status == "ACTIVE"

        with patch(DISCONNECT, wraps=lambda router, sid: CommandOutcome(success=True)) as spy:
            result = execute_hard_logout_event(event.id)

        assert [c.args[0].id for c in spy.call_args_list] == [pending.router_id]  # only the unfinished router
        assert result.status == "COMPLETED" and result.attempt_count == 2
        assert result.succeeded_count == 2 and result.failed_count == 0

    def test_persistent_crash_ends_in_failed_not_forever(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:02:03")
        event = make_event(place, user, [r.id])
        with patch(PER_ROUTER, side_effect=RuntimeError("boom")):
            for _ in range(MAX_ATTEMPTS):
                with pytest.raises(RuntimeError):
                    execute_hard_logout_event(event.id)
            result = execute_hard_logout_event(event.id)  # attempts exhausted: finalizes, doesn't raise
        assert result.status == "FAILED"
        assert f"{MAX_ATTEMPTS} attempts" in result.failure_reason
        assert result.attempt_count == MAX_ATTEMPTS
        assert result.target_results.get(router=r).error_code == "INTERRUPTED"
        assert Session.objects.get().status == "ACTIVE"  # nothing was falsely marked disconnected
        # and it is now terminal: sweeps leave it alone
        assert dispatch_due_hard_logout_events() == 0

    def test_giving_up_after_partial_progress_is_partial_not_success(self, place, connector, organization, user):
        r1 = add_router(place, connector, "R1")
        r2 = add_router(place, connector, "R2")
        event = make_event(place, user, [r1.id, r2.id], status="RUNNING", attempt_count=MAX_ATTEMPTS,
                           lease_expires_at=past(), resolved_router_ids=[str(r1.id), str(r2.id)], started_at=timezone.now())
        HardLogoutTargetResult.objects.create(event=event, router=r1, status="SUCCEEDED",
                                              attempted_at=timezone.now(), completed_at=timezone.now())
        result = execute_hard_logout_event(event.id)
        assert result.status == "PARTIAL"
        assert (result.succeeded_count, result.failed_count) == (1, 1)
        assert result.target_results.get(router=r2).error_code == "NOT_ATTEMPTED"


@pytest.mark.django_db
class TestFencing:
    def test_a_worker_that_lost_its_lease_cannot_record_or_finalize(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:03:01")
        event = make_event(place, user, [r.id])

        real = services._disconnect_router_sessions

        def takeover_happens_mid_run(ev, router, attempt):
            out = real(ev, router, attempt)
            HardLogoutEvent.objects.filter(id=ev.id).update(attempt_count=F("attempt_count") + 1)  # someone else claimed
            return out

        with patch(PER_ROUTER, side_effect=takeover_happens_mid_run):
            result = execute_hard_logout_event(event.id)

        assert result.status == "RUNNING"  # the stale worker did NOT finalize
        assert result.target_results.get().status == "ATTEMPTED"  # and did NOT record
        assert not AuditEvent.objects.filter(resource_id=str(event.id), action="hard_logout.completed").exists()

        # the new owner finishes it; the already-disconnected session is not redone
        HardLogoutEvent.objects.filter(id=event.id).update(lease_expires_at=past())
        with patch(DISCONNECT) as m:
            final = execute_hard_logout_event(event.id)
        m.assert_not_called()
        assert final.status == "COMPLETED"


@pytest.mark.django_db
class TestFailureHandling:
    def test_adapter_exception_fails_that_target_without_leaking_secrets(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:04:01")
        event = make_event(place, user, [r.id])
        with patch(DISCONNECT, side_effect=NetworkUnavailable("host 10.9.9.9 password=hunter2")):
            result = execute_hard_logout_event(event.id)
        t = result.target_results.get()
        assert result.status == "FAILED" and result.attempt_count == 1  # no crash, no retry loop
        assert t.error_code == "NETWORK_UNAVAILABLE"
        assert "hunter2" not in t.error_message and "10.9.9.9" not in t.error_message
        assert Session.objects.get().status == "ACTIVE"

    def test_connector_errors_classified_and_secret_free(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:04:02")
        event = make_event(place, user, [r.id])
        with patch(DISCONNECT, side_effect=ValueError("could not decrypt token=abc123")):
            result = execute_hard_logout_event(event.id)
        t = result.target_results.get()
        assert t.error_code == "CONNECTOR_ERROR" and "abc123" not in t.error_message

    def test_unexpected_exception_is_internal_error(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:04:03")
        event = make_event(place, user, [r.id])
        with patch(DISCONNECT, side_effect=RuntimeError("bug")):
            result = execute_hard_logout_event(event.id)
        assert result.target_results.get().error_code == "INTERNAL_ERROR"

    def test_unreachable_router_is_not_hammered_session_by_session(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        for i in range(3):
            add_session(place, r, organization, f"AA:00:00:00:05:0{i}")
        event = make_event(place, user, [r.id])
        with patch(DISCONNECT, return_value=CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE")) as m:
            result = execute_hard_logout_event(event.id)
        assert m.call_count == 1
        assert "3 of 3" in result.target_results.get().error_message  # untried sessions count as not disconnected
        assert Session.objects.filter(status="ACTIVE").count() == 3

    def test_session_level_failures_still_try_the_rest(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        for i in range(3):
            add_session(place, r, organization, f"AA:00:00:00:06:0{i}")
        event = make_event(place, user, [r.id])
        outcomes = [CommandOutcome(True), CommandOutcome(False, "SESSION_GONE"), CommandOutcome(True)]
        with patch(DISCONNECT, side_effect=outcomes):
            result = execute_hard_logout_event(event.id)
        t = result.target_results.get()
        assert t.status == "FAILED" and "1 of 3" in t.error_message
        assert Session.objects.filter(status="DISCONNECTED").count() == 2  # the two successes are durable
        assert Session.objects.filter(status="ACTIVE").count() == 1

    def test_zero_eligible_routers_is_failed_not_a_silent_success(self, place, connector, organization, user):
        add_router(place, connector, "Off", status="DISABLED")
        event = make_event(place, user, [], scope="PLACE")
        result = execute_hard_logout_event(event.id)
        assert result.status == "FAILED" and "No eligible routers" in result.failure_reason

    def test_unknown_router_ids_are_failed_not_a_silent_success(self, place, user):
        event = make_event(place, user, [uuid.uuid4()])
        result = execute_hard_logout_event(event.id)
        assert result.status == "FAILED" and result.resolved_router_ids == []


@pytest.mark.django_db
class TestMissedWindow:
    def _due_event(self, place, connector, organization, user, late_seconds):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:07:01")
        return make_event(place, user, [r.id], scheduled_at=past(late_seconds))

    def test_far_too_late_is_not_run(self, place, connector, organization, user):
        event = self._due_event(place, connector, organization, user, late_seconds=3600)
        with patch(DISCONNECT) as m:
            result = execute_hard_logout_event(event.id)
        m.assert_not_called()
        assert result.status == "FAILED" and "Missed its scheduled time" in result.failure_reason
        assert result.started_at is None and result.attempt_count == 0
        assert Session.objects.get().status == "ACTIVE"  # nobody was logged out at a surprise hour
        assert Notification.objects.get(resource_id=str(event.id)).level == "ERROR"

    def test_slightly_late_still_runs(self, place, connector, organization, user):
        event = self._due_event(place, connector, organization, user, late_seconds=300)
        assert execute_hard_logout_event(event.id).status == "COMPLETED"

    def test_window_is_configurable(self, place, connector, organization, user, settings):
        settings.HARD_LOGOUT_MAX_LATENESS_SECONDS = 60
        event = self._due_event(place, connector, organization, user, late_seconds=300)
        assert execute_hard_logout_event(event.id).status == "FAILED"

    def test_sweep_also_finalizes_missed_events(self, place, connector, organization, user):
        event = self._due_event(place, connector, organization, user, late_seconds=7200)
        assert dispatch_due_hard_logout_events() == 1
        event.refresh_from_db()
        assert event.status == "FAILED"


@pytest.mark.django_db
class TestDispatcherRecovery:
    def test_sweep_resumes_expired_lease_but_leaves_live_lease_alone(self, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        add_session(place, r, organization, "AA:00:00:00:08:01")
        stuck = make_event(place, user, [r.id], status="RUNNING", attempt_count=1,
                           lease_expires_at=past(), resolved_router_ids=[str(r.id)], started_at=timezone.now())
        r2 = add_router(place, connector, "R2")
        alive = make_event(place, user, [r2.id], status="RUNNING", attempt_count=1,
                           lease_expires_at=future(), resolved_router_ids=[str(r2.id)], started_at=timezone.now())

        assert dispatch_due_hard_logout_events() == 1
        stuck.refresh_from_db(); alive.refresh_from_db()
        assert stuck.status == "COMPLETED"
        assert alive.status == "RUNNING" and alive.attempt_count == 1


@pytest.mark.django_db
class TestApiExposure:
    def test_failure_reason_and_attempts_exposed_internals_not(self, auth_client, org_headers, place, connector, organization, user):
        r = add_router(place, connector, "R1")
        event = make_event(place, user, [r.id], scheduled_at=past(3600))
        execute_hard_logout_event(event.id)
        body = auth_client.get(f"/api/v1/hard-logout-events/{event.id}/", **org_headers).json()
        assert body["status"] == "FAILED"
        assert "Missed its scheduled time" in body["failureReason"]
        assert body["attemptCount"] == 0
        assert "leaseExpiresAt" not in body and "resolvedRouterIds" not in body


needs_postgres = pytest.mark.skipif(connection.vendor != "postgresql", reason="row-level locks need PostgreSQL")


@needs_postgres
@pytest.mark.django_db(transaction=True)
class TestRealConcurrency:
    def test_racing_workers_disconnect_each_session_exactly_once(self, place, connector, organization, user):
        routers = [add_router(place, connector, f"R{i}") for i in range(3)]
        for i, r in enumerate(routers):
            for j in range(2):
                add_session(place, r, organization, f"AA:00:00:09:0{i}:0{j}")
        event = make_event(place, user, [r.id for r in routers])

        calls, lock = [], threading.Lock()

        def slow_disconnect(router, sid):
            with lock:
                calls.append(sid)
            time.sleep(0.05)
            return CommandOutcome(success=True)

        barrier = threading.Barrier(6)
        errors = []

        def worker():
            try:
                barrier.wait()
                execute_hard_logout_event(event.id)
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                connection.close()

        with patch(DISCONNECT, side_effect=slow_disconnect):
            threads = [threading.Thread(target=worker) for _ in range(6)]
            [t.start() for t in threads]
            [t.join() for t in threads]

        assert not errors, errors
        assert len(calls) == 6 and len(set(calls)) == 6  # each session once, despite 6 racing workers
        event.refresh_from_db()
        assert event.status == "COMPLETED" and event.attempt_count == 1
        assert AuditEvent.objects.filter(resource_id=str(event.id), action="hard_logout.completed").count() == 1
        assert Notification.objects.filter(resource_id=str(event.id)).count() == 1

    def test_cancel_racing_execute_is_always_consistent(self, place, connector, organization, user):
        """HL-05: cancel-before-execution must mean NO network command. Whichever
        side wins the row lock, the outcome must be coherent."""
        for i in range(12):
            r = add_router(place, connector, f"RC{i}")
            s = add_session(place, r, organization, f"AA:00:00:0A:{i:02x}:01")
            event = make_event(place, user, [r.id])
            calls, outcome = [], {}

            def counting(router, sid):
                calls.append(sid)
                return CommandOutcome(success=True)

            def do_cancel():
                try:
                    cancel_hard_logout_event(event, actor=user)
                    outcome["cancel"] = "ok"
                except ConflictError:
                    outcome["cancel"] = "conflict"
                finally:
                    connection.close()

            def do_exec():
                try:
                    execute_hard_logout_event(event.id)
                finally:
                    connection.close()

            with patch(DISCONNECT, side_effect=counting):
                ts = [threading.Thread(target=do_cancel), threading.Thread(target=do_exec)]
                [t.start() for t in ts]
                [t.join() for t in ts]

            event.refresh_from_db(); s.refresh_from_db()
            if outcome["cancel"] == "ok":
                assert event.status == "CANCELLED" and calls == [] and s.status == "ACTIVE"
            else:
                assert event.status == "COMPLETED" and len(calls) == 1 and s.status == "DISCONNECTED"
