// Public website shell (Public Website spec §2). Sign in and Create account stay
// visible on mobile; only the section links collapse into the menu. No
// authenticated-only navigation is ever shown here. Privacy/Terms/Contact links
// are intentionally absent until those pages exist and are approved.
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { btnPrimary, btnSecondary } from "../../components/ui/styles";
import { PRODUCT } from "../../lib/brand";
import { useSessionStore } from "../../state/sessionStore";

const NAV = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Wizyfi", href: "#wizyfi" },
  { label: "Integrations", href: "#integrations" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const signedIn = useSessionStore((s) => s.accessToken !== null);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <img src="/brand/favicon-32x32.png" alt="" className="h-6 w-6" aria-hidden="true" />
            {PRODUCT}
          </Link>
          <nav aria-label="Sections" className="ml-6 hidden items-center gap-5 text-sm text-[var(--foreground-secondary)] lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-[var(--foreground)]">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {signedIn ? (
              <Link to="/start" className={btnPrimary}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/sign-in" className={`${btnSecondary} !px-3`}>
                  Sign in
                </Link>
                <Link to="/sign-up" className={`${btnPrimary} !px-3`}>
                  Create account
                </Link>
              </>
            )}
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="rounded-md p-2 text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] lg:hidden"
            >
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {open && (
          <nav aria-label="Sections" className="border-t border-[var(--border)] px-4 py-2 lg:hidden">
            <ul className="flex flex-col">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a href={n.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2 text-sm text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="main">{children}</main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-[var(--foreground-secondary)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {PRODUCT}</p>
          <div className="flex gap-4">
            <Link to="/wizyfi" className="hover:underline">About Wizyfi</Link>
            <Link to="/sign-in" className="hover:underline">Sign in</Link>
            <Link to="/sign-up" className="hover:underline">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
