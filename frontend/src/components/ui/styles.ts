// Shared class strings so every control looks and focuses the same.
// Tokens only — no raw colours. Motion: 120–160 ms colour/shadow + a 0.98
// press scale, never bounce.

export const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] transition-colors duration-[120ms] hover:border-[var(--foreground-muted)] focus-visible:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] aria-[invalid=true]:border-[var(--danger)]";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:active:scale-100";

const disabled =
  "disabled:border-transparent disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)] disabled:shadow-none";

export const btnPrimary = `${btnBase} ${disabled} bg-[var(--primary)] text-[var(--primary-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--primary-hover)]`;
export const btnSecondary = `${btnBase} ${disabled} border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-elevated)]`;
export const btnDanger = `${btnBase} ${disabled} bg-[var(--danger)] text-white hover:brightness-90`;
export const btnGhost = `${btnBase} ${disabled} font-medium text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]`;
