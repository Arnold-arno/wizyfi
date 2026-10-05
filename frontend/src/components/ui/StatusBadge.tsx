// Status is always text + dot, never colour alone (doc02 §9, doc05 §8).

export type Tone = "success" | "warning" | "danger" | "info" | "muted";

export const TONE_VAR: Record<Tone, string> = {
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  info: "--info",
  muted: "--foreground-muted",
};

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-secondary)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(${TONE_VAR[tone]})` }}
      />
      {label}
    </span>
  );
}
