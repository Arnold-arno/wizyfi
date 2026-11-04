#!/usr/bin/env python3
"""Apply the Round 22 edits to files that already exist in your repo.

Run from the folder that contains backend/ and frontend/ (AFTER applying Round 21):
    python tools/apply_round22_patches.py [--dry-run]

Each patch is an exact find/replace. It is skipped when already applied and REFUSES
(exit 1) when the expected text is not found, so you can apply that one by hand.
"""
import sys
from pathlib import Path

DRY = "--dry-run" in sys.argv
P = []


def rep(path, old, new, marker):
    P.append((path, old, new, marker))


# ---------------- backend ----------------
E = "backend/apps/common/exceptions.py"
rep(E, "class IdempotencyConflict(APIException):",
    '''class NetworkUnavailableError(APIException):
    """The router could not be told to grant access (portal connect). 503, not a client error:
    nothing the caller sent was wrong, and their voucher was NOT used up."""

    status_code = 503
    default_detail = "The network could not grant access just now. Your voucher was not used. Please try again."
    default_code = "network_unavailable"


class IdempotencyConflict(APIException):''', "class NetworkUnavailableError")
rep(E, '    (IdempotencyConflict, "IDEMPOTENCY_CONFLICT"),',
    '    (IdempotencyConflict, "IDEMPOTENCY_CONFLICT"),\n    (NetworkUnavailableError, "NETWORK_UNAVAILABLE"),', '(NetworkUnavailableError, "NETWORK_UNAVAILABLE")')

U = "backend/config/urls.py"
rep(U, "from django.urls import include, path\n", "from django.urls import include, path\n\nfrom apps.common.health import health\n", "from apps.common.health import health")
rep(U, "urlpatterns = [\n", 'urlpatterns = [\n    path("healthz/", health, name="healthz"),  # Round 22: liveness + database check\n', 'path("healthz/"')

S = "backend/apps/access/services.py"
rep(S, "access_plan: AccessPlan = None, device=None) -> Session:",
    'access_plan: AccessPlan = None, device=None, status: str = "ACTIVE") -> Session:', 'device=None, status: str = "ACTIVE")')
rep(S, '        bound_reset_event_id=bound_reset_event_id,\n        status="ACTIVE",\n    )',
    '        bound_reset_event_id=bound_reset_event_id,\n        status=status,\n    )', "        status=status,\n    )")
rep(S, '        raise ValueError("Access plan not found in this organization.")\n',
    '''        raise ValueError("Access plan not found in this organization.")

    # Round 22 limits
    if plan.status != "ACTIVE":
        raise ValueError("Vouchers can only be generated for an active plan.")
    if expires_at is not None and expires_at <= timezone.now():
        raise ValueError("The expiry must be in the future.")
    cap = getattr(settings, "VOUCHER_MAX_AVAILABLE_PER_ORG", 50000)
    unused = Voucher.objects.filter(plan__organization_id=organization_id, status="AVAILABLE").count()
    if unused + quantity > cap:
        raise ValueError(f"This would exceed the limit of {cap:,} unused vouchers ({unused:,} already unused).")
''', "# Round 22 limits")

PV = "backend/apps/portal/views.py"
rep(PV, "from apps.access.services import next_reset_for, redeem_voucher, start_session",
    "from apps.access.connect import connect_with_voucher\nfrom apps.access.services import next_reset_for", "import connect_with_voucher")
rep(PV, '''        voucher = redeem_voucher(
            organization_id=place.organization_id, code=v["code"], mac_address=v["mac_address"]
        )
        session = start_session(
            customer=voucher.redeemed_by_customer,
            router=router,
            place=place,
            voucher=voucher,
            access_plan=voucher.plan,
        )

        data = {
            "session_id": session.id,
            "status": session.status,
            "expires_at": session.expires_at,
            "plan_name": voucher.plan.name,
        }''', '''        # Round 22: validate + consume the voucher, ask the router to let the device on,
        # and only then answer 201. If the router refuses, the voucher is given back (503).
        session = connect_with_voucher(
            place=place, router=router, code=v["code"], mac_address=v["mac_address"]
        )

        data = {
            "session_id": session.id,
            "status": session.status,
            "expires_at": session.expires_at,
            "plan_name": session.access_plan.name if session.access_plan else None,
        }''', "connect_with_voucher(")

V = "backend/apps/access/views.py"
rep(V, '        "create_batch": "vouchers:issue",\n    }\n    filterset_fields = ["status", "plan"]',
    '        "create_batch": "vouchers:issue",\n        "summary": "vouchers:view",\n    }\n    filterset_fields = ["status", "plan", "batch_id"]', '"summary": "vouchers:view"')
