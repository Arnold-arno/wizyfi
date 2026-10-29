import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useActiveMembership } from "../../state/sessionStore";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const membership = useActiveMembership();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // No organization (new account, or platform staff): "/start" decides where to go.
  if (!membership) return <Navigate to="/start" replace />;

  const suspended = membership.organization.status === "SUSPENDED";

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setNavOpen(true)} />
        {suspended && (
          <div role="alert" className="border-b border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
            This organization is suspended. Access is paused until the platform team restores it.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-8">
          {/* key=pathname replays the short route fade on navigation */}
          <div key={pathname} className="wz-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
