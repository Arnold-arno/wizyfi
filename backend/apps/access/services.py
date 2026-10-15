# apps/access/services.py
#
# doc10 Service-Layer Rule: views translate HTTP into validated inputs;
# services perform business rules and transactions. This module owns the
# voucher lifecycle logic — batch generation, redemption, revocation — and
# the Hard Logout (Wizyfi) scheduling/execution logic.
#
# CHANGED (Round 14): only the Hard Logout EXECUTION section was rewritten
# (see its header). Voucher, session, schedule and cancel logic is unchanged.

import logging
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import ActorType
from apps.audit.services import record_event
from apps.common.exceptions import ConflictError, NetworkUnavailable
from apps.common.idempotency import run_idempotent
from apps.connectors import services as connector_services
from apps.connectors.adapters.base import CommandOutcome
from apps.connectors.models import Router
from apps.customers.models import Customer
from apps.notifications.models import NotificationLevel
from apps.notifications.services import notify

from .codes import format_masked, generate_code, hash_code, last4_of
from .models import (
    AccessPlan,
    HardLogoutEvent,
    HardLogoutTargetResult,
    Session,
    Voucher,
)

logger = logging.getLogger(__name__)

MAX_BATCH_SIZE = 5000

# Sessions that currently have network access. EXPIRING is "near expiry, still
# connected" (doc03 §5); anything that ends access must treat it like ACTIVE.
LIVE_SESSION_STATUSES = ("ACTIVE", "EXPIRING")


@transaction.atomic
def create_voucher_batch(
    *, organization_id, plan_id: str, quantity: int, expires_at=None, prefix: str = ""
) -> dict:
    """The actual generation logic — called once per unique idempotency
    key by create_voucher_batch_idempotent below. Returns a dict shaped
    for direct JSON response (VoucherBatchResult on the frontend)."""

    if quantity < 1 or quantity > MAX_BATCH_SIZE:
        raise ValueError(f"quantity must be between 1 and {MAX_BATCH_SIZE}.")

    try:
        plan = AccessPlan.objects.get(id=plan_id, organization_id=organization_id)
    except AccessPlan.DoesNotExist:
        raise ValueError("Access plan not found in this organization.")

    batch_id = None
    codes: list[str] = []
    vouchers: list[Voucher] = []

    import uuid as _uuid
    batch_id = _uuid.uuid4()

    for _ in range(quantity):
        # Collisions are astronomically unlikely (8 chars over a
        # 31-symbol alphabet) but handled explicitly rather than assumed
        # away — retry with a fresh code on the rare unique clash.
        for _attempt in range(5):
            code = generate_code()
            if prefix:
                code = f"{prefix}-{code}"
            code_hash = hash_code(code)
            if not Voucher.objects.filter(code_hash=code_hash).exists():
                break
        else:
            raise RuntimeError("Could not generate a unique voucher code after 5 attempts.")

        vouchers.append(
            Voucher(
                plan=plan,
                batch_id=batch_id,
                code_hash=code_hash,
                code_last4=last4_of(code),
                status="AVAILABLE",
                expires_at=expires_at,
            )
        )
        codes.append(code)

    Voucher.objects.bulk_create(vouchers)

    return {
        "batch_id": str(batch_id),
        "plan_id": str(plan.id),
        "quantity": quantity,
        "codes": codes,  # shown once — never retrievable again after this response
        "created_at": timezone.now().isoformat(),
    }


def create_voucher_batch_idempotent(
    *, organization_id, idempotency_key: str, plan_id: str, quantity: int, expires_at=None, prefix: str = ""
) -> tuple[int, dict]:
    request_data = {
        "organization_id": str(organization_id),
        "plan_id": plan_id,
        "quantity": quantity,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "prefix": prefix,
    }

    def compute():
        body = create_voucher_batch(
            organization_id=organization_id,
            plan_id=plan_id,
            quantity=quantity,
            expires_at=expires_at,
            prefix=prefix,
        )
        return 201, body

    return run_idempotent(
        scope="voucher_batch_create",
        key=idempotency_key,
        request_data=request_data,
        compute_fn=compute,
    )


REVOCABLE_STATUSES = {"AVAILABLE", "ISSUED"}


