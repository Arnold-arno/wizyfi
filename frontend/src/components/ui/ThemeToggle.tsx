import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { applyTheme, getTheme, type Theme } from "../../lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
