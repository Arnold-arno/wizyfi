// Shared class strings so every control looks and focuses the same (doc05).
// Tokens only — no raw colours (doc06 "Token usage" gate).

export const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-60";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary = `${btnBase} bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]`;
export const btnSecondary = `${btnBase} border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-elevated)]`;
export const btnDanger = `${btnBase} bg-[var(--danger)] text-white hover:opacity-90`;
export const btnGhost = `${btnBase} font-medium text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]`;
