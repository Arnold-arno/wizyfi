#!/usr/bin/env python3
"""Apply the Round 21 edits to files that already exist in your repo.

Run from the folder that contains backend/ and frontend/:
    python tools/apply_round21_patches.py [--dry-run]

Each patch is an exact find/replace (or a marker-to-marker region replace). It is
skipped when already applied and REFUSES (exit 1) when the expected text is not
found, so you can apply that one by hand from DELIVERY_NOTES_R21.md.
"""
import sys
from pathlib import Path

DRY = "--dry-run" in sys.argv
P = []  # (path, kind, old_or_start, new, marker, end)


def rep(path, old, new, marker):
    P.append((path, "rep", old, new, marker, None))


def region(path, start, end, new, marker):
    P.append((path, "region", start, new, marker, end))


# ---- backend ------------------------------------------------------------------
V = "backend/apps/access/views.py"
rep(V, "from django.db import IntegrityError\nfrom django.utils import timezone",
    "from django.db import IntegrityError\nfrom django.db.models import ProtectedError\nfrom django.utils import timezone",
    "import ProtectedError")
rep(V, '            raise ValidationError({"detail": ["This plan\'s price or duration is invalid."]})',
    '            raise ValidationError({"detail": ["This plan\'s price or duration is invalid."]})\n'
    "\n    def perform_destroy(self, instance):\n"
    "        # Vouchers and sessions reference a plan with PROTECT; without this the API\n"
    "        # answered 500. Retiring a plan in use means archiving it.\n"
    "        try:\n            instance.delete()\n        except ProtectedError:\n"
    '            raise ConflictError("This plan has vouchers or sessions. Archive it instead of deleting it.")',
    "def perform_destroy(self, instance):\n        # Vouchers")

PV = "backend/apps/portal/views.py"
rep(PV, "import uuid\n\nfrom rest_framework.exceptions import NotFound, ValidationError",
    "import uuid\n\nfrom django.db.models import Q\nfrom django.utils import timezone\nfrom rest_framework.exceptions import NotFound, ValidationError",
    "from django.db.models import Q")
rep(PV, "        reset = next_reset_for(place, router)\n        plans = list(\n            AccessPlan.objects.filter(\n"
        "                organization_id=place.organization_id,\n                status=\"ACTIVE\",\n                is_publicly_listed=True,\n            ).order_by(\"price\")",
    "        reset = next_reset_for(place, router)\n        now = timezone.now()  # Round 21: respect each plan's availability window\n        plans = list(\n            AccessPlan.objects.filter(\n"
        "                Q(available_from__isnull=True) | Q(available_from__lte=now),\n"
        "                Q(available_until__isnull=True) | Q(available_until__gte=now),\n"
        "                organization_id=place.organization_id,\n                status=\"ACTIVE\",\n                is_publicly_listed=True,\n            ).order_by(\"price\")",
    "available_from__isnull")

# ---- frontend: brand ------------------------------------------------------------
H = "frontend/src/features/public/HomePage.tsx"
rep(H, 'import { PRODUCT, SLOGAN } from "../../lib/brand";', 'import { PRODUCT, WIZYFI_SLOGAN } from "../../lib/brand";', "PRODUCT, WIZYFI_SLOGAN")
rep(H, 'text-[var(--foreground-secondary)]">{SLOGAN}</p>', 'text-[var(--foreground-secondary)]">{WIZYFI_SLOGAN}</p>', "{WIZYFI_SLOGAN}</p>")
region(H, "          {/* Labelled schematic: deliberately no numbers or live-looking data. */}", "      {/* What it does */}",
'''          {/* Brand artwork cropped to the logo and cloud: no numbers, no vendor marks. Illustrative. */}
          <figure className="mx-auto w-full max-w-md lg:max-w-none">
            <img
              src="/images/hero-platform.webp"
              width={565}
              height={685}
              alt="Wizyfi Bridge logo above a cloud linked to a café, an office, a hotel, a home and a depot"
              className="mx-auto h-auto w-full max-w-[480px] rounded-2xl"
            />
            <figcaption className="mt-2 text-center text-xs text-slate-400">Illustration, not live data.</figcaption>
          </figure>
        </div>
      </section>

      {/* Where it works */}
      <section aria-labelledby="where-h" className="mx-auto max-w-6xl px-4 pt-16">
        <h2 id="where-h" className="text-2xl font-bold sm:text-3xl">Built for places where people connect</h2>
        <p className="mt-2 max-w-2xl text-[var(--foreground-secondary)]">
          Cafés and restaurants, hotels and lodges, offices, schools, residential complexes and any other venue that offers Wi-Fi to visitors.
        </p>
        <img
          src="/images/where-it-works.webp"
          width={1536}
          height={1024}
          loading="lazy"
          alt="Illustrated examples of venues that can run a managed network: resorts, offices, cafés, schools, lodges and residential buildings"
          className="mt-6 h-auto w-full rounded-2xl border border-[var(--border)]"
        />
        <p className="mt-2 text-xs text-[var(--foreground-muted)]">Illustration of example venues, not customers.</p>
      </section>

      {/* What it does */}''', "{/* Where it works */}")