rep(V, "        return Response(body, status=status_code)\n\n\nclass NetworkCycleViewSet(",
    '''        return Response(body, status=status_code)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Counts per status for the Vouchers page. Honors ?plan= / ?batch_id= / ?status= / ?search=;
        every status is always present so the UI never has to guess a missing one."""
        from django.db.models import Count

        rows = self.filter_queryset(self.get_queryset()).order_by().values("status").annotate(n=Count("id"))
        found = {r["status"]: r["n"] for r in rows}
        counts = [{"status": code, "count": found.get(code, 0)} for code, _label in Voucher.STATUS_CHOICES]
        return Response({"total": sum(c["count"] for c in counts), "counts": counts})


class NetworkCycleViewSet(''', "def summary(self, request):\n        \"\"\"Counts per status")
rep("backend/apps/access/serializers.py", '            "id", "plan", "plan_name", "masked_code", "status",',
    '            "id", "plan", "plan_name", "batch_id", "masked_code", "status",', '"plan_name", "batch_id"')

rep("backend/apps/access/tasks.py", "from . import recurring_tasks  # noqa: F401  (registers wizyfi.materialize_recurring_resets)",
    "from . import maintenance_tasks, recurring_tasks  # noqa: F401  (register wizyfi.expire_vouchers / materialize_recurring_resets)", "maintenance_tasks, recurring_tasks")
rep("backend/config/celery.py", '    "materialize-recurring-resets": {',
    '''    # Round 22: keeps router status / "last seen" fresh (dashboard "Routers online").
    "check-router-health": {
        "task": "wizyfi.check_router_health",
        "schedule": 120.0,
    },
    # Round 22: moves vouchers past their expiry to EXPIRED.
    "expire-vouchers": {
        "task": "wizyfi.expire_vouchers",
        "schedule": 300.0,
    },
    "materialize-recurring-resets": {''', '"check-router-health"')

# ---------------- frontend ----------------
rep("frontend/src/features/public/WizyfiProductPage.tsx",
    '''          <p className="text-sm font-medium text-[var(--primary)]">A Wizyfi Bridge product</p>
          <h1 className="mt-2 text-4xl font-bold">Wizyfi</h1>''',
    '''          <p className="text-sm font-medium text-[var(--primary)]">A Wizyfi Bridge product</p>
          <img
            src="/brand/wizyfi-logo.webp"
            width={900}
            height={610}
            alt="Wizyfi logo: Every connection, every network, in your control"
            className="mx-auto mt-4 h-auto w-full max-w-md rounded-2xl"
          />
          <h1 className="sr-only">Wizyfi</h1>''', "/brand/wizyfi-logo.webp")

H = "frontend/src/features/public/HomePage.tsx"
rep(H, "          width={1536}\n          height={1024}", "          width={1536}\n          height={872}", "height={872}")
rep(H, "      {/* Wizyfi spotlight */}",
    '''      {/* Product views */}
      <section aria-labelledby="views-h" className="mx-auto max-w-6xl px-4 pt-16">
        <h2 id="views-h" className="text-2xl font-bold sm:text-3xl">Manage from any screen. Welcome guests on theirs.</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <figure className="lg:col-span-2">
            <img
              src="/images/dashboard-devices.webp"
              width={1536}
              height={1024}
              loading="lazy"
              alt="Mockup of the Wizyfi Bridge dashboard on a laptop, tablet and phone next to a router"
              className="h-auto w-full rounded-2xl border border-[var(--border)]"
            />
            <figcaption className="mt-2 text-xs text-[var(--foreground-muted)]">Illustrative mockup with sample figures. The product screens may differ.</figcaption>
          </figure>
          <figure>
            <img
              src="/images/captive-portal-example.webp"
              width={490}
              height={439}
              loading="lazy"
              alt="Example of a branded captive sign-in page for a café, on a phone and a laptop"
              className="h-auto w-full rounded-2xl border border-[var(--border)]"
            />
            <figcaption className="mt-2 text-xs text-[var(--foreground-muted)]">Example sign-in page for guests. The café is fictional.</figcaption>
          </figure>
        </div>
      </section>

      {/* Wizyfi spotlight */}''', "{/* Product views */}")

PT = "frontend/src/features/access/components/PlanTable.tsx"
rep(PT, 'maxConcurrentDevices ? `${maxConcurrentDevices} device(s)` : "Unlimited devices"',
    'maxConcurrentDevices && maxConcurrentDevices > 1 ? `${maxConcurrentDevices} devices` : "1 device"', '"1 device"')
PE = "frontend/src/features/access/components/PlanEditorForm.tsx"
rep(PE, '<Field label="Data cap (MB, blank = unlimited)">',
    '<Field label="Data cap (MB, blank = unlimited)" hint="Sent to the router when access is granted. Enforcement depends on the router integration.">', "Sent to the router when access")
rep(PE, '<Field label="Max concurrent devices (blank = unlimited)">',
    '<Field label="Devices per voucher (blank or 1 = one device)" hint="With 2 or more, one voucher can be used on that many devices at the same time. They all end together.">', "Devices per voucher")
