# apps/common/health.py — GET /healthz/ for load balancers and "is the backend up?" checks.
# Public, no data: only whether the app and the database answer (doc13 availability signal).
from django.db import connection
from django.http import JsonResponse


def health(request):
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        return JsonResponse({"status": "ok", "database": "ok"})
    except Exception:  # noqa: BLE001 - never leak the driver error
        return JsonResponse({"status": "degraded", "database": "unavailable"}, status=503)
