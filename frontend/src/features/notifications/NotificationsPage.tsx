// Route: /app/notifications — every member sees their own notifications plus
// organization-wide broadcasts (no permission code needed).
import { useEffect, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { FilterChips } from "../../components/ui/FilterChips";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { Panel } from "../../components/ui/Panel";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { btnSecondary } from "../../components/ui/styles";
import { formatDateTime } from "../../lib/format";
import type { NotificationLevel } from "../../types/dashboard";
import { LEVEL_TONE, levelLabel } from "./NotificationBell";
import { useMarkAllRead, useNotifications, useSeenAt } from "./hooks";

type Filter = NotificationLevel | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Info", value: "INFO" },
  { label: "Success", value: "SUCCESS" },
  { label: "Warning", value: "WARNING" },
  { label: "Error", value: "ERROR" },
  { label: "Critical", value: "CRITICAL" },
];

export function NotificationsPage() {
  const [level, setLevel] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useNotifications({ page, pageSize: 20, level: level === "ALL" ? undefined : level });
  const markAll = useMarkAllRead();
  const { markSeen } = useSeenAt();

  useEffect(() => markSeen(), [markSeen]); // viewing the page counts as seeing them

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Results of important actions, like hard logouts, and system notices for you and your organization."
        actions={
          <button type="button" className={btnSecondary} disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            {markAll.isPending ? "Marking…" : "Mark mine as read"}
          </button>
        }
      />
      {markAll.data && (
        <p role="status" className="text-sm text-[var(--foreground-secondary)]">
          {markAll.data.markedCount} personal notification(s) marked as read. Organization-wide notices are shared, so they stay as they are.
        </p>
      )}

      <FilterChips label="Filter by level" options={FILTERS} value={level} onChange={(v) => { setPage(1); setLevel(v); }} />

      {isLoading && <Skeleton className="h-48 w-full" />}
      {isError && !data && <ErrorState message={error instanceof Error ? error.message : "Could not load notifications."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState title={level === "ALL" ? "No notifications yet" : "No notifications at this level"} description="Hard logout results and system notices will appear here." />
      )}
      {data && data.results.length > 0 && (
        <>
          <Panel title="Latest">
            <ul className="divide-y divide-[var(--border)]">
              {data.results.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className={`text-sm text-[var(--foreground)] ${n.isRead ? "" : "font-semibold"}`}>{n.title}</p>
                    {n.message && <p className="mt-0.5 text-sm text-[var(--foreground-secondary)]">{n.message}</p>}
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">{formatDateTime(n.createdAt)}</p>
                  </div>
                  <StatusBadge label={levelLabel(n.level)} tone={LEVEL_TONE[n.level]} />
                </li>
              ))}
            </ul>
          </Panel>
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
