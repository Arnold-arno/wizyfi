// Super Admin shell — its own layout, deliberately separate from AppLayout.
// Super Admin manages the platform; agents manage their networks
// (supadmin.pdf, core principle). Nothing here is organization-scoped.

import { Activity, ArrowLeft, Layers, LayoutDashboard, LogOut, ShieldCheck, Users } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ThemeToggle } from "../../../components/ui/ThemeToggle";
import { authApi } from "../../../lib/api/authApi";
import { queryClient } from "../../../lib/queryClient";
import { useSessionStore } from "../../../state/sessionStore";

const NAV = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
  { label: "Agents", to: "/admin/agents", icon: Users, end: false },
  { label: "Platform plans", to: "/admin/plans", icon: Layers, end: false },
  { label: "Activity", to: "/admin/activity", icon: Activity, end: false },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const hasOrg = useSessionStore((s) => s.memberships.length > 0);

  const signOut = async () => {
    const refresh = useSessionStore.getState().refreshToken;
    try {
      if (refresh) await authApi.logout(refresh);
    } catch {
      /* sign out locally regardless */
    }
    useSessionStore.getState().clear();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] lg:flex-row">
      <aside className="border-b border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2 px-4">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          <span className="text-base font-bold">Platform admin</span>
        </div>
        <nav aria-label="Platform" className="flex gap-1 overflow-x-auto p-3 lg:flex-col">
          {NAV.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                  isActive
                    ? "bg-[var(--surface-elevated)] text-[var(--primary)]"
                    : "text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4">
          {hasOrg && (
            <button
              type="button"
              onClick={() => navigate("/app/dashboard")}
              className="mr-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to my organization
            </button>
          )}
          <span className="hidden text-sm text-[var(--foreground-secondary)] sm:inline">{user?.email}</span>
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
