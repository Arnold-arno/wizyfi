// Live password feedback shared by reset-password and change-password (the sign-up
// page has its own copy of the same markup). Mirrors lib/passwordPolicy.ts, which
// mirrors apps/accounts/validators.py: text + icon, never colour alone, announced
// politely. Uppercase is informational only.
import { Check, Circle } from "lucide-react";
import { evaluatePassword, MIN_PASSWORD_LENGTH, passwordAcceptable } from "../../lib/passwordPolicy";

function Rule({ ok, label, info }: { ok: boolean; label: string; info?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs text-[var(--foreground-secondary)]">
      {ok ? (
        <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-[var(--foreground-muted)]" aria-hidden="true" />
      )}
      <span>
        {label}
        <span className="sr-only">{ok ? " — met" : info ? " — recommended" : " — not met yet"}</span>
      </span>
    </li>
  );
}

export function PasswordChecklist({ password }: { password: string }) {
  const checks = evaluatePassword(password);
  const met = [checks.length, checks.letter, checks.number, checks.special].filter(Boolean).length;
  const strong = passwordAcceptable(checks);
  const label = strong ? "Strong" : met >= 3 ? "Almost there" : met >= 1 ? "Weak" : "Enter a password";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3" aria-live="polite">
        <div aria-hidden="true" className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= met ? (strong ? "bg-[var(--success)]" : "bg-[var(--primary)]") : "bg-[var(--border)]"
              }`}
            />
          ))}
        </div>
        <span className="w-24 text-right text-xs font-medium text-[var(--foreground-secondary)]">{label}</span>
      </div>
      <ul aria-live="polite" aria-label="Password requirements" className="flex flex-col gap-1">
        <Rule ok={checks.length} label={`At least ${MIN_PASSWORD_LENGTH} characters`} />
        <Rule ok={checks.letter} label="Includes a letter" />
        <Rule ok={checks.number} label="Includes a number" />
        <Rule ok={checks.special} label="Includes a special character" />
        <Rule ok={checks.uppercase} label="Uppercase letter recommended" info />
      </ul>
    </div>
  );
}
