// Tailwind v3 config. package.json has "type": "module", so this must be ESM.
// WITHOUT the `content` globs below Tailwind emits no utility classes at all,
// which is exactly the "page loads completely unstyled" symptom.
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Theme is switched with data-theme="dark" on <html> (design spec §6).
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
