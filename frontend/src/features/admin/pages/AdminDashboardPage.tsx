// Route: /admin. Answers "How is the platform performing?" — never "what is
// happening inside every agent's network?" (supadmin.pdf §3). Every figure is
// computed server-side from account metadata and counts.
//
// Spec items with NO backend data yet, deliberately NOT drawn as numbers (no
// invented figures): collected revenue / outstanding / overdue fees, expiring
// accounts and platform availability. They are listed honestly in the
// "Not available yet" panel instead.

import { Banknote, Network, RefreshCw, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart } from "../../../components/charts/LineChart";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StatCard } from "../../../components/ui/StatCard";
import { btnSecondary } from "../../../components/ui/styles";
import { firstName, greeting } from "../../../lib/greeting";
import { formatDateTime, formatNumber, formatTime } from "../../../lib/format";
import { useSessionStore } from "../../../state/sessionStore";
import type { GrowthPoint, GrowthRange } from "../../../types/admin";
import { usePlatformActivity, usePlatformDashboard } from "../hooks/useAdmin";

const RANGES: Array<{ label: string; value: GrowthRange }> = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "3 months", value: "3m" },
  { label: "6 months", value: "6m" },
  { label: "1 year", value: "1y" },
];

const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const toPoints = (g: GrowthPoint[]) => g.map((p) => ({ label: label(p.date), value: p.total }));
const sum = (g: GrowthPoint[]) => g.reduce((a, p) => a + p.new, 0);

const NOT_YET = [
  "Collected revenue, outstanding and overdue fees",
  "Expiring accounts",
  "Platform availability",
  "Disconnections over time",
];

export function AdminDashboardPage() {
  const user = useSessionStore((s) => s.user);
  const [range, setRange] = useState<GrowthRange>("30d");
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = usePlatformDashboard(range);
  const activity = usePlatformActivity(1);

  const activePct =
    data && data.totalAgents > 0 ? `${((data.activeAgents / data.totalAgents) * 100).toFixed(1)}% active` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${firstName(user?.fullName)}`}
        description="Here's how Wizyfi Bridge is performing across all agent accounts."
        actions={
          <>
            <span className="text-xs text-[var(--foreground-muted)]" aria-live="polite">
              {isFetching ? "Refreshing…" : `Last updated ${formatTime(dataUpdatedAt)}`}
            </span>
            <button type="button" className={btnSecondary} onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </button>
          </>
        }
      />

      {isLoading && (
        <div role="status" aria-label="Loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}
      {isError && !data && <ErrorState message={error instanceof Error ? error.message : "Could not load the overview."} onRetry={() => refetch()} />}

      {data && (
        <>
          <section aria-label="Platform figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Total agents" value={formatNumber(data.totalAgents)} hint={`+${formatNumber(data.newAgentsThisMonth)} this month`} icon={Users} to="/admin/agents" />
            <StatCard label="Active agents" value={formatNumber(data.activeAgents)} hint={activePct} />
            <StatCard label="Suspended accounts" value={formatNumber(data.suspendedAgents)} />
            <StatCard label="Connected networks" value={formatNumber(data.totalPlaces)} hint={`+${formatNumber(data.newPlacesThisMonth)} this month · count only, contents are private`} icon={Network} />
            <StatCard label="Active sessions" value={formatNumber(data.totalActiveSessions)} hint="Platform-wide total" />
            <StatCard label="Expected monthly revenue" value={formatNumber(data.expectedMonthlyRevenue)} hint="From active agents' plans. Not collected payments." icon={Banknote} to="/admin/plans" />
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">Growth</h2>
            <FilterChips label="Growth range" options={RANGES} value={range} onChange={setRange} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Agents over time" description={`${formatNumber(sum(data.agentGrowth))} joined in this period`}>
              <LineChart points={toPoints(data.agentGrowth)} ariaLabel="Total agent accounts over time" valueLabel="agents" />
            </Panel>
            <Panel title="Connected networks over time" description={`${formatNumber(sum(data.networkGrowth))} added in this period · aggregate only`}>
              <LineChart points={toPoints(data.networkGrowth)} ariaLabel="Total connected networks over time" valueLabel="networks" />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel
              title="Recent platform activity"
              className="lg:col-span-2"
              action={<Link to="/admin/activity" className="text-sm text-[var(--primary)] hover:underline">View all</Link>}
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
                        <Link to={`/admin/agents/${a.organizationId}`} className="font-medium hover:underline">{a.organizationName}</Link> — {a.message}
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)]">{formatDateTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Not available yet" description="These need a billing and monitoring module first, so no numbers are shown.">
              <ul className="space-y-2 text-sm text-[var(--foreground-secondary)]">
                {NOT_YET.map((t) => (
                  <li key={t} className="flex gap-2"><span aria-hidden="true">•</span>{t}</li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
