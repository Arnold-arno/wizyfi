# apps/access/recurring.py
#
# Recurring Wizyfi resets (Round 17). The rule only CREATES ordinary one-off
# HardLogoutEvents ahead of time (a rolling look-ahead). Everything after that
# is the existing, hardened event lifecycle. Because the next occurrence always
# exists as a real SCHEDULED event, "until next reset" plans (start_session ->
# next_reset_for) bind to it with no changes at all.
#
# Time handling: the rule stores a wall-clock time in the place's IANA zone;
# each occurrence is converted to an exact UTC instant. Around a DST change a
# wall time that does not exist resolves to the following valid instant, and one
# that occurs twice uses the first occurrence (zoneinfo fold=0).
#
# No network I/O here and nothing is executed: materializing only inserts rows.

import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.models import ActorType
from apps.audit.services import record_event
from apps.common.exceptions import ConflictError
from apps.connectors.models import Router

from .models import HardLogoutEvent
from .recurring_models import RecurringReset, RecurringResetOccurrence
from .services import cancel_hard_logout_event, schedule_hard_logout_event

logger = logging.getLogger(__name__)

# How far ahead to look for the next occurrence. 8 days covers a weekly rule.
SEARCH_DAYS = 8


def _lookahead() -> int:
    """How many UPCOMING (still scheduled) occurrences to keep materialized."""
    return max(1, getattr(settings, "RECURRING_RESET_LOOKAHEAD", 2))


def occurrences_between(rule, start, end) -> list:
    """Exact UTC instants in (start, end] at which `rule` fires. Pure function."""
    tz = ZoneInfo(rule.timezone)
    day = start.astimezone(tz).date() - timedelta(days=1)  # pad: tz can shift the date
    last = end.astimezone(tz).date() + timedelta(days=1)
    allowed = set(rule.weekdays or [])
    found = []
    while day <= last:
        if not allowed or day.weekday() in allowed:
            when = datetime.combine(day, rule.time_of_day, tzinfo=tz).astimezone(dt_timezone.utc)
            if start < when <= end:
                found.append(when)
        day += timedelta(days=1)
    return sorted(found)


def materialize_rule(rule_id, now=None) -> int:
    """Make sure the next few occurrences exist as SCHEDULED events. Idempotent
    and safe to run concurrently (row lock + unique constraint). Returns the
    number of events created."""
    now = now or timezone.now()
    created = 0
    with transaction.atomic():
        rule = (
            RecurringReset.objects.select_for_update(of=("self",))
            .select_related("place__organization")
            .get(id=rule_id)
        )
        # A paused rule, an archived place or a suspended organization gets no new events.
        if not rule.is_active or rule.place.status == "ARCHIVED" or rule.place.organization.status != "ACTIVE":
            return 0

        live = 0
        for when in occurrences_between(rule, now, now + timedelta(days=SEARCH_DAYS)):
            if live >= _lookahead():
                break
            existing = (
                RecurringResetOccurrence.objects.select_related("event")
                .filter(recurring_reset=rule, scheduled_at=when)
                .first()
            )
            if existing:
                if existing.event.status == "SCHEDULED":
                    live += 1
                continue  # cancelled/finished occurrences are never recreated or counted
            event = schedule_hard_logout_event(
                place=rule.place,
                scope_type=rule.scope_type,
                router_ids=list(rule.router_ids),
                scheduled_at=when,
                scheduled_timezone=rule.timezone,
                created_by=rule.created_by,
            )
            RecurringResetOccurrence.objects.create(recurring_reset=rule, scheduled_at=when, event=event)
            created += 1
            live += 1
    return created


def materialize_all_recurring_resets(now=None) -> int:
    total = 0
    for rule_id in RecurringReset.objects.filter(is_active=True).values_list("id", flat=True):
        try:
            total += materialize_rule(rule_id, now)
        except Exception:  # one bad rule must never stop the others
            logger.exception("recurring_reset.materialize_failed", extra={"rule_id": str(rule_id)})
    return total


