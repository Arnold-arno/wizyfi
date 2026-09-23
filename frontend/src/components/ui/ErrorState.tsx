// src/components/ui/ErrorState.tsx
//
// Per doc02 §7: errors need a specific reason and a recovery action —
// never a generic "something went wrong" with no way forward.

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "This didn't load",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--surface)] px-6 py-16 text-center"
    >
      <h3 className="text-[15px] font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="max-w-sm text-sm text-[var(--foreground-secondary)]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
