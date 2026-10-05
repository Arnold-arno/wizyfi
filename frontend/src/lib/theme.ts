// Light/dark are equal products (doc05 §1). Class strategy: `.dark` on <html>,
// matching theme-foundation.css.

export type Theme = "light" | "dark";
const KEY = "wizyfi_theme";

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}

export function initTheme(): void {
  document.documentElement.classList.toggle("dark", getTheme() === "dark");
}