def create_recurring_reset(*, place, scope_type, router_ids, time_of_day, weekdays, created_by) -> RecurringReset:
    if scope_type not in ("ROUTER", "ROUTERS", "PLACE"):
        raise ValueError("Unknown scope.")
    if place.status == "ARCHIVED":
        raise ValueError("This place is archived.")

    router_ids = [str(r) for r in router_ids]
    if scope_type == "PLACE":
        router_ids = []
    else:
        if not router_ids:
            raise ValueError("Choose at least one router.")
        if scope_type == "ROUTER" and len(router_ids) != 1:
            raise ValueError("ROUTER scope must specify exactly one router.")
        known = Router.objects.filter(id__in=router_ids, place=place).count()
        if known != len(set(router_ids)):
            raise ValueError("One or more routers do not belong to this place.")

    days = sorted(set(int(d) for d in (weekdays or [])))
    if any(d < 0 or d > 6 for d in days):
        raise ValueError("Weekdays must be between 0 (Monday) and 6 (Sunday).")

    time_of_day = time_of_day.replace(second=0, microsecond=0)

    for other in RecurringReset.objects.filter(
        place=place, scope_type=scope_type, time_of_day=time_of_day, is_active=True
    ):
        if other.weekdays == days and sorted(other.router_ids) == sorted(router_ids):
            raise ConflictError("An identical recurring reset already exists for this place.")

    with transaction.atomic():
        rule = RecurringReset.objects.create(
            place=place, scope_type=scope_type, router_ids=router_ids, time_of_day=time_of_day,
            weekdays=days, timezone=place.timezone, created_by=created_by,
        )
        record_event(
            organization_id=place.organization_id,
            action="hard_logout.recurrence_created",
            resource_type="RecurringReset",
            resource_id=rule.id,
            actor=created_by,
            actor_type=ActorType.STAFF,
            metadata={
                "place_id": str(place.id), "scope_type": scope_type,
                "time_of_day": time_of_day.strftime("%H:%M"), "weekdays": days, "timezone": place.timezone,
            },
        )
    materialize_rule(rule.id)
    return rule


@transaction.atomic
def deactivate_recurring_reset(rule: RecurringReset, *, actor) -> RecurringReset:
    """Pause the rule and cancel its upcoming events. Cancelled LATEST first so
    that sessions bound to an earlier occurrence are never moved onto one that
    is about to be cancelled too (cancel_hard_logout_event moves them on)."""
    rule = RecurringReset.objects.select_for_update().get(id=rule.id)
    if not rule.is_active:
        raise ConflictError("This recurring reset is already paused.")
    rule.is_active = False
    rule.save(update_fields=["is_active", "updated_at"])

    upcoming = list(
        HardLogoutEvent.objects.filter(recurrence_occurrence__recurring_reset=rule, status="SCHEDULED")
        .order_by("-scheduled_at")
    )
    for event in upcoming:
        cancel_hard_logout_event(event, actor=actor, reason="Recurring reset paused.")

    record_event(
        organization_id=rule.place.organization_id,
        action="hard_logout.recurrence_paused",
        resource_type="RecurringReset",
        resource_id=rule.id,
        actor=actor,
        actor_type=ActorType.STAFF,
        metadata={"cancelled_events": len(upcoming)},
    )
    return rule


def activate_recurring_reset(rule: RecurringReset, *, actor) -> RecurringReset:
    with transaction.atomic():
        rule = RecurringReset.objects.select_for_update().get(id=rule.id)
        if rule.is_active:
            raise ConflictError("This recurring reset is already active.")
        rule.is_active = True
        rule.save(update_fields=["is_active", "updated_at"])
        record_event(
            organization_id=rule.place.organization_id,
            action="hard_logout.recurrence_resumed",
            resource_type="RecurringReset",
            resource_id=rule.id,
            actor=actor,
            actor_type=ActorType.STAFF,
            metadata={},
        )
    materialize_rule(rule.id)
    return rule
