import { X } from "lucide-react";
import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { usePermissions } from "../../hooks/usePermissions";
import { NAV_ITEMS } from "./navConfig";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { hasPermission } = usePermissions();
  const items = NAV_ITEMS.filter((i) => hasPermission(i.permission));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        id="primary-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
          <span className="text-base font-bold text-[var(--foreground)]">Wizyfi Bridge</span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="rounded-md p-2 text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)] lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {items.map(({ label, to, icon: Icon, note }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                      isActive
                        ? "bg-[var(--surface-elevated)] text-[var(--primary)]"
                        : "text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex flex-col leading-tight">
                    {label}
                    {note && <span className="text-[11px] font-normal text-[var(--foreground-muted)]">{note}</span>}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
