import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge, type Tone } from "../../components/ui/StatusBadge";
import { timeAgo } from "../../lib/relativeTime";
import type { NotificationLevel } from "../../types/dashboard";
import { useNotifications, useSeenAt } from "./hooks";

export const LEVEL_TONE: Record<NotificationLevel, Tone> = {
  INFO: "info", SUCCESS: "success", WARNING: "warning", ERROR: "danger", CRITICAL: "danger",
};
export const levelLabel = (l: NotificationLevel) => l.charAt(0) + l.slice(1).toLowerCase();

export function NotificationBell() {
  const { data } = useNotifications({ pageSize: 8 }, 60_000);
  const { seenAt, markSeen } = useSeenAt();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const items = data?.results ?? [];
  const unseen = items.filter((n) => new Date(n.createdAt).getTime() > seenAt).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) markSeen();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unseen > 0 ? `Notifications, ${unseen} new` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unseen > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="wz-dialog absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <Link to="/app/notifications" onClick={() => setOpen(false)} className="text-xs text-[var(--primary)] hover:underline">View all</Link>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--foreground-secondary)]">You're all caught up. Hard logout results and system notices appear here.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-[var(--divider)] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {n.message && <p className="line-clamp-2 text-xs text-[var(--foreground-secondary)]">{n.message}</p>}
                    <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{timeAgo(n.createdAt)}</p>
                  </div>
                  <StatusBadge label={levelLabel(n.level)} tone={LEVEL_TONE[n.level]} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
