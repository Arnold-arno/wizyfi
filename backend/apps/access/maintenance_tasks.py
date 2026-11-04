# apps/access/maintenance_tasks.py — imported from tasks.py so Celery registers it.
from celery import shared_task

from .voucher_maintenance import expire_due_vouchers


@shared_task(name="wizyfi.expire_vouchers")
def expire_vouchers_task() -> int:
    return expire_due_vouchers()
