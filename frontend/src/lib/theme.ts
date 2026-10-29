// Theme: preference is "light" | "dark" | "system"; the resolved theme is written
// to <html data-theme> (and the .dark class, kept for older selectors). System is
// followed until the user explicitly chooses.
// CHANGED (Round 19): setPreference() so Settings can offer a real System option.
export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
const KEY = "wizyfi_theme";

export function getPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

const systemTheme = (): Theme =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export function resolve(pref: ThemePreference = getPreference()): Theme {
  return pref === "system" ? systemTheme() : pref;
}

function paint(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
}

export const getTheme = (): Theme => resolve();

export function setPreference(pref: ThemePreference): void {
  paint(resolve(pref));
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
}

/** Explicit light/dark choice (used by the header toggle). */
export const applyTheme = (theme: Theme): void => setPreference(theme);

export function initTheme(): void {
  paint(resolve());
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getPreference() === "system") paint(systemTheme());
  });
}
