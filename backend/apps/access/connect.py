# apps/access/connect.py
#
# Round 22: the captive-portal "voucher -> online" flow in one place.
#
#   1. Under a row lock, validate the voucher and (if it is a first use) consume it,
#      creating a PENDING session. No network I/O inside the transaction.
#   2. Ask the router to let the device on (adapter.authorize_session), with the
#      session end time and the plan's data cap.
#   3. Success -> session ACTIVE. Failure -> session FAILED and the voucher is given
#      back, so a router outage never costs the customer their code.
#
# Rules enforced here (previously nothing enforced them):
#   * Only an ACTIVE plan inside its availability window can be redeemed. Pausing or
#     archiving a plan stops NEW redemptions (existing live sessions keep running).
#   * Device limit: plan.max_concurrent_devices (None/1 = one device). With N >= 2 the
#     same voucher may be used on up to N devices at once; every device shares the first
#     device's end time, so extra devices never extend access.
#   * Re-entering the code on the SAME device while its session is live just re-authorizes
#     it (reconnect after Wi-Fi drop) instead of failing with "already redeemed".
#   * A BLOCKED customer cannot connect.
#   * The data cap travels to the router in the grant; enforcing it is the adapter's job.

import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.audit.models import ActorType
from apps.audit.services import record_event
from apps.common.exceptions import ConflictError, NetworkUnavailableError
from apps.connectors import services as connector_services
from apps.connectors.adapters.base import CommandOutcome, SessionGrant
from apps.customers.models import Customer

from .codes import hash_code
from .models import Session, Voucher
from .services import LIVE_SESSION_STATUSES, _classify, start_session

logger = logging.getLogger(__name__)


def plan_is_open(plan, now) -> bool:
    return (
        plan.status == "ACTIVE"
        and (plan.available_from is None or plan.available_from <= now)
        and (plan.available_until is None or plan.available_until >= now)
    )


def device_limit(plan) -> int:
    return max(1, plan.max_concurrent_devices or 1)


def normalize_mac(mac: str) -> str:
    return mac.strip().upper().replace("-", ":")


def _customer_for(organization_id, mac):
    customer, _ = Customer.objects.get_or_create(
        organization_id=organization_id, mac_address=mac, defaults={"status": "ACTIVE"}
    )
    return customer


def _join_redeemed(voucher, mac, router, place, now):
    """Voucher already REDEEMED. Returns (session, error, reuse)."""
    plan = voucher.plan
    live = list(
        Session.objects.filter(voucher=voucher, status__in=(*LIVE_SESSION_STATUSES, "PENDING"))
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .select_related("customer")
    )
    for s in live:
        if s.customer.mac_address == mac and s.status in LIVE_SESSION_STATUSES:
            return s, None, True  # reconnect of the same device
    limit = device_limit(plan)
    owner = next((s for s in live if s.status in LIVE_SESSION_STATUSES), None)
    if owner is None:
        return None, ConflictError("This voucher has already been redeemed."), False
    if limit < 2:
        return None, ConflictError("This voucher has already been redeemed."), False
    if len(live) >= limit:
        return None, ConflictError(f"This voucher is already in use on {limit} devices."), False
    if not plan_is_open(plan, now):
        return None, ConflictError("This voucher's plan isn't available right now."), False
    customer = _customer_for(place.organization_id, mac)
    if customer.status == "BLOCKED":
        return None, ConflictError("This device is blocked."), False
    session = Session.objects.create(
        customer=customer, router=router, place=place, access_plan=plan, voucher=voucher,
        started_at=now, expires_at=owner.expires_at,  # shared end time: never extends access
        bound_reset_event_id=owner.bound_reset_event_id, status="PENDING",
    )
    return session, None, False


def connect_with_voucher(*, place, router, code: str, mac_address: str) -> Session:
    mac = normalize_mac(mac_address)
    now = timezone.now()
    error = None
    session = None
    first_use = False
    reuse = False

    with transaction.atomic():
        voucher = (
            Voucher.objects.select_for_update(of=("self",))
            .select_related("plan")
            .filter(code_hash=hash_code(code), plan__organization_id=place.organization_id)
            .first()
        )
        if voucher is None:
            error = ConflictError("Invalid voucher code.")
        elif voucher.status in ("REVOKED", "EXPIRED"):
            error = ConflictError(f"This voucher is {voucher.status.lower()}.")
        elif voucher.status == "REDEEMED":
            session, error, reuse = _join_redeemed(voucher, mac, router, place, now)
        elif voucher.expires_at and voucher.expires_at < now:
            voucher.status = "EXPIRED"  # persisted: the block exits normally, the error is raised after
            voucher.save(update_fields=["status", "updated_at"])
            error = ConflictError("This voucher has expired.")
        elif not plan_is_open(voucher.plan, now):
            error = ConflictError("This voucher's plan isn't available right now.")
        else:
            customer = _customer_for(place.organization_id, mac)
            if customer.status == "BLOCKED":
                error = ConflictError("This device is blocked.")
            else:
                voucher.status = "REDEEMED"
                voucher.redeemed_at = now
                voucher.redeemed_by_customer = customer
                voucher.save(update_fields=["status", "redeemed_at", "redeemed_by_customer", "updated_at"])
                session = start_session(
                    customer=customer, router=router, place=place, voucher=voucher,
                    access_plan=voucher.plan, status="PENDING",
                )
                first_use = True
    if error:
        raise error

    plan = session.access_plan
    grant = SessionGrant(
        session_identifier=str(session.id), mac_address=mac, expires_at=session.expires_at,
        data_cap_mb=plan.data_cap_mb if plan else None,
    )
    try:
        outcome = connector_services.authorize_session(router, grant)
    except Exception as exc:  # adapter bug / undecryptable credentials: fail this request, not the server
        logger.exception("connect.adapter_exception", extra={"session_id": str(session.id)})
        outcome = CommandOutcome(success=False, error_code=_classify(exc))

    if outcome.success:
        if not reuse:
            Session.objects.filter(id=session.id, status="PENDING").update(status="ACTIVE", updated_at=timezone.now())
        return Session.objects.select_related("access_plan").get(id=session.id)

    if not reuse:
        _rollback(session, first_use, outcome.error_code or "NETWORK_UNAVAILABLE")
    raise NetworkUnavailableError()


def _rollback(session, first_use: bool, error_code: str) -> None:
    now = timezone.now()
    with transaction.atomic():
        Session.objects.filter(id=session.id, status="PENDING").update(status="FAILED", ended_at=now, updated_at=now)
        if first_use and session.voucher_id:
            voucher = Voucher.objects.select_for_update().get(id=session.voucher_id)
            others = Session.objects.filter(
                voucher=voucher, status__in=(*LIVE_SESSION_STATUSES, "PENDING")
            ).exists()
            if voucher.status == "REDEEMED" and not others:
                voucher.status = "AVAILABLE"
                voucher.redeemed_at = None
                voucher.redeemed_by_customer = None
                voucher.save(update_fields=["status", "redeemed_at", "redeemed_by_customer", "updated_at"])
        record_event(
            organization_id=session.place.organization_id,
            action="session.authorize_failed",
            resource_type="Session",
            resource_id=session.id,
            actor_type=ActorType.SYSTEM,
            metadata={"router_id": str(session.router_id), "error_code": error_code, "voucher_restored": first_use},
        )