rep("frontend/src/features/public/WizyfiProductPage.tsx",
    'import { btnPrimary, btnSecondary } from "../../components/ui/styles";',
    'import { btnPrimary, btnSecondary } from "../../components/ui/styles";\nimport { WIZYFI_SLOGAN } from "../../lib/brand";', "WIZYFI_SLOGAN } from")
rep("frontend/src/features/public/WizyfiProductPage.tsx", ">Every Connection. Every Network. In Your Control.</p>", ">{WIZYFI_SLOGAN}</p>", ">{WIZYFI_SLOGAN}</p>")
O = "frontend/src/features/wizyfi/pages/WizyfiOverviewPage.tsx"
rep(O, 'import { formatInZone } from "../../../lib/wizyfiTime";',
    'import { formatInZone } from "../../../lib/wizyfiTime";\nimport { WIZYFI_SLOGAN } from "../../../lib/brand";', "WIZYFI_SLOGAN } from")
rep(O, 'description="Every Connection. Every Network. In Your Control. — Schedule an exact-time hard logout for your networks."',
    'description={`${WIZYFI_SLOGAN} Schedule an exact-time hard logout for your networks.`}', "description={`${WIZYFI_SLOGAN}")

# ---- frontend: portal route -------------------------------------------------------
A = "frontend/src/App.tsx"
rep(A, 'import { HomePage } from "./features/public/HomePage";',
    'import { HomePage } from "./features/public/HomePage";\nimport { PortalPage } from "./features/portal/PortalPage";', "features/portal/PortalPage")
rep(A, '      <Route path="/sign-up" element={<SignUpPage />} />\n',
    '      <Route path="/sign-up" element={<SignUpPage />} />\n      {/* Captive portal: public, opened from the router\'s sign-in redirect */}\n'
    '      <Route path="/portal/:placeId" element={<PortalPage />} />\n', 'path="/portal/:placeId"')

# ---- frontend: access plans ---------------------------------------------------------
E = "frontend/src/features/access/components/PlanEditorForm.tsx"
rep(E, "interface PlanEditorFormProps {",
'''// Quick-start presets (voucher / session plans: hourly, half-day, daily...). They set the
// duration and validity only; the price is always the operator's own decision.
const PRESETS: Array<{ label: string; minutes: number; mode: AccessPlanValidityMode }> = [
  { label: "30 minutes", minutes: 30, mode: "DURATION" },
  { label: "1 hour", minutes: 60, mode: "DURATION" },
  { label: "Half day", minutes: 720, mode: "DURATION" },
  { label: "Full day", minutes: 1440, mode: "DURATION" },
  { label: "1 week", minutes: 10080, mode: "DURATION" },
  { label: "Until next reset", minutes: 600, mode: "UNTIL_NEXT_RESET" },
];

interface PlanEditorFormProps {''', "const PRESETS")
rep(E, '''        {step === "pricing" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Price" error={errorFor("price")}>''',
'''        {step === "pricing" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {!initialValue && (
              <div className="sm:col-span-3">
                <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Quick start</p>
                <div role="group" aria-label="Plan presets" className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        setValue({ ...value, durationMinutes: p.minutes, validityMode: p.mode, name: value.name.trim() ? value.name : p.label })
                      }
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">Presets fill the duration and end rule. Set your own price.</p>
              </div>
            )}
            <Field label="Price" error={errorFor("price")}>''', "Quick start")
rep(E, "This preview must match what customers see on the captive portal.",
    'This preview must match what customers see on the captive portal.{" "}\n'
    '              {value.status === "ACTIVE" && value.availability.isPubliclyListed\n'
    '                ? "It will be listed once saved."\n'
    '                : "It won\'t be listed on the portal yet: set the status to Active and show it on the captive portal."}',
    "It will be listed once saved")

T = "frontend/src/features/access/components/PlanTable.tsx"
rep(T, 'import { PlanStatusBadge } from "./PlanStatusBadge";',
    'import { PlanStatusBadge } from "./PlanStatusBadge";\nimport { PlanStatusActions } from "./PlanStatusActions";', './PlanStatusActions"')
rep(T, '''                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(plan)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {canEdit ? "Edit" : "View"}
                  </button>
                </td>''',
'''                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && <PlanStatusActions plan={plan} />}
                    <button
                      type="button"
                      onClick={() => onOpen(plan)}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {canEdit ? "Edit" : "View"}
                    </button>
                  </div>
                </td>''', "<PlanStatusActions plan={plan} />")

failed = 0
for path, kind, old, new, marker, end in P:
    f = Path(path)
    if not f.exists():
        print(f"MISSING   {path}"); failed += 1; continue
    text = f.read_text(encoding="utf-8")
    if marker in text:
        print(f"already   {path}  ({marker[:36]!r})"); continue
    if kind == "rep":
        if old not in text:
            print(f"NOT FOUND {path}  -> apply by hand: {marker[:50]!r}"); failed += 1; continue
        out = text.replace(old, new, 1)
    else:
        i = text.find(old); j = text.find(end, i + 1) if i >= 0 else -1
        if i < 0 or j < 0:
            print(f"NOT FOUND {path}  -> region {old.strip()[:40]!r}"); failed += 1; continue
        out = text[:i] + new + text[j + len(end):]
    if not DRY:
        f.write_text(out, encoding="utf-8")
    print(f"patched   {path}")
sys.exit(1 if failed else 0)
