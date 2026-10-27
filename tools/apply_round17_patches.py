#!/usr/bin/env python3
"""Apply the small Round 17 edits to files that already exist in your repo.

Usage (from the folder that contains backend/ and frontend/):
    python tools/apply_round17_patches.py [--dry-run]

Safe by design: each patch is an exact find/replace. It is skipped if already
applied, and it REFUSES (exit 1, nothing half-written for that file) if the
expected text is not found, so you resolve that one by hand from the notes.
"""
import sys
from pathlib import Path

ROOT = Path(".")
DRY = "--dry-run" in sys.argv

PATCHES = [
    # --- backend ---------------------------------------------------------
    ("backend/apps/access/models.py", "APPEND",
     "\n\n# Round 17: recurring resets live in their own module (same app, same migrations).\n"
     "from .recurring_models import RecurringReset, RecurringResetOccurrence  # noqa: E402,F401\n",
     "from .recurring_models import RecurringReset"),

    ("backend/apps/access/services.py",
     "from .codes import format_masked, generate_code, hash_code, last4_of\n",
     "from .codes import format_masked, generate_code, hash_code, last4_of\nfrom .reset_credit import credit_short_session\n",
     "from .reset_credit import credit_short_session"),

    ("backend/apps/access/services.py",
     '            Session.objects.filter(id=sid, status__in=LIVE_SESSION_STATUSES).update(\n'
     '                status="DISCONNECTED", ended_at=now, updated_at=now\n'
     '            )\n'
     '            continue\n',
     '            changed = Session.objects.filter(id=sid, status__in=LIVE_SESSION_STATUSES).update(\n'
     '                status="DISCONNECTED", ended_at=now, updated_at=now\n'
     '            )\n'
     '            if changed == 1:\n'
     '                # Round 17: late-login voucher credit (never raises, audited).\n'
     '                credit_short_session(sid, event.id)\n'
     '            continue\n',
     "credit_short_session(sid, event.id)"),

    ("backend/apps/access/services.py",
     "        if changed != 1:\n"
     "            continue  # ended by a hard logout / manual disconnect meanwhile: leave that status alone\n",
     "        if changed != 1:\n"
     "            continue  # ended by a hard logout / manual disconnect meanwhile: leave that status alone\n"
     "\n"
     "        if session.bound_reset_event_id:\n"
     "            credit_short_session(session.id, session.bound_reset_event_id)  # Round 17\n",
     "credit_short_session(session.id, session.bound_reset_event_id)"),

    ("backend/config/settings/base.py", "APPEND",
     "\n# Round 17: password policy per the Public Website / Authentication spec §6.\n"
     "AUTH_PASSWORD_VALIDATORS = [\n"
     '    {"NAME": "apps.accounts.validators.PasswordPolicyValidator", "OPTIONS": {"min_length": 12}},\n'
     "]\n\n"
     "# Round 17: a session planned to last less than this many minutes before a reset gets its\n"
     "# voucher back when that reset ends it. 0 disables the credit.\n"
     'RESET_MIN_ACCESS_MINUTES = env.int("RESET_MIN_ACCESS_MINUTES", default=60)\n',
     "PasswordPolicyValidator"),

    # --- frontend --------------------------------------------------------
    ("frontend/src/components/layout/AppLayout.tsx",
     'if (!membership) return <Navigate to="/" replace />;',
     'if (!membership) return <Navigate to="/start" replace />;',
     'to="/start"'),

    ("frontend/src/styles/theme-foundation.css",
     "  --ease-standard: cubic-bezier(.2,.8,.2,1);\n}",
     "  --ease-standard: cubic-bezier(.2,.8,.2,1);\n"
     "  /* Brand panel (sign-in / sign-up / home hero): navy in BOTH themes on purpose. */\n"
     "  --brand-navy: #0b1220;\n  --brand-cyan: #22d3ee;\n}",
     "--brand-navy"),

    ("frontend/src/features/wizyfi/pages/WizyfiOverviewPage.tsx",
     '            <Link to="/app/hard-logout/history" className={btnSecondary}>\n              History\n            </Link>\n',
     '            <Link to="/app/hard-logout/recurring" className={btnSecondary}>\n              Recurring\n            </Link>\n'
     '            <Link to="/app/hard-logout/history" className={btnSecondary}>\n              History\n            </Link>\n',
     "/app/hard-logout/recurring"),

    ("frontend/src/features/access/components/PlanEditorForm.tsx",
     "needs a new voucher or login to continue.\"",
     "needs a new voucher or login to continue. Customers who connect in the last hour before a reset get their voucher back, so they can use it again afterwards.\"",
     "get their voucher back"),
]

failed = 0
for entry in PATCHES:
    path, old, new, marker = (entry[0], entry[1], entry[2], entry[3])
    f = ROOT / path
    if not f.exists():
        print(f"MISSING  {path}"); failed += 1; continue
    text = f.read_text(encoding="utf-8")
    if marker in text:
        print(f"already  {path}  ({marker[:40]!r})"); continue
    if old == "APPEND":
        out = text.rstrip("\n") + new
    elif old in text:
        out = text.replace(old, new, 1)
    else:
        print(f"NOT FOUND {path}  -> apply by hand: {marker[:50]!r}"); failed += 1; continue
    if not DRY:
        f.write_text(out, encoding="utf-8")
    print(f"patched  {path}")
sys.exit(1 if failed else 0)
