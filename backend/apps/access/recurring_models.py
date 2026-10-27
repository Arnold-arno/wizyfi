# apps/access/recurring_models.py
#
# Round 17: recurring Wizyfi resets. A RecurringReset is a RULE ("every day at
# 00:00 in the place's timezone"). It never disconnects anyone itself: it only
# MATERIALIZES ordinary one-off HardLogoutEvents a little ahead of time, so the
# whole existing machinery (lease, fencing, audit, cancel, "until next reset"
# plans) works unchanged. Imported at the bottom of models.py so Django sees it.
#
# Independence (doc00 §4): this belongs to the Hard Logout subsystem. Plans,
# vouchers, sales and sessions have no foreign key to it.

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.places.models import Place

from .models import HardLogoutEvent


class RecurringReset(BaseModel):
    place = models.ForeignKey(Place, on_delete=models.PROTECT, related_name="recurring_resets")
    scope_type = models.CharField(max_length=10, choices=HardLogoutEvent.SCOPE_CHOICES)
    router_ids = models.JSONField(default=list, blank=True)
    time_of_day = models.TimeField()
    # 0 = Monday ... 6 = Sunday. Empty list = every day.
    weekdays = models.JSONField(default=list, blank=True)
    # Copied from the place when the rule is created, so a later change to the
    # place's timezone never silently moves an existing schedule.
    timezone = models.CharField(max_length=64)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "access_recurringreset"
        indexes = [models.Index(fields=["place", "is_active"], name="access_recur_place_active_idx")]

    def __str__(self):
        return f"RecurringReset {self.id} ({'active' if self.is_active else 'paused'})"


class RecurringResetOccurrence(BaseModel):
    """Which events a rule has already created. The unique constraint is the
    backstop that guarantees one event per (rule, instant) even if two
    materializers race. Cancelled occurrences stay here, so a cancelled
    occurrence is never silently recreated."""

    recurring_reset = models.ForeignKey(RecurringReset, on_delete=models.CASCADE, related_name="occurrences")
    scheduled_at = models.DateTimeField()
    event = models.OneToOneField(HardLogoutEvent, on_delete=models.PROTECT, related_name="recurrence_occurrence")

    class Meta:
        db_table = "access_recurringresetoccurrence"
        constraints = [
            models.UniqueConstraint(fields=["recurring_reset", "scheduled_at"], name="unique_occurrence_per_rule")
        ]
