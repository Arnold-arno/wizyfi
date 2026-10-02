// src/features/access/components/PlanStatusBadge.tsx
//
// Per doc05 §8 and doc02 §9: status must never rely on color alone —
// text label is always present alongside the semantic color/dot.

import type { AccessPlanStatus } from "../../../types/accessPlan";

const CONFIG: Record<AccessPlanStatus, { label: string; varName: string }> = {
  DRAFT: { label: "Draft", varName: "--foreground-muted" },
  ACTIVE: { label: "Active", varName: "--success" },
  PAUSED: { label: "Paused", varName: "--warning" },
  ARCHIVED: { label: "Archived", varName: "--foreground-muted" },
};

export function PlanStatusBadge({ status }: { status: AccessPlanStatus }) {
  const { label, varName } = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-secondary)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(${varName})` }}
      />
      {label}
    </span>
  );
}