@transaction.atomic
def revoke_voucher(voucher: Voucher, *, actor=None) -> Voucher:
    # Re-fetch and lock: a voucher mid-redemption elsewhere must not be
    # revoked out from under that transaction.
    voucher = Voucher.objects.select_for_update().get(id=voucher.id)
    if voucher.status not in REVOCABLE_STATUSES:
        raise ConflictError(f"A voucher in {voucher.status} status cannot be revoked.")
    voucher.status = "REVOKED"
    voucher.save(update_fields=["status", "updated_at"])

    record_event(
        organization_id=voucher.plan.organization_id,
        action="voucher.revoked",
        resource_type="Voucher",
        resource_id=voucher.id,
        actor=actor,
        actor_type=ActorType.STAFF if actor else ActorType.SYSTEM,
        metadata={"plan_id": str(voucher.plan_id), "masked_code": format_masked(voucher.code_last4)},
    )
    return voucher


def redeem_voucher(*, organization_id, code: str, mac_address: str) -> Voucher:
    """The core double-redemption-safe path (Expectations_and_workflow:
    'Voucher double-redemption prevention: Row-level locking via
    select_for_update() on redemption'). This is domain logic only —
    the actual public-facing endpoint belongs to apps.portal (next
    round); this function is what that endpoint will call.

    Note: SELECT ... FOR UPDATE is a no-op on SQLite (no row-level
    locking support), so this only gets real concurrent-safety
    verification against PostgreSQL — flagged in the delivery notes,
    not silently assumed to be proven by the SQLite-based smoke test.

    Structural note: the transaction block below must always exit
    *normally*, even on the reject-and-mark-expired path. Raising an
    exception from inside an atomic block rolls back everything in it —
    including the voucher.status = "EXPIRED" write that's supposed to
    persist despite the redemption itself failing. An earlier version
    raised ConflictError from inside the atomic block on that path,
    which silently discarded the EXPIRED status change; caught by
    apps/access/tests/test_vouchers.py. The fix: collect the error (if
    any) as a plain value, let the `with` block commit normally, and
    only raise once we're back outside the transaction.
    """
    code_hash = hash_code(code)
    error: ConflictError | None = None
    voucher: Voucher | None = None

    with transaction.atomic():
        try:
            voucher = (
                Voucher.objects.select_for_update()
                .select_related("plan")
                .get(code_hash=code_hash, plan__organization_id=organization_id)
            )
        except Voucher.DoesNotExist:
            voucher = None

        if voucher is None:
            error = ConflictError("Invalid voucher code.")
        elif voucher.status == "REDEEMED":
            error = ConflictError("This voucher has already been redeemed.")
        elif voucher.status in ("EXPIRED", "REVOKED"):
            error = ConflictError(f"This voucher is {voucher.status.lower()}.")
        elif voucher.expires_at and voucher.expires_at < timezone.now():
            voucher.status = "EXPIRED"
            voucher.save(update_fields=["status", "updated_at"])
            error = ConflictError("This voucher has expired.")
        else:
            # Voucher-only customer records, keyed on MAC address
            # (Expectations_and_workflow).
            customer, _ = Customer.objects.get_or_create(
                organization_id=organization_id,
                mac_address=mac_address,
                defaults={"status": "ACTIVE"},
            )
            voucher.status = "REDEEMED"
            voucher.redeemed_at = timezone.now()
            voucher.redeemed_by_customer = customer
            voucher.save(
                update_fields=["status", "redeemed_at", "redeemed_by_customer", "updated_at"]
            )

    if error:
        raise error
    return voucher


@transaction.atomic
def start_session(*, customer: Customer, router: Router, place, voucher: Voucher = None,
                   access_plan: AccessPlan = None, device=None) -> Session:
    """Grants timed network access after a successful redemption/auth.
    Deliberately a separate step from redeem_voucher: redemption proves
    entitlement, this is what actually starts the clock."""

    plan = access_plan or (voucher.plan if voucher else None)
    expires_at = (
        timezone.now() + timezone.timedelta(minutes=plan.duration_minutes) if plan else None
    )
    return Session.objects.create(
        customer=customer,
        device=device,
        router=router,
        place=place,
        access_plan=plan,
        voucher=voucher,
        started_at=timezone.now(),
        expires_at=expires_at,
        status="ACTIVE",
    )


