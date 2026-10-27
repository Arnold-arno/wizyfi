# apps/access/tests/test_reset_credit.py
#
# Round 17: a customer who connects in the last hour before a reset gets their
# voucher back when that reset ends their session, so they can sign in again.
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.access.codes import generate_code, hash_code, last4_of
from apps.access.models import AccessPlan, HardLogoutEvent, Session, Voucher
from apps.access.reset_credit import credit_short_session
from apps.access.services import (
    execute_hard_logout_event,
    expire_due_sessions,
    redeem_voucher,
    schedule_hard_logout_event,
    start_session,
)
from apps.audit.models import AuditEvent
from apps.connectors.adapters.base import CommandOutcome

DISCONNECT = "apps.access.services.connector_services.disconnect_session"
OK = CommandOutcome(success=True)
DOWN = CommandOutcome(success=False, error_code="NETWORK_UNAVAILABLE")


def minutes(n):
    return timezone.now() + timezone.timedelta(minutes=n)


@pytest.fixture
def reset_plan(organization):
    return AccessPlan.objects.create(
        organization=organization, name="Until reset", price="1000", duration_minutes=600,
        status="ACTIVE", validity_mode="UNTIL_NEXT_RESET",
    )


def reset_in(place, user, n):
    return schedule_hard_logout_event(
        place=place, scope_type="PLACE", router_ids=[], scheduled_at=minutes(n),
        scheduled_timezone="UTC", created_by=user,
    )


def redeemed_session(place, router, plan, organization, mac="AA:00:00:40:00:01"):
    code = generate_code()
    v = Voucher.objects.create(plan=plan, code_hash=hash_code(code), code_last4=last4_of(code), status="AVAILABLE")
    redeem_voucher(organization_id=organization.id, code=code, mac_address=mac)
    v.refresh_from_db()
    s = start_session(customer=v.redeemed_by_customer, router=router, place=place, voucher=v, access_plan=plan)
    return v, s, code


def run_reset(event):
    HardLogoutEvent.objects.filter(id=event.id).update(scheduled_at=minutes(-1))
    return execute_hard_logout_event(event.id)


@pytest.mark.django_db
class TestCreditOnReset:
    def test_late_login_gets_voucher_back_and_can_redeem_again(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, s, code = redeemed_session(place, router, reset_plan, organization)
        assert s.bound_reset_event_id == ev.id
        run_reset(ev)
        v.refresh_from_db(); s.refresh_from_db()
        assert s.status == "DISCONNECTED"
        assert v.status == "AVAILABLE" and v.redeemed_at is None and v.redeemed_by_customer_id is None
        again = redeem_voucher(organization_id=organization.id, code=code, mac_address="AA:00:00:40:00:01")
        assert again.status == "REDEEMED"

    def test_audited_without_plaintext_code(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, _, code = redeemed_session(place, router, reset_plan, organization)
        run_reset(ev)
        row = AuditEvent.objects.get(action="voucher.restored_after_reset")
        assert row.resource_id == str(v.id) and code not in str(row.metadata)
        assert row.metadata["reset_event_id"] == str(ev.id)

    def test_early_login_keeps_voucher_consumed(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 120)  # got two hours: nothing to give back
        v, _, _ = redeemed_session(place, router, reset_plan, organization)
        run_reset(ev)
        v.refresh_from_db()
        assert v.status == "REDEEMED"

    def test_boundary_just_under_and_just_over_an_hour(self, place, router, reset_plan, organization, user):
        ev_a = reset_in(place, user, 59)
        va, _, _ = redeemed_session(place, router, reset_plan, organization, "AA:00:00:40:01:01")
        run_reset(ev_a)
        va.refresh_from_db()
        assert va.status == "AVAILABLE"
        ev_b = reset_in(place, user, 61)
        vb, _, _ = redeemed_session(place, router, reset_plan, organization, "AA:00:00:40:01:02")
        run_reset(ev_b)
        vb.refresh_from_db()
        assert vb.status == "REDEEMED"

    def test_failed_disconnect_gives_no_credit(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, s, _ = redeemed_session(place, router, reset_plan, organization)
        with patch(DISCONNECT, return_value=DOWN):
            run_reset(ev)
        v.refresh_from_db(); s.refresh_from_db()
        assert s.status == "ACTIVE" and v.status == "REDEEMED"

    def test_expired_voucher_is_not_restored(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, _, _ = redeemed_session(place, router, reset_plan, organization)
        Voucher.objects.filter(id=v.id).update(expires_at=minutes(-5))
        run_reset(ev)
        v.refresh_from_db()
        assert v.status == "REDEEMED"

    def test_setting_zero_disables_the_credit(self, place, router, reset_plan, organization, user, settings):
        settings.RESET_MIN_ACCESS_MINUTES = 0
        ev = reset_in(place, user, 30)
        v, _, _ = redeemed_session(place, router, reset_plan, organization)
        run_reset(ev)
        v.refresh_from_db()
        assert v.status == "REDEEMED"

    def test_duration_plan_is_never_credited(self, place, router, access_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, s, _ = redeemed_session(place, router, access_plan, organization)  # DURATION plan: not bound
        assert s.bound_reset_event_id is None
        run_reset(ev)
        v.refresh_from_db()
        assert v.status == "REDEEMED"


@pytest.mark.django_db
class TestGuards:
    def test_session_without_voucher(self, place, router, reset_plan, organization, user):
        from apps.customers.models import Customer

        ev = reset_in(place, user, 30)
        c = Customer.objects.create(organization=organization, mac_address="AA:00:00:41:00:01")
        s = start_session(customer=c, router=router, place=place, access_plan=reset_plan)
        assert credit_short_session(s.id, ev.id) is False

    def test_wrong_reset_event_id(self, place, router, reset_plan, organization, user):
        import uuid

        reset_in(place, user, 30)
        v, s, _ = redeemed_session(place, router, reset_plan, organization)
        assert credit_short_session(s.id, uuid.uuid4()) is False
        v.refresh_from_db()
        assert v.status == "REDEEMED"

    def test_credit_is_applied_once(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, s, _ = redeemed_session(place, router, reset_plan, organization)
        run_reset(ev)
        assert credit_short_session(s.id, ev.id) is False  # voucher no longer REDEEMED
        assert AuditEvent.objects.filter(action="voucher.restored_after_reset").count() == 1


@pytest.mark.django_db
class TestSweepTakeover:
    def test_sweep_credits_when_the_reset_could_not_end_the_session(self, place, router, reset_plan, organization, user):
        ev = reset_in(place, user, 30)
        v, s, _ = redeemed_session(place, router, reset_plan, organization)
        HardLogoutEvent.objects.filter(id=ev.id).update(status="FAILED")
        Session.objects.filter(id=s.id).update(started_at=minutes(-31), expires_at=minutes(-1))
        with patch(DISCONNECT, return_value=OK):
            expire_due_sessions()
        v.refresh_from_db(); s.refresh_from_db()
        assert s.status == "EXPIRED" and v.status == "AVAILABLE"
