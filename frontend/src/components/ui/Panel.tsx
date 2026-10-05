import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Borders-first surface (doc05 §1): a bordered section with its own heading. */
export function Panel({ title, description, action, children, className = "" }: PanelProps) {
  return (
    <section
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--foreground-secondary)]">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