# ---------------------------------------------------------------------------
# Hard Logout (Wizyfi) — independent subsystem (doc03/doc08/doc10/doc11).
# ---------------------------------------------------------------------------


@transaction.atomic
def schedule_hard_logout_event(
    *, place, scope_type: str, router_ids: list[str], scheduled_at, scheduled_timezone: str,
    created_by, impact_estimate_connections: int | None = None,
) -> HardLogoutEvent:
    if scheduled_at <= timezone.now():
        raise ValueError("scheduled_at must be in the future.")
    if scope_type in ("ROUTER", "ROUTERS") and not router_ids:
        raise ValueError("router_ids is required for ROUTER/ROUTERS scope.")
    if scope_type == "ROUTER" and len(router_ids) != 1:
        raise ValueError("ROUTER scope must specify exactly one router.")

    # Schedule stage: persist inside a transaction before returning
    # success (doc10) — the @transaction.atomic above does that.
    event = HardLogoutEvent.objects.create(
        place=place,
        scope_type=scope_type,
        router_ids=router_ids,
        scheduled_at=scheduled_at,
        scheduled_timezone=scheduled_timezone,
        created_by=created_by,
        impact_estimate_connections=impact_estimate_connections,
        status="SCHEDULED",
    )
    record_event(
        organization_id=place.organization_id,
        action="hard_logout.scheduled",
        resource_type="HardLogoutEvent",
        resource_id=event.id,
        actor=created_by,
        actor_type=ActorType.STAFF,
        metadata={
            "scope_type": scope_type, "place_id": str(place.id),
            "scheduled_at": scheduled_at.isoformat(),
        },
    )
    return event


@transaction.atomic
def cancel_hard_logout_event(event: HardLogoutEvent, *, actor, reason: str = "") -> HardLogoutEvent:
    event = HardLogoutEvent.objects.select_for_update().get(id=event.id)
    if event.status != "SCHEDULED":
        raise ConflictError(f"An event in {event.status} status cannot be cancelled.")
    event.status = "CANCELLED"
    event.cancelled_at = timezone.now()
    event.cancelled_by = actor
    event.cancel_reason = reason
    event.save(update_fields=["status", "cancelled_at", "cancelled_by", "cancel_reason", "updated_at"])
    record_event(
        organization_id=event.place.organization_id,
        action="hard_logout.cancelled",
        resource_type="HardLogoutEvent",
        resource_id=event.id,
        actor=actor,
        actor_type=ActorType.STAFF,
        metadata={"reason": reason},
    )
    return event


# ---------------------------------------------------------------------------
# Hard Logout EXECUTION — rewritten in Round 14.
#
# What was wrong: execute_hard_logout_event ran as ONE @transaction.atomic
# that held row locks while talking to routers over the network. A crash
# rolled back everything (so nothing was durable and "resume from durable
# state" was only trivially true), one slow router blocked the rest, and an
# event that always raised was retried forever without ever reaching FAILED.
#
# Model now (doc10 stages Start -> Resolve -> Execute -> Record -> Finalize ->
# Recovery), with NO network I/O inside any transaction:
#
#   CLAIM     short txn. SCHEDULED -> RUNNING, freeze the target routers
#             (resolved_router_ids), take a LEASE, bump attempt_count.
#   EXECUTE   per router, per session: adapter call OUTSIDE any transaction;
#             each success is committed immediately, so progress is durable.
#   RECORD    one short txn per router: target result + audit row.
#   FINALIZE  one short txn: aggregate -> COMPLETED / PARTIAL / FAILED, audit,
#             notification.
#
# Crash safety: the lease is renewed as work proceeds. If a worker dies, its
# lease expires and the next sweep CLAIMs again and resumes: targets already
# SUCCEEDED/FAILED are skipped (HL-06, HL-09) and sessions already
# disconnected are no longer ACTIVE, so nothing is repeated.
#
# Fencing: attempt_count is a fencing token. A worker whose lease was taken
# over finds its attempt number stale and stops writing, so a slow "zombie"
# worker can never overwrite the new worker's results.
#
# Bounded: after MAX_ATTEMPTS claims the event is finalized with an honest
# outcome (unfinished routers recorded as failed) instead of retrying forever.
# An event that missed its time by more than the lateness window is NOT run
# late — hard-logging users out at an unexpected hour is worse than not doing
# it — it is finalized FAILED with a clear reason.
# ---------------------------------------------------------------------------

