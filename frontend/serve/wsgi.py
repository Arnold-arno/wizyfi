"""Serve the built Vite app (frontend/dist) under gunicorn.

gunicorn is a Python WSGI server: it can't run Node or Vite. It serves the
*output* of `npm run build`. WhiteNoise does the static-file work (ETags,
Last-Modified, gzip/brotli when pre-compressed, correct cache headers); the
small fallback below makes client-side routes (/app/dashboard …) return
index.html so React Router can take over on refresh or deep links.

Environment
  FRONTEND_DIST_DIR  override the dist directory (default: ../dist)
  FRONTEND_DEBUG=1   re-scan dist on every request, so a fresh `vite build`
                     is served without restarting (dev only)
"""

import os
from pathlib import Path

from whitenoise import WhiteNoise

DIST = Path(os.environ.get("FRONTEND_DIST_DIR", Path(__file__).resolve().parent.parent / "dist"))
DEBUG = os.environ.get("FRONTEND_DEBUG") == "1"
INDEX = DIST / "index.html"

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


def _add_headers(headers, path, url):
    for name, value in SECURITY_HEADERS.items():
        headers[name] = value


def _spa_fallback(environ, start_response):
    path = environ.get("PATH_INFO", "")
    last_segment = path.rsplit("/", 1)[-1]

    # A request for a real-looking file that WhiteNoise didn't find is a true
    # 404 (a stale hashed asset must never be answered with HTML).
    if path.startswith("/assets/") or "." in last_segment:
        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not found"]

    try:
        body = INDEX.read_bytes()
    except FileNotFoundError:
        start_response("503 Service Unavailable", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Frontend build not found. Run `npm run build` first."]

    headers = [
        ("Content-Type", "text/html; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-cache"),  # always revalidate so deploys show immediately
        *SECURITY_HEADERS.items(),
    ]
    start_response("200 OK", headers)
    return [body]


application = WhiteNoise(
    _spa_fallback,
    root=str(DIST),
    index_file=True,
    autorefresh=DEBUG,
    max_age=0,  # index.html and other non-hashed files: revalidate
    # Vite fingerprints everything under /assets/, so it is safe to cache forever.
    immutable_file_test=lambda path, url: url.startswith("/assets/"),
    add_headers_function=_add_headers,
    allow_all_origins=False,
)
