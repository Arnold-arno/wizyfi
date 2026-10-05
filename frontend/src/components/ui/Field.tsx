import type { ReactNode } from "react";

/** Visible label + inline error association (doc05 §7 form contract). */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[var(--foreground)]">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-[var(--foreground-muted)]">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </span>
      )}
    </label>
  );
}