TERMINAL_STATUSES = ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED")
LEASE_SECONDS = 120
MAX_ATTEMPTS = 5

# Router-level failures: no point hammering every remaining session on a
# router we can't reach or can't authenticate to.
ROUTER_LEVEL_CODES = ("NETWORK_UNAVAILABLE", "CONNECTOR_ERROR")

# Fixed, secret-free messages. Raw exception text is NEVER stored or shown
# (it can carry hosts or credentials, doc11); it goes to server logs only.
ERROR_MESSAGES = {
    "NETWORK_UNAVAILABLE": "The router could not be reached.",
    "CONNECTOR_ERROR": "The connector for this router is misconfigured or its credentials could not be used.",
    "INTERNAL_ERROR": "An unexpected error occurred while disconnecting this router.",
    "NOT_ATTEMPTED": "This router was not attempted before the event was stopped.",
    "INTERRUPTED": "This router was being processed when the worker stopped; it was not completed.",
}


def _max_lateness() -> timedelta:
    return timedelta(seconds=getattr(settings, "HARD_LOGOUT_MAX_LATENESS_SECONDS", 900))


@dataclass
class RouterOutcome:
    total: int
    failed: int
    error_code: str = ""


def _classify(exc: Exception) -> str:
    if isinstance(exc, NetworkUnavailable):
        return "NETWORK_UNAVAILABLE"
    if isinstance(exc, ValueError):  # undecryptable credentials / unknown vendor
        return "CONNECTOR_ERROR"
    return "INTERNAL_ERROR"


def _resolve_target_routers(event: HardLogoutEvent) -> list[Router]:
    if event.scope_type == "PLACE":
        # Resolved at the moment the run STARTS and then frozen on the event.
        # Explicitly excludes DISABLED routers: a disabled router isn't a
        # legitimate execution target.
        return list(Router.objects.filter(place=event.place).exclude(status="DISABLED"))
    return list(Router.objects.filter(id__in=event.router_ids, place=event.place))


def _finalize(event: HardLogoutEvent, *, reason: str = "") -> None:
    """Aggregate target rows into the terminal state. The caller must hold the
    row lock inside a transaction, so status, audit and notification commit
    together."""
    results = list(event.target_results.all())
    succeeded = sum(1 for r in results if r.status == "SUCCEEDED")
    failed = len(results) - succeeded  # anything not SUCCEEDED is not a success

    if not results:
        status = "FAILED"
        reason = reason or "No eligible routers were found for this scope, so nobody was disconnected."
    elif failed == 0:
        status = "COMPLETED"
    elif succeeded == 0:
        status = "FAILED"
    else:
        status = "PARTIAL"

    event.status = status
    event.succeeded_count = succeeded
    event.failed_count = failed
    event.failure_reason = reason[:500]
    event.completed_at = timezone.now()
    event.lease_expires_at = None
    event.save(update_fields=[
        "status", "succeeded_count", "failed_count", "failure_reason",
        "completed_at", "lease_expires_at", "updated_at",
    ])

    record_event(
        organization_id=event.place.organization_id,
        action=f"hard_logout.{status.lower()}",
        resource_type="HardLogoutEvent",
        resource_id=event.id,
        actor_type=ActorType.SYSTEM,
        metadata={"succeeded_count": succeeded, "failed_count": failed, "attempts": event.attempt_count},
    )
    level_by_status = {
        "COMPLETED": NotificationLevel.SUCCESS,
        "PARTIAL": NotificationLevel.WARNING,
        "FAILED": NotificationLevel.ERROR,
    }
    notify(
        organization_id=event.place.organization_id,
        level=level_by_status[status],
        title=f"Hard logout {status.lower()} at {event.place.name}",
        message=f"{succeeded} succeeded, {failed} failed." + (f" {reason}" if reason else ""),
        resource_type="HardLogoutEvent",
        resource_id=event.id,
    )


