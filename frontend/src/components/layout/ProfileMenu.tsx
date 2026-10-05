// Profile menu with the Super Admin entry point (INTEGRATION_NOTES §3).
// The "Super Admin portal" item is shown from `user.isPlatformStaff` — the
// real signal on /auth/me/ — never inferred from an organization role. It is
// a convenience link; /admin is protected by AdminRoute + IsPlatformStaff.

import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../lib/api/authApi";
import { queryClient } from "../../lib/queryClient";
import { useSessionStore } from "../../state/sessionStore";

export function ProfileMenu() {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const signOut = async () => {
    const refresh = useSessionStore.getState().refreshToken;
    try {
      if (refresh) await authApi.logout(refresh); // blacklists the refresh token server-side
    } catch {
      /* sign out locally regardless */
    }
    useSessionStore.getState().clear();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  const itemCls =
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--surface-elevated)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white"
        >
          {user.fullName.slice(0, 1).toUpperCase() || "?"}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{user.fullName}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)]"
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">{user.fullName}</p>
            <p className="truncate text-xs text-[var(--foreground-muted)]">{user.email}</p>
          </div>
          {user.isPlatformStaff && (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => {
                setOpen(false);
                navigate("/admin");
              }}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Super Admin portal
            </button>
          )}
          <button type="button" role="menuitem" className={itemCls} onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
