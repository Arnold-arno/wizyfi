# apps/access/management/commands/run_maintenance.py
#
#   python manage.py run_maintenance            # run every periodic job once
#   python manage.py run_maintenance --every 30 # ...and again every 30 s (Ctrl+C to stop)
#
# The periodic jobs normally run under Celery beat (see config/celery.py). In local
# development without Redis/Celery nothing runs them, so dashboard numbers (routers
# online, active sessions), expired vouchers and scheduled hard logouts never update.
# This runs the same logic directly. It calls the services, not the Celery tasks.
import time

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.access.models import HardLogoutEvent
from apps.access.recurring import materialize_all_recurring_resets
from apps.access.services import execute_hard_logout_event, expire_due_sessions
from apps.access.voucher_maintenance import expire_due_vouchers
from apps.connectors.health import sweep_router_health


class Command(BaseCommand):
    help = "Run the periodic jobs once, or repeatedly with --every N seconds (development without Celery)."

    def add_arguments(self, parser):
        parser.add_argument("--every", type=int, default=0, help="Repeat every N seconds. 0 = run once.")

    def handle(self, *args, **opts):
        every = opts["every"]
        try:
            while True:
                self._once()
                if every <= 0:
                    return
                time.sleep(every)
        except KeyboardInterrupt:
            self.stdout.write("Stopped.")

    def _once(self):
        now = timezone.now()
        due = list(
            HardLogoutEvent.objects.filter(
                Q(status="SCHEDULED", scheduled_at__lte=now)
                | Q(status="RUNNING", lease_expires_at__lte=now)
                | Q(status="RUNNING", lease_expires_at__isnull=True)
            ).values_list("id", flat=True)
        )
        for event_id in due:
            try:
                execute_hard_logout_event(event_id)
            except Exception as exc:  # noqa: BLE001 - keep the loop alive; the lease makes it resumable
                self.stderr.write(f"hard logout {event_id} failed: {exc}")
        sessions = expire_due_sessions()
        vouchers = expire_due_vouchers()
        health = sweep_router_health()
        recurring = materialize_all_recurring_resets()
        self.stdout.write(
            f"{timezone.now():%H:%M:%S} hard_logouts={len(due)} sessions_expired={sessions.expired} "
            f"vouchers_expired={vouchers} routers_checked={health['checked']} "
            f"(online {health['online']}, offline {health['offline']}) recurring_created={recurring}"
        )
