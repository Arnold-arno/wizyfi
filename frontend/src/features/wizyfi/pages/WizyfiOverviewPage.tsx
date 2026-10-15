// Route: /app/hard-logout — Wizyfi overview (doc04 §10 "Overview").
// State, next scheduled reset with countdown, recent history. No fake progress.

import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { btnPrimary, btnSecondary } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatInZone } from "../../../lib/wizyfiTime";
import { Countdown } from "../components/Countdown";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { useHardLogoutEvents, usePlacesLite } from "../hooks/useWizyfi";

export function WizyfiOverviewPage() {
  const { hasPermission } = usePermissions();
  const canSchedule = hasPermission("hard_logout:schedule");
  const { data, isLoading, isError, error, refetch } = useHardLogoutEvents({}, 15_000);
  const places = usePlacesLite();
  const placeName = (id: string) => places.data?.results.find((p) => p.id === id)?.name ?? "Unknown place";

  const events = data?.results ?? [];
  const running = events.find((e) => e.status === "RUNNING");
  const upcoming = events
    .filter((e) => e.status === "SCHEDULED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const next = upcoming[0];
  const recent = events.filter((e) => e.status !== "SCHEDULED").slice(0, 5);

  const state = running ? "Running" : upcoming.length > 0 ? `${upcoming.length} scheduled` : "Ready";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Wizyfi"
        description="Every Connection. Every Network. In Your Control. — Schedule an exact-time hard logout for your networks."
        actions={
          <>
            <Link to="/app/hard-logout/history" className={btnSecondary}>
              History
            </Link>
            {canSchedule && (
              <Link to="/app/hard-logout/schedule" className={btnPrimary}>
                Schedule hard logout
              </Link>
            )}
          </>
        }
      />

      <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground-secondary)]">
        <span className="font-medium text-[var(--foreground)]">Independent system.</span> Plans, vouchers, cycles, sales
        and sessions never trigger a hard logout. It only happens when an authorised operator schedules one here.
      </p>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && !data && (
        <ErrorState message={error instanceof Error ? error.message : "Could not load Wizyfi."} onRetry={() => refetch()} />
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="State">
            <p className="text-2xl font-bold text-[var(--foreground)]">{state}</p>
            {running && (
              <Link to={`/app/hard-logout/${running.id}`} className="mt-2 inline-block text-sm text-[var(--primary)] hover:underline">
                Watch the running event
              </Link>
            )}
          </Panel>

          <Panel title="Next scheduled reset" className="lg:col-span-2">
            {next ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-3">
                  <EventStatusBadge status={next.status} />
                  <span className="text-[var(--foreground)]">{placeName(next.place)}</span>
                </div>
                <p className="text-[var(--foreground-secondary)]">{formatInZone(next.scheduledAt, next.scheduledTimezone)}</p>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  <Countdown target={next.scheduledAt} />
                </p>
                {next.impactEstimateConnections !== null && (
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Estimated {next.impactEstimateConnections} connection(s) at scheduling time — an estimate, not a guarantee.
                  </p>
                )}
                <Link to={`/app/hard-logout/${next.id}`} className="text-[var(--primary)] hover:underline">
                  Open event
                </Link>
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-secondary)]">Nothing scheduled.</p>
            )}
          </Panel>
        </div>
      )}

      {data && (
        <Panel
          title="Recent events"
          action={
            <Link to="/app/hard-logout/history" className="text-sm text-[var(--primary)] hover:underline">
              View all
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              title="No hard logouts yet"
              description="Finished and cancelled events will appear here with their full outcome."
              action={
                canSchedule ? (
                  <Link to="/app/hard-logout/schedule" className={btnPrimary}>
                    Schedule hard logout
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <Link to={`/app/hard-logout/${e.id}`} className="min-w-0 hover:underline">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">{placeName(e.place)}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{formatInZone(e.scheduledAt, e.scheduledTimezone)}</p>
                  </Link>
                  <EventStatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
