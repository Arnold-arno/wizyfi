// Split-screen auth layout: brand panel ~50% / form ~50% on desktop; compact
// banner stacked above the form on mobile. Uses the approved icon asset from
// /brand — never a redrawn logo. If the asset is missing a plain "W" tile is
// shown instead of a broken-image icon.
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { PRODUCT, SLOGAN } from "../../lib/brand";

function BrandMark({ className }: { className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" className={`flex items-center justify-center rounded-2xl bg-[var(--primary)] font-bold text-white ${className}`}>
        W
      </span>
    );
  }
  return <img src="/brand/icon-512.png" alt="Wizyfi icon" onError={() => setFailed(true)} className={`object-contain ${className}`} />;
}

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="grid min-h-screen bg-[var(--background)] lg:grid-cols-2">
      <aside className="wz-brand-panel flex flex-col items-center justify-center gap-4 px-6 py-8 text-center text-white lg:gap-8 lg:px-12 lg:py-0">
        <Link to="/" aria-label={`${PRODUCT} home`} className="rounded-2xl focus-visible:outline-2 focus-visible:outline-[var(--brand-blue)]">
          <BrandMark className="h-14 w-14 text-2xl lg:h-60 lg:w-60 lg:text-7xl" />
        </Link>
        <div>
          <p className="text-lg font-bold lg:text-3xl">{PRODUCT}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-300 lg:mt-3 lg:text-lg">{SLOGAN}</p>
        </div>
        <p className="hidden max-w-sm items-center gap-2 text-xs text-slate-400 lg:flex">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Credentials are stored encrypted and every action is checked on the server.
        </p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to website
          </Link>
          <ThemeToggle />
        </div>
        <main className="wz-page flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-[var(--foreground-secondary)]">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 text-sm text-[var(--foreground-secondary)]">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
