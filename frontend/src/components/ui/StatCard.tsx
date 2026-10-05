import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  to?: string;
}

export function StatCard({ label, value, hint, icon: Icon, to }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--foreground-secondary)]">{label}</span>
        {Icon && <Icon aria-hidden="true" className="h-4 w-4 text-[var(--foreground-muted)]" />}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--foreground)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--foreground-muted)]">{hint}</p>}
    </>
  );
  const cls = "block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4";
  return to ? (
    <Link
      to={to}
      className={`${cls} transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
