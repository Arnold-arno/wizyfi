# apps/access/voucher_maintenance.py
#
# Vouchers carry an expiry, but nothing moved them to EXPIRED unless someone tried
# to redeem them, so lists and counts showed expired codes as "Available".
# One conditional UPDATE; REDEEMED vouchers are untouched (their expiry is the
# deadline to redeem, not the length of the session).
from django.utils import timezone

from .models import Voucher


def expire_due_vouchers() -> int:
    now = timezone.now()
    return Voucher.objects.filter(
        status__in=("AVAILABLE", "ISSUED"), expires_at__isnull=False, expires_at__lte=now
    ).update(status="EXPIRED", updated_at=now)
