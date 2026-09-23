# apps/access/services.py
#
# doc10 Service-Layer Rule: views translate HTTP into validated inputs;
# services perform business rules and transactions. This module owns the
# voucher lifecycle logic — batch generation, redemption, revocation.

from django.db import transaction
from django.utils import timezone

from apps.audit.models import ActorType
from apps.audit.services import record_event
from apps.common.exceptions import ConflictError
from apps.common.idempotency import run_idempotent
from apps.connectors import services as connector_services
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

MAX_BATCH_SIZE = 5000


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
# Hard Logout — independent subsystem (doc03/doc08/doc10/doc11).
# Implementation follows doc10's stage table exactly:
#   Schedule -> Dispatch -> Start -> Resolve -> Execute -> Record -> Finalize -> Recovery -> Audit
# "Dispatch" (a durable background task keyed by event_id) is Celery's
# job — not wired in this delivery (no broker running in this container;
# see delivery notes). execute_hard_logout_event() below is the function
# a Celery task will call; it is written to be safely callable directly,
# safely retried, and safely called twice, which is what actually matters
# for correctness independent of how it gets invoked.
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


def _resolve_target_routers(event: HardLogoutEvent) -> list[Router]:
    if event.scope_type == "PLACE":
        # Resolved fresh at execution time, never cached — doc06:
        # "Realtime transport is an optimization, not a replacement for
        # persisted truth." Explicitly excludes DISABLED routers: a
        # disabled router isn't a legitimate execution target.
        return list(Router.objects.filter(place=event.place).exclude(status="DISABLED"))
    return list(Router.objects.filter(id__in=event.router_ids, place=event.place))


@transaction.atomic
def execute_hard_logout_event(event_id) -> HardLogoutEvent:
    """The lock -> disconnect -> verify -> record sequence
    (Expectations_and_workflow). Safe to call more than once for the
    same event_id — doc10 Recovery rule: 'Retries must inspect persisted
    event/target status and never repeat already committed successful
    work' (HL-06, HL-09)."""

    # --- LOCK: atomically claim the event; reject duplicate workers ---
    event = HardLogoutEvent.objects.select_for_update().get(id=event_id)

    if event.status in ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED"):
        # Already terminal — a retry/duplicate dispatch is a no-op, not
        # an error (idempotent execution, doc03 §10).
        return event

    if event.status == "SCHEDULED":
        event.status = "RUNNING"
        event.started_at = timezone.now()
        event.save(update_fields=["status", "started_at", "updated_at"])
    # else: status == "RUNNING" already — a worker restart resuming a
    # partially-completed run (HL-06). Fall through to re-resolve targets
    # and skip any that already have a terminal HardLogoutTargetResult.

    # --- RESOLVE: permission-filtered targets from persisted scope ---
    routers = _resolve_target_routers(event)

    for router in routers:
        target, created = HardLogoutTargetResult.objects.get_or_create(
            event=event, router=router,
            defaults={"status": "ATTEMPTED", "attempted_at": timezone.now()},
        )
        if not created and target.status in ("SUCCEEDED", "FAILED"):
            # Already recorded from a prior attempt — never repeat
            # committed work (HL-09).
            continue

        # --- DISCONNECT: issue the adapter command per active session ---
        active_sessions = Session.objects.select_for_update().filter(router=router, status="ACTIVE")
        router_had_failure = False

        for session in active_sessions:
            outcome = connector_services.disconnect_session(router, str(session.id))
            # --- VERIFY: trust only the adapter's explicit outcome —
            # never assume success, never fabricate progress (doc03 §10
            # 'No fake progress').
            if outcome.success:
                session.status = "DISCONNECTED"
                session.ended_at = timezone.now()
                session.save(update_fields=["status", "ended_at", "updated_at"])
            else:
                router_had_failure = True

        # --- RECORD: persist this target's terminal outcome ---
        target.status = "FAILED" if router_had_failure else "SUCCEEDED"
        target.completed_at = timezone.now()
        if router_had_failure:
            target.error_code = "NETWORK_UNAVAILABLE"
            target.error_message = "One or more sessions on this router failed to disconnect."
        target.save(update_fields=["status", "completed_at", "error_code", "error_message", "updated_at"])

    # --- FINALIZE: aggregate outcome across all targets ---
    results = list(event.target_results.all())
    succeeded = sum(1 for r in results if r.status == "SUCCEEDED")
    failed = sum(1 for r in results if r.status == "FAILED")

    event.succeeded_count = succeeded
    event.failed_count = failed
    if failed == 0:
        event.status = "COMPLETED"
    elif succeeded == 0:
        event.status = "FAILED"
    else:
        event.status = "PARTIAL"
    event.completed_at = timezone.now()
    event.save(update_fields=["status", "succeeded_count", "failed_count", "completed_at", "updated_at"])

    record_event(
        organization_id=event.place.organization_id,
        action=f"hard_logout.{event.status.lower()}",
        resource_type="HardLogoutEvent",
        resource_id=event.id,
        actor_type=ActorType.SYSTEM,
        metadata={"succeeded_count": succeeded, "failed_count": failed},
    )

    level_by_status = {
        "COMPLETED": NotificationLevel.SUCCESS,
        "PARTIAL": NotificationLevel.WARNING,
        "FAILED": NotificationLevel.ERROR,
    }
    notify(
        organization_id=event.place.organization_id,
        level=level_by_status.get(event.status, NotificationLevel.INFO),
        title=f"Hard logout {event.status.lower()} at {event.place.name}",
        message=f"{succeeded} succeeded, {failed} failed.",
        resource_type="HardLogoutEvent",
        resource_id=event.id,
    )

    return event
