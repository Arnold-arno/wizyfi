# apps/common/middleware.py
import uuid


class RequestIdMiddleware:
    """Attach a request/correlation ID to every request and response
    (doc09: 'Request ID + correlation ID propagated across async work').
    """

    HEADER = "X-Request-Id"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = request.headers.get(self.HEADER) or str(uuid.uuid4())
        response = self.get_response(request)
        response[self.HEADER] = request.request_id
        return response
