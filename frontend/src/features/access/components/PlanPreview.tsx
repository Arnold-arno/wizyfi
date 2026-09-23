// src/features/access/components/PlanPreview.tsx
//
// doc04 §7: "Plan preview — Captive-portal representation. Must match
// the portal." This renders using the same visual language as the
// Captive Portal's Access screen (doc04 §11) — plan name, price,
// duration and one key limit — so operators see what customers will see.

import type { AccessPlan } from "../../../types/accessPlan";

export function PlanPreview({ plan }: { plan: AccessPlan }) {
  const keyLimit = plan.quota.dataCapMb
    ? `${(plan.quota.dataCapMb / 1024).toFixed(1)} GB included`
    : "Unlimited data";

  return (
    <div className="mx-auto w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-semibold text-[var(--foreground)]">{plan.name || "Plan name"}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
        {plan.currency} {plan.price.toFixed(2)}
      </p>
      <p className="text-xs text-[var(--foreground-secondary)]">
        {plan.durationMinutes >= 1440
          ? `${plan.durationMinutes / 1440} day access`
          : `${plan.durationMinutes} minute access`}
      </p>
      <p className="mt-3 text-xs text-[var(--foreground-secondary)]">{keyLimit}</p>
      <button
        type="button"
        disabled
        className="mt-4 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white opacity-90"
      >
        Get connected
      </button>
    </div>
  );
}
