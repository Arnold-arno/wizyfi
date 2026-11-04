#!/usr/bin/env python3
"""Find out why the Django backend does not boot. Run from the folder that contains manage.py:

    python ../tools/diagnose_backend.py            (or: python tools/diagnose_backend.py backend)

Static checks first (they work even when Django cannot start), then a real django.setup(),
an import of every module under apps/, `manage.py check` and `makemigrations --check`.
Exit code 1 if anything is wrong. Read-only: it changes nothing.
"""
import importlib
import os
import re
import sys
import traceback
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
if not (root / "manage.py").exists():
    sys.exit(f"manage.py not found in {root}. Run this from backend/ or pass its path.")
problems = []


def bad(msg):
    problems.append(msg)
    print("  ✗", msg)


def good(msg):
    print("  ✓", msg)


# Django -> highest Python it officially supports.
MAX_PY = {(4, 2): (3, 12), (5, 0): (3, 12), (5, 1): (3, 13), (5, 2): (3, 14)}

print(f"\n[1] Python and packages   (Python {sys.version.split()[0]})")
for mod, pip in [("django", "Django"), ("rest_framework", "djangorestframework"),
                 ("rest_framework_simplejwt", "djangorestframework-simplejwt"), ("corsheaders", "django-cors-headers"),
                 ("django_filters", "django-filter"), ("environ", "django-environ"), ("django_redis", "django-redis"),
                 ("celery", "celery"), ("cryptography", "cryptography"), ("djangorestframework_camel_case", "djangorestframework-camel-case"),
                 ("whitenoise", "whitenoise")]:
    try:
        importlib.import_module(mod)
        good(mod)
    except Exception as exc:  # noqa: BLE001
        bad(f"cannot import {mod} ({pip}): {exc}")
try:
    import psycopg  # noqa: F401
    good("psycopg 3 driver")
except Exception:  # noqa: BLE001
    try:
        import psycopg2  # noqa: F401
        good("psycopg2 driver (OK, but psycopg2-binary has no wheels for Python 3.13+; prefer psycopg[binary])")
    except Exception:  # noqa: BLE001
        bad("no PostgreSQL driver: pip install 'psycopg[binary]'")
try:
    import django
    limit = MAX_PY.get(django.VERSION[:2])
    if limit and sys.version_info[:2] > limit:
        bad(f"Django {django.get_version()} does not support Python {sys.version_info[0]}.{sys.version_info[1]} (max {limit[0]}.{limit[1]}). Use requirements.txt (Django 5.2).")
    else:
        good(f"Django {django.get_version()} supports this Python")
except Exception:  # noqa: BLE001
    pass

print("\n[2] Environment")
env_file = {}
if (root / ".env").exists():
    for line in (root / ".env").read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env_file[k.strip()] = v.strip()
else:
    bad("backend/.env is missing (copy .env.example)")
for key in ("DJANGO_SECRET_KEY", "DATABASE_URL", "CONNECTOR_CREDENTIALS_FERNET_KEY"):
    if os.environ.get(key) or env_file.get(key):
        good(key)
    else:
        bad(f"{key} is not set")

print("\n[3] Files and migrations")
apps_dir = root / "apps"
base_text = (root / "config/settings/base.py").read_text() if (root / "config/settings/base.py").exists() else ""
for app in sorted(p for p in apps_dir.iterdir() if p.is_dir() and (p / "apps.py").exists()):
    if f'"apps.{app.name}"' not in base_text:
        bad(f"apps/{app.name} exists but is not in INSTALLED_APPS (config/settings/base.py)")
for p in root.rglob("*.py"):
    if "venv" in p.parts or ".venv" in p.parts:
        continue
    if re.match(r"\d{4}_\w+\.py$", p.name) and p.parent.name != "migrations":
        bad(f"migration outside a migrations/ folder (Django never runs it): {p.relative_to(root)}")
    if re.search(r" \(\d+\)\.py$", p.name) or p.name == "_init_.py":
        bad(f"stray/misnamed file: {p.relative_to(root)}")
for stray in ("reqiurements",):
    if (root / stray).exists():
        bad(f"stray file {stray} (typo of requirements.txt)")
if (root.parent / "requirements.txt").exists():
    bad("a second requirements.txt at the repo root can drift from backend/requirements.txt; keep one")

print("\n[4] Django start-up")
sys.path.insert(0, str(root))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
try:
    import django
    django.setup()
    good(f"django.setup() with {os.environ['DJANGO_SETTINGS_MODULE']}")
except Exception:  # noqa: BLE001
    bad("django.setup() failed:\n" + "".join("      " + l for l in traceback.format_exc(limit=-4).splitlines(True)))
else:
    failed = 0
    for p in sorted(apps_dir.rglob("*.py")):
        rel = p.relative_to(root).with_suffix("")
        if "migrations" in rel.parts or p.name in ("__init__.py", "_init_.py") or "tests" in rel.parts or p.name.startswith("test"):
            continue
        try:
            importlib.import_module(".".join(rel.parts))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            bad(f"cannot import {'.'.join(rel.parts)}: {type(exc).__name__}: {exc}")
    if not failed:
        good("every module under apps/ imports")
    from django.core.management import call_command
    for label, args in (("manage.py check", ("check",)), ("makemigrations --check (model/migration drift)", ("makemigrations", "--check", "--dry-run"))):
        try:
            call_command(*args, verbosity=0)
            good(label)
        except SystemExit:
            bad(f"{label}: models and migrations are out of sync. Run makemigrations and commit the files.")
        except Exception as exc:  # noqa: BLE001
            bad(f"{label}: {type(exc).__name__}: {exc}")

print(f"\n{'OK: nothing found.' if not problems else str(len(problems)) + ' problem(s) found. Fix from the top; later ones often follow from earlier ones.'}")
sys.exit(1 if problems else 0)
