# apps/access/reset_credit.py
#
# Round 17: "last-hour credit". A customer who connects shortly before a reset
# (their paid access is planned to last LESS than RESET_MIN_ACCESS_MINUTES,
# default 60) would lose most of what they paid for. When that reset actually
# ends their session, their voucher is made redeemable again, so they can sign
# back in after the reset.
#
# Deliberately narrow:
#  * only sessions bound to a reset (UNTIL_NEXT_RESET plans);
#  * only after the session was really ended by that reset (or, if the reset
#    could not do it, by the expiry sweep at that same moment);
#  * only a voucher that is still REDEEMED and not past its own expiry;
#  * one conditional, audited transaction; plaintext code is never touched.
# It only READS reset data and never creates or triggers a reset (doc00 §4).

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import ActorType
from apps.audit.services import record_event

from .codes import format_masked
from .models import Session, Voucher

logger = logging.getLogger(__name__)


def min_access_minutes() -> int:
    return int(getattr(settings, "RESET_MIN_ACCESS_MINUTES", 60))


def credit_short_session(session_id, reset_event_id) -> bool:
    """True if a voucher was made redeemable again. Never raises: a credit
    problem must not break a reset."""
    minimum = min_access_minutes()
    if minimum <= 0:
        return False
    try:
        session = Session.objects.filter(id=session_id).first()
        if (
            session is None
            or session.bound_reset_event_id != reset_event_id
            or session.voucher_id is None
            or session.expires_at is None
        ):
            return False
        planned = session.expires_at - session.started_at
        if planned >= timedelta(minutes=minimum):
            return False

        now = timezone.now()
        with transaction.atomic():
            # No select_related: FOR UPDATE can't lock the nullable side of a join.
            voucher = Voucher.objects.select_for_update().select_related(None).get(id=session.voucher_id)
            if voucher.status != "REDEEMED":
                return False
            if voucher.expires_at and voucher.expires_at <= now:
                return False  # the voucher's own validity is over; nothing to give back
            voucher.status = "AVAILABLE"
            voucher.redeemed_at = None
            voucher.redeemed_by_customer = None
            voucher.save(update_fields=["status", "redeemed_at", "redeemed_by_customer", "updated_at"])
            record_event(
                organization_id=voucher.plan.organization_id,
                action="voucher.restored_after_reset",
                resource_type="Voucher",
                resource_id=voucher.id,
                actor_type=ActorType.SYSTEM,
                metadata={
                    "session_id": str(session.id),
                    "reset_event_id": str(reset_event_id),
                    "masked_code": format_masked(voucher.code_last4),
                    "planned_minutes": int(planned.total_seconds() // 60),
                },
            )
        return True
    except Exception:
        logger.exception("reset_credit.failed", extra={"session_id": str(session_id)})
        return False
