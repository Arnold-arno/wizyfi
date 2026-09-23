# apps/common/idempotency.py
#
# doc09: "Idempotency required for commands that may be retried or
# repeated." Generic helper so every retriable command (voucher batch
# creation now, Hard Logout scheduling later) gets the same guarantee:
# same key + same payload -> same stored result, replayed, never
# recomputed; same key + different payload -> a clean conflict.

import hashlib
import json

from django.db import IntegrityError, transaction

from .exceptions import IdempotencyConflict
from .models import IdempotencyRecord


def _fingerprint(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def run_idempotent(scope: str, key: str, request_data: dict, compute_fn):
    """compute_fn() -> (status_code: int, response_body: dict), called
    only on the first use of this (scope, key) pair. Returns
    (status_code, response_body) either way."""

    fingerprint = _fingerprint(request_data)

    existing = IdempotencyRecord.objects.filter(scope=scope, key=key).first()
    if existing:
        if existing.request_fingerprint != fingerprint:
            raise IdempotencyConflict()
        return existing.response_status, existing.response_body

    with transaction.atomic():
        status_code, body = compute_fn()
        try:
            IdempotencyRecord.objects.create(
                scope=scope,
                key=key,
                request_fingerprint=fingerprint,
                response_status=status_code,
                response_body=body,
            )
        except IntegrityError:
            # Lost a race to a concurrent identical request — don't
            # double-execute; return the winner's stored result instead.
            existing = IdempotencyRecord.objects.get(scope=scope, key=key)
            if existing.request_fingerprint != fingerprint:
                raise IdempotencyConflict()
            return existing.response_status, existing.response_body

    return status_code, body
