import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useActiveMembership } from "../../state/sessionStore";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const membership = useActiveMembership();
  const [navOpen, setNavOpen] = useState(false);

  // No organization (new account, or platform staff): "/" decides where to go.
  if (!membership) return <Navigate to="/" replace />;

  const suspended = membership.organization.status === "SUSPENDED";

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setNavOpen(true)} />
        {suspended && (
          <div role="alert" className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--danger)]">
            This organization is suspended. Access is paused until the platform team restores it.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
