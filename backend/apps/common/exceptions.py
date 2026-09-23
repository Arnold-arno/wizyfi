# apps/common/exceptions.py
#
# Stable machine-readable error contract per doc09:
#   VALIDATION_ERROR, NOT_AUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT,
#   IDEMPOTENCY_CONFLICT, NETWORK_UNAVAILABLE, EXECUTION_PARTIAL, INTERNAL_ERROR
# Never expose secrets or internal stack traces in the response body.

import logging

from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ConflictError(APIException):
    """Use when a request is well-formed but conflicts with existing
    state — e.g. a unique constraint violation surfaced from the DB
    layer rather than serializer-level validation. Maps to doc09's
    CONFLICT error code."""

    status_code = 409
    default_detail = "This conflicts with existing data."
    default_code = "conflict"


class IdempotencyConflict(APIException):
    """Raised when a repeated request reuses an idempotency key with a
    different payload than the one originally committed — doc09's
    IDEMPOTENCY_CONFLICT error code."""

    status_code = 409
    default_detail = "This idempotency key was already used with a different request."
    default_code = "idempotency_conflict"


# Ordered isinstance checks, not an exact-type dict — simplejwt's
# InvalidToken/AuthenticationFailed subclasses would otherwise fall through
# to INTERNAL_ERROR because `type(exc)` never equals the base class.
_ORDERED_CODES = [
    (NotAuthenticated, "NOT_AUTHENTICATED"),
    (AuthenticationFailed, "NOT_AUTHENTICATED"),
    (PermissionDenied, "FORBIDDEN"),
    (NotFound, "NOT_FOUND"),
    (IdempotencyConflict, "IDEMPOTENCY_CONFLICT"),
    (ConflictError, "CONFLICT"),
    (ValidationError, "VALIDATION_ERROR"),
]


class NetworkUnavailable(Exception):
    """Raised by router adapters when a target cannot be reached."""


def _resolve_code(exc):
    for cls, code in _ORDERED_CODES:
        if isinstance(exc, cls):
            return code
    return "INTERNAL_ERROR"


def _extract_message(exc):
    """Never surface a raw dict/ErrorDetail repr to the client — always a
    clean, human-readable string."""
    detail = getattr(exc, "detail", None)
    if isinstance(exc, ValidationError) and isinstance(detail, dict):
        return "One or more fields are invalid."
    if isinstance(detail, dict):
        # e.g. simplejwt's {"detail": ..., "code": ...} shape
        return str(detail.get("detail", "Request failed."))
    if isinstance(detail, list) and detail:
        return str(detail[0])
    if detail is not None:
        return str(detail)
    return str(exc)


def wizyfi_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        code = _resolve_code(exc)
        message = _extract_message(exc)
        field_errors = None

        if isinstance(exc, ValidationError) and isinstance(exc.detail, dict):
            field_errors = {
                field: [str(e) for e in errors] for field, errors in exc.detail.items()
            }

        response.data = {
            "code": code,
            "message": message,
            "fieldErrors": field_errors,
            "requestId": getattr(context["request"], "request_id", None),
        }
        return response

    # Unhandled exception: never leak internals to the client.
    logger.exception("Unhandled exception", extra={"path": context["request"].path})
    from rest_framework.response import Response

    return Response(
        {
            "code": "INTERNAL_ERROR",
            "message": "Something went wrong on our side.",
            "fieldErrors": None,
            "requestId": getattr(context["request"], "request_id", None),
        },
        status=500,
    )
