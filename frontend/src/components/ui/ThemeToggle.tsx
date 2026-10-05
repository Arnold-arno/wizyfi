import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { applyTheme, getTheme, type Theme } from "../../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      className="rounded-md p-2 text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
