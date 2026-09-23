// src/components/ui/EmptyState.tsx
//
// Per doc02 §7 / doc04 §12: empty states must explain why there is no data
// and give one useful next action — never a blank panel.

import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center"
    >
      {icon && (
        <div className="text-[var(--foreground-muted)]" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="max-w-sm text-sm text-[var(--foreground-secondary)]">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
