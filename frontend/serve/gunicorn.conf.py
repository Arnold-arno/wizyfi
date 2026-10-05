# Run from frontend/:   npm run serve        (production-style)
#                       npm run serve:dev    (auto-reload; Linux/macOS shell)
import os
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"

bind = os.environ.get("FRONTEND_BIND", "0.0.0.0:8080")
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info").lower()
# Behind Cloudflare/nginx: trust X-Forwarded-* only from your proxy's address.
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1")

# Reload: restarts workers when the Python serving code changes AND whenever a
# new `vite build` rewrites dist/index.html (its hashed asset names change on
# every build). Development only — never enable in production.
reload = os.environ.get("GUNICORN_RELOAD") == "1"
if reload:
    reload_extra_files = [str(DIST / "index.html")]
    workers = 1
