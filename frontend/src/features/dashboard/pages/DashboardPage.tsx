// Route: /app/dashboard — doc04 §4. Built to the uploaded dashboard reference:
// KPI row, activity chart, status donut, top-places bars, alerts panel.
// Deliberately NOT built: the reference's world map and "Total data usage" —
// the backend has no location or traffic data, and doc00 §4 forbids inventing
// operational telemetry.

import { Activity, Banknote, MapPin, RefreshCw, Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import { RankedBars } from "../../../components/charts/RankedBars";
import { SalesBars } from "../../../components/charts/SalesBars";
import { StatusDonut, type DonutSegment } from "../../../components/charts/StatusDonut";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StatCard } from "../../../components/ui/StatCard";
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import { btnPrimary, btnSecondary } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatDateTime, formatMoney, formatNumber, formatTime } from "../../../lib/format";
import type { NotificationLevel, RouterStatus } from "../../../types/dashboard";
import { useDashboard, useRecentNotifications } from "../hooks/useDashboard";

const ROUTER_LABEL: Record<RouterStatus, { label: string; tone: Tone }> = {
  ONLINE: { label: "Online", tone: "success" },
  DEGRADED: { label: "Degraded", tone: "warning" },
  OFFLINE: { label: "Offline", tone: "danger" },
  PROVISIONING: { label: "Provisioning", tone: "info" },
  DISABLED: { label: "Disabled", tone: "muted" },
};

const LEVEL_TONE: Record<NotificationLevel, Tone> = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "danger",
  CRITICAL: "danger",
};

export function DashboardPage() {
  const { hasPermission, membership } = usePermissions();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useDashboard();
  const notifications = useRecentNotifications(5);

  const quickActions = [
    { label: "Add place", to: "/app/places/new", code: "places:create" }, // adjust to your Add Place route
    { label: "Create plan", to: "/app/access-plans/new", code: "access_plans:create" },
    { label: "Generate vouchers", to: "/app/vouchers", code: "vouchers:issue" },
    { label: "Schedule hard logout", to: "/app/hard-logout/schedule", code: "hard_logout:schedule" },
  ].filter((a) => hasPermission(a.code));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={membership ? `Network overview for ${membership.organization.name}.` : undefined}
        actions={
          <>
            <span className="text-xs text-[var(--foreground-muted)]" aria-live="polite">
              Updated {formatTime(dataUpdatedAt)}
            </span>
            <button type="button" className={btnSecondary} onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </button>
          </>
        }
      />

      {isLoading && <DashboardSkeleton />}

      {isError && !data && (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load the dashboard."}
          onRetry={() => refetch()}
        />
      )}

      {/* Stale data must be distinguishable from live data (doc03 §6). */}
      {isError && data && (
        <p role="alert" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--warning)]">
          Couldn't refresh. Showing the last known data from {formatTime(dataUpdatedAt)}.
        </p>
      )}

      {data && (
        <>
          <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active connections"
              value={formatNumber(data.kpis.activeSessions)}
              hint="Sessions with access right now"
              icon={Activity}
              to={hasPermission("connections:view") ? "/app/connections" : undefined}
            />
            <StatCard
              label="Routers online"
              value={`${formatNumber(data.kpis.routersOnline)} / ${formatNumber(data.kpis.routersTotal)}`}
              hint="Online of all managed routers"
              icon={Wifi}
            />
            {data.sales ? (
              <StatCard
                label="Today's sales"
                value={formatMoney(data.sales.todayRevenue, data.sales.currency)}
                hint={
                  `${formatNumber(data.sales.todayCount)} completed today (UTC)` +
                  (data.sales.multipleCurrencies ? " · other currencies on Sales" : "")
                }
                icon={Banknote}
                to="/app/sales"
              />
            ) : (
              <StatCard label="Today's sales" value="—" hint="Not available for your role" icon={Banknote} />
            )}
            <StatCard label="Places" value={formatNumber(data.kpis.placeCount)} hint="Excluding archived" icon={MapPin} />
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="Sales, last 7 days"
              description={data.sales?.currency ? `Completed sales in ${data.sales.currency}` : undefined}
              className="xl:col-span-2"
            >
              {!data.sales ? (
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Sales figures aren't available for your role.
                </p>
              ) : data.sales.trend.some((p) => Number(p.revenue) > 0) ? (
                <SalesBars points={data.sales.trend} currency={data.sales.currency} />
              ) : (
                <p className="py-10 text-center text-sm text-[var(--foreground-secondary)]">
                  No completed sales in the last 7 days.
                </p>
              )}
            </Panel>

            <Panel title="Router health" description="Backend-reported state of every managed router">
              {data.kpis.routersTotal === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--foreground-secondary)]">
                  No routers yet. Add a router to a place to start monitoring it.
                </p>
              ) : (
                <StatusDonut
                  centerLabel="routers"
                  segments={data.routerHealth.map(
                    (h): DonutSegment => ({
                      label: ROUTER_LABEL[h.status].label,
                      value: h.count,
                      tone: ROUTER_LABEL[h.status].tone,
                    })
                  )}
                />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Busiest places" description="By active connections right now">
              {data.topPlaces.length === 0 ? (
                <EmptyState
                  title="No places yet"
                  description="Create a place to see connection activity here."
                />
              ) : (
                <RankedBars
                  unit="connections"
                  items={data.topPlaces.map((p) => ({ id: p.id, label: p.name, value: p.activeSessions }))}
                />
              )}
            </Panel>

            <Panel
              title="Alerts"
              description="Latest notifications for you and your organization"
            >
              {notifications.isLoading && <Skeleton className="h-20 w-full" />}
              {notifications.isError && (
                <p className="text-sm text-[var(--foreground-secondary)]">Couldn't load alerts.</p>
              )}
              {notifications.data && notifications.data.results.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--foreground-secondary)]">
                  No alerts. Hard logout results and system notices will appear here.
                </p>
              )}
              {notifications.data && notifications.data.results.length > 0 && (
                <ul className="divide-y divide-[var(--border)]">
                  {notifications.data.results.map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--foreground)]">{n.title}</p>
                        {n.message && (
                          <p className="truncate text-xs text-[var(--foreground-secondary)]">{n.message}</p>
                        )}
                        <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{formatDateTime(n.createdAt)}</p>
                      </div>
                      <StatusBadge label={n.level.charAt(0) + n.level.slice(1).toLowerCase()} tone={LEVEL_TONE[n.level]} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {quickActions.length > 0 && (
            <Panel title="Quick actions">
              <div className="flex flex-wrap gap-2">
                {quickActions.map((a, i) => (
                  <Link key={a.to} to={a.to} className={i === 0 ? btnPrimary : btnSecondary}>
                    {a.label}
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-64 xl:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
