// Route: /admin. Answers "How is the platform performing?" — not "what is
// happening inside every agent's network?" (supadmin.pdf §3).
//
// Spec items with NO backend support yet, so intentionally NOT drawn here
// (no invented numbers): revenue/outstanding fees, agent-growth and
// connection-growth charts, platform availability, expiring accounts.

import { Link } from "react-router-dom";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StatCard } from "../../../components/ui/StatCard";
import { formatDateTime, formatNumber } from "../../../lib/format";
import { usePlatformActivity, usePlatformDashboard } from "../hooks/useAdmin";

export function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch } = usePlatformDashboard();
  const activity = usePlatformActivity(1);

  const activePct =
    data && data.totalAgents > 0 ? `${((data.activeAgents / data.totalAgents) * 100).toFixed(1)}% active` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform overview" description="How Wizyfi Bridge is performing across all agent accounts." />

      {isLoading && (
        <div role="status" aria-label="Loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load the overview."} onRetry={() => refetch()} />}

      {data && (
        <section aria-label="Platform figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total agents" value={formatNumber(data.totalAgents)} to="/admin/agents" />
          <StatCard label="Active agents" value={formatNumber(data.activeAgents)} hint={activePct} />
          <StatCard label="Suspended agents" value={formatNumber(data.suspendedAgents)} />
          <StatCard label="Connected networks" value={formatNumber(data.totalPlaces)} hint="Count only — contents are private" />
          <StatCard label="Active sessions" value={formatNumber(data.totalActiveSessions)} hint="Platform-wide total" />
        </section>
      )}

      <Panel
        title="Recent platform activity"
        action={
          <Link to="/admin/activity" className="text-sm text-[var(--primary)] hover:underline">
            View all
          </Link>
        }
      >
        {activity.isLoading && <Skeleton className="h-20 w-full" />}
        {activity.data && activity.data.results.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--foreground-secondary)]">
            No platform actions yet. Suspensions, restorations and plan changes are recorded here.
          </p>
        )}
        {activity.data && activity.data.results.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {activity.data.results.slice(0, 8).map((a) => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-[var(--foreground)]">
                  <span className="font-medium">{a.organizationName}</span> — {a.message}
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">{formatDateTime(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