def _give_up(event: HardLogoutEvent, now) -> None:
    """MAX_ATTEMPTS reached: record every unfinished router as failed (never
    as success) and finalize with whatever really happened."""
    done = {
        str(rid): status
        for rid, status in event.target_results.values_list("router_id", "status")
    }
    for rid in event.resolved_router_ids:
        if rid not in done:
            HardLogoutTargetResult.objects.create(
                event=event, router_id=rid, status="FAILED", attempted_at=now, completed_at=now,
                error_code="NOT_ATTEMPTED", error_message=ERROR_MESSAGES["NOT_ATTEMPTED"],
            )
    event.target_results.filter(status="ATTEMPTED").update(
        status="FAILED", completed_at=now, error_code="INTERRUPTED",
        error_message=ERROR_MESSAGES["INTERRUPTED"], updated_at=now,
    )
    _finalize(event, reason=f"Stopped after {MAX_ATTEMPTS} attempts; the worker kept failing or stopping.")


def _claim_hard_logout_event(event_id):
    """Returns (event, attempt). attempt is None when there is nothing for
    this caller to run (already terminal, another live worker, missed window,
    or just finalized here)."""
    now = timezone.now()
    with transaction.atomic():
        event = HardLogoutEvent.objects.select_for_update().get(id=event_id)

        if event.status in TERMINAL_STATUSES:
            return event, None  # duplicate dispatch / retry: a no-op, not an error

        if event.status == "RUNNING" and event.lease_expires_at and event.lease_expires_at > now:
            return event, None  # another worker is alive and holds the lease

        first_run = event.status == "SCHEDULED"

        if first_run and now - event.scheduled_at > _max_lateness():
            minutes = int(_max_lateness().total_seconds() // 60)
            _finalize(
                event,
                reason=f"Missed its scheduled time by more than {minutes} minutes "
                       "(the scheduler was unavailable), so it was not run.",
            )
            return event, None

        if event.attempt_count >= MAX_ATTEMPTS:
            _give_up(event, now)
            return event, None

        if first_run:
            event.status = "RUNNING"
            event.started_at = now
            event.resolved_router_ids = [str(r.id) for r in _resolve_target_routers(event)]
        event.attempt_count += 1
        event.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
        event.save(update_fields=[
            "status", "started_at", "resolved_router_ids", "attempt_count",
            "lease_expires_at", "updated_at",
        ])
        if first_run:
            record_event(
                organization_id=event.place.organization_id,
                action="hard_logout.started",
                resource_type="HardLogoutEvent",
                resource_id=event.id,
                actor_type=ActorType.SYSTEM,
                metadata={"target_count": len(event.resolved_router_ids)},
            )
        return event, event.attempt_count


def _renew_lease(event_id, attempt: int) -> bool:
    """False means we've been fenced out (taken over / finalized): stop."""
    now = timezone.now()
    return HardLogoutEvent.objects.filter(
        id=event_id, status="RUNNING", attempt_count=attempt
    ).update(lease_expires_at=now + timedelta(seconds=LEASE_SECONDS), updated_at=now) == 1


def _disconnect_router_sessions(event: HardLogoutEvent, router: Router, attempt: int) -> RouterOutcome | None:
    """Adapter calls happen here, outside any transaction. Each success is
    committed immediately. Returns None if fenced out mid-way."""
    session_ids = list(
        Session.objects.filter(router=router, status__in=LIVE_SESSION_STATUSES).values_list("id", flat=True)
    )
    failed = 0
    first_code = ""

    for index, sid in enumerate(session_ids, start=1):
        if not _renew_lease(event.id, attempt):
            return None
        try:
            outcome = connector_services.disconnect_session(router, str(sid))
        except Exception as exc:  # adapter bug/outage must fail THIS target, not the run
            logger.exception("hard_logout.adapter_exception", extra={
                "event_id": str(event.id), "router_id": str(router.id),
            })
            outcome = CommandOutcome(success=False, error_code=_classify(exc))

        if outcome.success:
            now = timezone.now()
            # Conditional update: idempotent if someone disconnected it meanwhile.
            Session.objects.filter(id=sid, status__in=LIVE_SESSION_STATUSES).update(
                status="DISCONNECTED", ended_at=now, updated_at=now
            )
            continue

        failed += 1
        code = outcome.error_code or "NETWORK_UNAVAILABLE"
        first_code = first_code or code
        if code in ROUTER_LEVEL_CODES:
            failed += len(session_ids) - index  # the rest were not attempted, so not disconnected
            break

    return RouterOutcome(total=len(session_ids), failed=failed, error_code=first_code)


def _record_target(event_id, attempt: int, target_id, router: Router, outcome: RouterOutcome) -> bool:
    """One short transaction per router. Fenced: a stale worker records nothing."""
    with transaction.atomic():
        event = HardLogoutEvent.objects.select_for_update().get(id=event_id)
        if event.status != "RUNNING" or event.attempt_count != attempt:
            return False
        target = HardLogoutTargetResult.objects.select_for_update().get(id=target_id)
        ok = outcome.failed == 0
        target.status = "SUCCEEDED" if ok else "FAILED"
        target.completed_at = timezone.now()
        if ok:
            target.error_code, target.error_message = "", ""
        else:
            target.error_code = outcome.error_code or "NETWORK_UNAVAILABLE"
            target.error_message = (
                f"{outcome.failed} of {outcome.total} session(s) on this router could not be disconnected. "
                f"{ERROR_MESSAGES.get(target.error_code, '')}"
            ).strip()[:500]
        target.save(update_fields=["status", "completed_at", "error_code", "error_message", "updated_at"])
        record_event(
            organization_id=event.place.organization_id,
            action="hard_logout.target_succeeded" if ok else "hard_logout.target_failed",
            resource_type="HardLogoutEvent",
            resource_id=event.id,
            actor_type=ActorType.SYSTEM,
            metadata={
                "router_id": str(router.id), "sessions_total": outcome.total,
                "sessions_failed": outcome.failed, "error_code": target.error_code,
            },
        )
    return True


def _process_targets(event: HardLogoutEvent, attempt: int) -> bool:
    """Runs every unfinished target. False = fenced out; the caller must not finalize."""
    routers = {str(r.id): r for r in Router.objects.filter(id__in=event.resolved_router_ids)}
    for rid in event.resolved_router_ids:
        router = routers.get(rid)
        if router is None:
            logger.warning("hard_logout.router_missing", extra={"event_id": str(event.id), "router_id": rid})
            continue
        existing = HardLogoutTargetResult.objects.filter(event=event, router=router).first()
        if existing and existing.status in ("SUCCEEDED", "FAILED"):
            continue  # committed by an earlier attempt — never repeat it (HL-09)
        if not _renew_lease(event.id, attempt):
            return False
        target = existing or HardLogoutTargetResult.objects.create(
            event=event, router=router, status="ATTEMPTED", attempted_at=timezone.now()
        )
        outcome = _disconnect_router_sessions(event, router, attempt)
        if outcome is None or not _record_target(event.id, attempt, target.id, router, outcome):
            return False
    return True


def _finalize_attempt(event_id, attempt: int) -> None:
    with transaction.atomic():
        event = HardLogoutEvent.objects.select_for_update().get(id=event_id)
        if event.status != "RUNNING" or event.attempt_count != attempt:
            return  # fenced out
        _finalize(event)


def execute_hard_logout_event(event_id) -> HardLogoutEvent:
    """Safe to call any number of times, from any number of workers, for the
    same event_id: a duplicate is a no-op while another worker holds a live
    lease or once the event is terminal (doc10 Recovery; HL-06, HL-09)."""
    event, attempt = _claim_hard_logout_event(event_id)
    if attempt is None:
        return HardLogoutEvent.objects.get(id=event_id)

    try:
        completed = _process_targets(event, attempt)
    except Exception:
        logger.exception("hard_logout.execution_crashed", extra={"event_id": str(event_id), "attempt": attempt})
        # Release our lease so the next sweep resumes promptly instead of
        # waiting out the full lease; the attempt is already counted, which is
        # what bounds retries.
        HardLogoutEvent.objects.filter(id=event_id, status="RUNNING", attempt_count=attempt).update(
            lease_expires_at=timezone.now(), updated_at=timezone.now()
        )
        raise

    if completed:
        _finalize_attempt(event_id, attempt)
    return HardLogoutEvent.objects.get(id=event_id)


# ---------------------------------------------------------------------------
# Session expiry sweep (Round 15).
#
# Problem: nothing ever moved a session out of ACTIVE when its time ran out, so
# past-expiry sessions stayed "active" forever and the dashboard overcounted.
#
# Semantics follow doc03 §5: EXPIRED = "access period ended" (DISCONNECTED =
# "session was terminated", which is what a manual disconnect or a Wizyfi hard
# logout produces). Those are different facts and stay different statuses.
#
# Rules:
#  * Ending access is a NETWORK action, so the router is asked to disconnect
#    (idempotent: already gone counts as success) and a session is marked
#    EXPIRED only once the router confirms. Until then it stays ACTIVE, which
#    is the honest answer: we cannot confirm the user is off the network.
#  * No network I/O inside a transaction. The status change is one conditional
#    UPDATE, so a session that a hard logout / manual disconnect already ended
#    is never overwritten, and overlapping sweeps are harmless.
#  * An unreachable router is tried ONCE per sweep, not once per session.
#  * Grace: a session still unconfirmed this long past its expiry is marked
#    EXPIRED anyway and audited as `session.expired_unconfirmed`, so a dead
#    router can't leave ghost "active" sessions forever.
#  * Routine expiries are NOT audited one by one (every session on the platform
#    would write a row); only the anomalous forced case is.
#  * ended_at is set to expires_at: when access ended, not when we noticed.
# ---------------------------------------------------------------------------

SESSION_EXPIRY_GRACE_SECONDS_DEFAULT = 3600
SESSION_EXPIRY_BATCH_DEFAULT = 500


@dataclass
class ExpiryResult:
    examined: int = 0
    expired: int = 0       # confirmed by the router, or already ended by someone else
    unconfirmed: int = 0   # forced past the grace period without router confirmation
    pending: int = 0       # overdue, router didn't confirm, still inside the grace period


def expire_due_sessions(*, limit: int | None = None) -> ExpiryResult:
    now = timezone.now()
    limit = limit or getattr(settings, "SESSION_EXPIRY_BATCH_SIZE", SESSION_EXPIRY_BATCH_DEFAULT)
    grace = timedelta(seconds=getattr(settings, "SESSION_EXPIRY_GRACE_SECONDS", SESSION_EXPIRY_GRACE_SECONDS_DEFAULT))

    due = list(
        Session.objects.filter(
            status__in=LIVE_SESSION_STATUSES, expires_at__isnull=False, expires_at__lte=now
        )
        .select_related("router__connector", "place")
        .order_by("expires_at")[:limit]
    )

    result = ExpiryResult(examined=len(due))
    unreachable_routers: set = set()

    for session in due:
        confirmed = False
        failure_code = ""

        if session.router_id in unreachable_routers:
            failure_code = "NETWORK_UNAVAILABLE"  # already failed this sweep; don't hammer it
        else:
            try:
                outcome = connector_services.disconnect_session(session.router, str(session.id))
            except Exception as exc:  # an adapter bug must not stop the rest of the sweep
                logger.exception("session_expiry.adapter_exception", extra={"session_id": str(session.id)})
                outcome = CommandOutcome(success=False, error_code=_classify(exc))
            if outcome.success:
                confirmed = True
            else:
                failure_code = outcome.error_code or "NETWORK_UNAVAILABLE"
                if failure_code in ROUTER_LEVEL_CODES:
                    unreachable_routers.add(session.router_id)

        overdue = now - session.expires_at
        if not confirmed and overdue < grace:
            result.pending += 1
            continue

        changed = Session.objects.filter(id=session.id, status__in=LIVE_SESSION_STATUSES).update(
            status="EXPIRED", ended_at=session.expires_at, updated_at=now
        )
        if changed != 1:
            continue  # ended by a hard logout / manual disconnect meanwhile: leave that status alone

        if confirmed:
            result.expired += 1
        else:
            result.unconfirmed += 1
            record_event(
                organization_id=session.place.organization_id,
                action="session.expired_unconfirmed",
                resource_type="Session",
                resource_id=session.id,
                actor_type=ActorType.SYSTEM,
                metadata={
                    "router_id": str(session.router_id),
                    "overdue_seconds": int(overdue.total_seconds()),
                    "last_error_code": failure_code,
                },
            )

    return result
