// Labelled password input with a real show/hide button, error association
// (aria-invalid + aria-describedby) and no value echoing.
import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { inputClass } from "./styles";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: string;
}

export function PasswordField({ label, value, onChange, autoComplete, error }: PasswordFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className={`${inputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-[var(--foreground-secondary)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {error && (
        <span id={errId} role="alert" className="text-xs text-[var(--danger-text)]">
          {error}
        </span>
      )}
    </div>
  );
}
