import { Menu } from "lucide-react";
import { queryClient } from "../../lib/queryClient";
import { useSessionStore } from "../../state/sessionStore";
import { ThemeToggle } from "../ui/ThemeToggle";
import { ProfileMenu } from "./ProfileMenu";

export function Header({ onMenu }: { onMenu: () => void }) {
  const memberships = useSessionStore((s) => s.memberships);
  const activeId = useSessionStore((s) => s.activeOrganizationId);
  const setActive = useSessionStore((s) => s.setActiveOrganization);

  const switchOrganization = (id: string) => {
    setActive(id);
    // Cached rows belong to the previous tenant — drop them all (see queryClient.ts).
    queryClient.clear();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <button
        type="button"
        aria-label="Open navigation"
        aria-controls="primary-navigation"
        onClick={onMenu}
        className="rounded-md p-2 text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        {memberships.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Organization</span>
            <select
              value={activeId ?? ""}
              onChange={(e) => switchOrganization(e.target.value)}
              className="max-w-[14rem] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {memberships.map((m) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="truncate text-sm font-medium text-[var(--foreground)]">
            {memberships[0]?.organization.name}
          </span>
        )}
      </div>

      <ThemeToggle />
      <ProfileMenu />
    </header>
  );
}
