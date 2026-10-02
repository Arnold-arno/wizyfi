// src/features/access/components/PlanTable.tsx
//
// Content per doc04 §7 Plan list: name, price, duration, limits, status.
// Desktop = dense table (doc05 §6); mobile transforms rows into cards
// preserving identity/status/time/action (doc02 §8, doc04 §13).

import type { AccessPlan } from "../../../types/accessPlan";
import { PlanStatusBadge } from "./PlanStatusBadge";

interface PlanTableProps {
  plans: AccessPlan[];
  canEdit: boolean;
  onOpen: (plan: AccessPlan) => void;
}

function formatDuration(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function formatLimits(plan: AccessPlan): string {
  const { dataCapMb, maxConcurrentDevices } = plan.quota;
  const parts: string[] = [];
  parts.push(dataCapMb ? `${(dataCapMb / 1024).toFixed(1)} GB` : "Unlimited data");
  parts.push(
    maxConcurrentDevices ? `${maxConcurrentDevices} device(s)` : "Unlimited devices"
  );
  return parts.join(" · ");
}

export function PlanTable({ plans, canEdit, onOpen }: PlanTableProps) {
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--foreground-secondary)]">
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Limits</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr
                key={plan.id}
                className="border-b border-[var(--border)] text-[var(--foreground)] last:border-b-0 hover:bg-[var(--surface-elevated)] focus-within:bg-[var(--surface-elevated)]"
              >
                <td className="px-4 py-3 font-medium">{plan.name}</td>
                <td className="px-4 py-3 tabular-nums">
                  {plan.currency} {plan.price.toFixed(2)}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatDuration(plan.durationMinutes)}</td>
                <td className="px-4 py-3 text-[var(--foreground-secondary)]">{formatLimits(plan)}</td>
                <td className="px-4 py-3">
                  <PlanStatusBadge status={plan.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(plan)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {canEdit ? "Edit" : "View"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card transform */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {plans.map((plan) => (
          <li key={plan.id}>
            <button
              type="button"
              onClick={() => onOpen(plan)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-[var(--foreground)]">{plan.name}</span>
                <PlanStatusBadge status={plan.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--foreground-secondary)]">
                <span>
                  {plan.currency} {plan.price.toFixed(2)}
                </span>
                <span>{formatDuration(plan.durationMinutes)}</span>
                <span>{formatLimits(plan)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
