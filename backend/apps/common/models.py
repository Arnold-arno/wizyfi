# apps/common/models.py
import uuid

from django.db import models


class UUIDModel(models.Model):
    """UUID primary key — used across all domain models so IDs are
    never sequential/guessable and are safe to expose in the API."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    """created_at/updated_at in UTC (doc08: 'Store timestamps in UTC')."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimeStampedModel):
    class Meta:
        abstract = True


class IdempotencyRecord(BaseModel):
    """Generic idempotency ledger for any retriable command (doc09:
    'Idempotency required for commands that may be retried or
    repeated'). Used first by Voucher batch creation; Hard Logout
    scheduling will reuse the same helper (apps.common.idempotency)."""

    scope = models.CharField(max_length=100, db_index=True)
    key = models.CharField(max_length=255)
    request_fingerprint = models.CharField(max_length=64)
    response_status = models.IntegerField()
    response_body = models.JSONField()

    class Meta:
        db_table = "common_idempotency_record"
        constraints = [
            models.UniqueConstraint(
                fields=["scope", "key"], name="unique_idempotency_key_per_scope"
            )
        ]
