// Split-screen auth layout (Public Website spec §4): brand panel ~50%, form
// ~50% on desktop; stacked compact banner on mobile. Uses the approved icon
// asset from /brand (see BRAND_AND_DIAGRAMS_NOTES) — never a redrawn logo.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRODUCT, SLOGAN } from "../../lib/brand";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="flex flex-col items-center justify-center gap-4 bg-[var(--brand-navy)] px-6 py-8 text-center text-white lg:gap-8 lg:px-12 lg:py-0">
        <Link to="/" aria-label={`${PRODUCT} home`} className="focus-visible:outline-2 focus-visible:outline-[var(--brand-cyan)]">
          <img src="/brand/icon-512.png" alt="Wizyfi icon" className="h-16 w-16 object-contain lg:h-64 lg:w-64" />
        </Link>
        <div>
          <p className="text-lg font-bold lg:text-3xl">{PRODUCT}</p>
          <p className="mt-1 max-w-sm text-sm text-slate-300 lg:mt-3 lg:text-lg">{SLOGAN}</p>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-[var(--background)] p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--foreground-secondary)]">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-[var(--foreground-secondary)]">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