rep("frontend/src/features/access/components/PlanStatusActions.tsx",
    'description="Customers stop seeing it on the captive portal. Vouchers already generated for it can still be redeemed, and sales history is kept. You can restore it later."',
    'description="Customers stop seeing it on the captive portal and its vouchers can no longer be redeemed while it is archived. People already connected keep their access, and sales history is kept. Restoring it turns redemption back on."',
    "can no longer be redeemed while it is archived")

VP = "frontend/src/features/vouchers/pages/VouchersPage.tsx"
rep(VP, 'import { useVouchers } from "../hooks/useVouchers";',
    '''import { useVouchers, useVoucherSummary } from "../hooks/useVouchers";
import { usePlans } from "../../access/hooks/usePlans";
import { StatCard } from "../../../components/ui/StatCard";
import { inputClass } from "../../../components/ui/styles";
import { formatNumber } from "../../../lib/format";''', "useVoucherSummary")
rep(VP, "  const [wizardOpen, setWizardOpen] = useState(false);",
    '''  const [wizardOpen, setWizardOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const plansList = usePlans({ pageSize: 100 });
  const summary = useVoucherSummary(planId || undefined);''', "const summary = useVoucherSummary")
rep(VP, '    status: status === "ALL" ? undefined : status,\n  });',
    '    status: status === "ALL" ? undefined : status,\n    planId: planId || undefined,\n  });', "planId: planId || undefined")
rep(VP, '''      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}''',
'''      <section aria-label="Voucher totals" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["AVAILABLE", "REDEEMED", "EXPIRED", "REVOKED"] as const).map((s) => (
          <StatCard
            key={s}
            label={s.charAt(0) + s.slice(1).toLowerCase()}
            value={summary.data ? formatNumber(summary.data.counts.find((c) => c.status === s)?.count ?? 0) : "—"}
            hint={planId ? "Selected plan" : "All plans"}
          />
        ))}
      </section>

      <select
        aria-label="Filter by plan"
        value={planId}
        onChange={(e) => {
          setPage(1);
          setPlanId(e.target.value);
        }}
        className={`${inputClass} sm:max-w-xs`}
      >
        <option value="">All plans</option>
        {plansList.data?.results.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}''', "aria-label=\"Voucher totals\"")

W = "frontend/src/features/vouchers/components/BulkVoucherWizard.tsx"
rep(W, 'import type { VoucherBatchRules } from "../../../types/voucher";',
    'import type { VoucherBatchRules } from "../../../types/voucher";\nimport { ApiError } from "../../../lib/api/client";', "import { ApiError }")
rep(W, "expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,",
    'expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined, // end of the chosen day, local time',
    "T23:59:59")
rep(W, '''              <p className="text-sm text-[var(--danger)]">
                Generation failed. No vouchers were created — you can retry safely.
              </p>''',
    '''              <p role="alert" className="text-sm text-[var(--danger)]">
                {createBatch.error instanceof ApiError
                  ? (createBatch.error.fieldErrors?.detail?.[0] ?? createBatch.error.message)
                  : "Generation failed."}{" "}
                No vouchers were created.
              </p>''', "No vouchers were created.\n")
rep(W, '  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">',
    '''  const planName = plansPage?.results.find((p) => p.id === rules.planId)?.name ?? "";
  const copyCodes = () => void navigator.clipboard?.writeText(createBatch.data?.codes.join("\\n") ?? "");
  const downloadCsv = () => {
    // Neutralise spreadsheet formulas in the plan name; codes themselves are A-Z/2-9/hyphen only.
    const safe = /^[=+\\-@]/.test(planName) ? `'${planName}` : planName;
    const rows = ["code,plan,expires", ...(createBatch.data?.codes ?? []).map((c) => `${c},"${safe.replace(/"/g, '""')}",${rules.expiresAt ?? ""}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vouchers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">''', "const copyCodes")
rep(W, '''              className={`${inputClass} font-mono text-xs`}
            />
          </div>''', '''              className={`${inputClass} font-mono text-xs`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={copyCodes} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-elevated)]">
                Copy codes
              </button>
              <button type="button" onClick={downloadCsv} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-elevated)]">
                Download CSV
              </button>
            </div>
          </div>''', "Download CSV")

failed = 0
for path, old, new, marker in P:
    f = Path(path)
    if not f.exists():
        print(f"MISSING   {path}"); failed += 1; continue
    text = f.read_text(encoding="utf-8")
    if marker in text:
        print(f"already   {path}  ({marker[:36]!r})"); continue
    if old not in text:
        print(f"NOT FOUND {path}  -> apply by hand: {marker[:50]!r}"); failed += 1; continue
    if not DRY:
        f.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"patched   {path}")
sys.exit(1 if failed else 0)
