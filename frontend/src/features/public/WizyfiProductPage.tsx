// Public route: /wizyfi — Wizyfi as a first-party Wizyfi Bridge product.
// Public marketing surface (doc00 §2). Claims here only describe what the
// product actually does today; no invented metrics.

import { Link } from "react-router-dom";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { btnPrimary, btnSecondary } from "../../components/ui/styles";

const POINTS = [
  { title: "Exact-time hard logout", body: "Pick the place or routers, the date, time and timezone. Wizyfi disconnects active users at that moment, even if nobody is logged in." },
  { title: "Safe by design", body: "Explicit scope, a plain-language consequence, and a review step before anything is scheduled. Nothing else in the platform can trigger it." },
  { title: "Honest results", body: "Per-router outcomes, partial failures shown as partial, and a permanent history of every event." },
  { title: "Part of Wizyfi Bridge", body: "Use Wizyfi alongside MikroTik and other vendors under one dashboard, one login and one audit trail." },
];

export function WizyfiProductPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="font-bold">Wizyfi Bridge</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className={btnSecondary}>
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <section className="py-16 text-center">
          <p className="text-sm font-medium text-[var(--primary)]">A Wizyfi Bridge product</p>
          <h1 className="mt-2 text-4xl font-bold">Wizyfi</h1>
          <p className="mt-3 text-lg text-[var(--foreground-secondary)]">Every Connection. Every Network. In Your Control.</p>
          <div className="mt-8">
            <Link to="/login" className={btnPrimary}>
              Get started
            </Link>
          </div>
        </section>
        <section aria-label="What Wizyfi does" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {POINTS.map((p) => (
            <article key={p.title} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-base font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{p.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
