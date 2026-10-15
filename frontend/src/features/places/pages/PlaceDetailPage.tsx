// Route: /app/places/:placeId — doc04 §5 Place detail: identity, health,
// routers, connections. Setup flow: add router -> Test connection -> Activate.
// Router "last seen" is shown with its age and flagged when stale (doc03 §6).

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StatCard } from "../../../components/ui/StatCard";
import { btnDanger, btnGhost, btnPrimary, btnSecondary } from "../../../components/ui/styles";
import { useNow } from "../../../hooks/useNow";
import { usePermissions } from "../../../hooks/usePermissions";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime, formatNumber, formatTime } from "../../../lib/format";
import { isStale, timeAgo } from "../../../lib/relativeTime";
import type { HealthResult, Router } from "../../../types/network";
import { PlaceStatusBadge, RouterStatusBadge } from "../../network/components/badges";
import { usePlace, useRouters, useTestConnection, useUpdatePlace } from "../../network/hooks/useNetwork";
import { AddRouterDialog } from "../components/AddRouterDialog";
import { PlaceForm } from "../components/PlaceForm";

type Modal = "edit" | "archive" | "router" | null;

export function PlaceDetailPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("places:edit");
  const canSeeRouters = hasPermission("routers:view");
  const canManageRouters = hasPermission("routers:manage");
  const canManageConnectors = hasPermission("connectors:manage");

  const place = usePlace(placeId);
  const routers = useRouters(placeId, canSeeRouters);
  const update = useUpdatePlace(placeId ?? "");
  const test = useTestConnection();
  const now = useNow();
  const [modal, setModal] = useState<Modal>(null);
  const [results, setResults] = useState<Record<string, HealthResult | string>>({});

  if (place.isLoading) return <Skeleton className="h-64 w-full" />;
  if (place.isError || !place.data) {
    return <ErrorState message={place.error instanceof Error ? place.error.message : "Could not load this place."} onRetry={() => place.refetch()} />;
  }
  const p = place.data;
  const routerList = routers.data?.results ?? [];
  const onlineCount = routerList.filter((r) => r.status === "ONLINE").length;

  const runTest = (r: Router) =>
    test.mutate(r.id, {
      onSuccess: (res) => setResults((cur) => ({ ...cur, [r.id]: res })),
      onError: (e) => setResults((cur) => ({ ...cur, [r.id]: e instanceof Error ? e.message : "Test failed." })),
    });

  const activate = () => update.mutate({ status: "ACTIVE" });
  const updateError = update.error instanceof ApiError ? (update.error.fieldErrors?.status?.[0] ?? update.error.message) : update.error instanceof Error ? update.error.message : null;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/places" className="text-sm text-[var(--primary)] hover:underline">
        ← Places
      </Link>
      <PageHeader
        title={p.name}
        description={`${p.timezone}${p.address ? ` · ${p.address}` : ""}`}
        actions={
          <>
            <PlaceStatusBadge status={p.status} />
            {canEdit && (
              <button type="button" className={btnSecondary} onClick={() => setModal("edit")}>
                Edit
              </button>
            )}
            {canEdit && p.status === "SETUP" && (
              <button type="button" className={btnPrimary} disabled={update.isPending} onClick={activate}>
                {update.isPending ? "Activating…" : "Activate place"}
              </button>
            )}
            {canEdit && p.status === "ARCHIVED" && (
              <button type="button" className={btnPrimary} disabled={update.isPending} onClick={activate}>
                Restore to active
              </button>
            )}
            {canEdit && p.status !== "ARCHIVED" && (
              <button type="button" className={btnDanger} onClick={() => setModal("archive")}>
                Archive
              </button>
            )}
          </>
        }
      />

      {updateError && (
        <p role="alert" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--danger)]">
          {updateError}
        </p>
      )}
      {p.status === "SETUP" && (
        <p role="status" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground-secondary)]">
          This place is being set up. Add a router, run <span className="font-medium text-[var(--foreground)]">Test connection</span> until it
          shows Online, then activate the place.
        </p>
      )}

      <section aria-label="Place figures" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Routers" value={formatNumber(p.routerCount)} hint={canSeeRouters ? `${onlineCount} online` : undefined} />
        <StatCard
          label="Active connections"
          value={formatNumber(p.activeConnectionCount)}
          to={hasPermission("connections:view") ? `/app/connections?place=${p.id}` : undefined}
          hint="Open live connections"
        />
        <StatCard label="Created" value={formatDateTime(p.createdAt)} />
      </section>

      {canSeeRouters && (
        <Panel
          title="Routers"
          description="Status is reported by the backend. Last seen shows how fresh it is."
          action={
            canManageRouters && (
              <button type="button" className={btnPrimary} onClick={() => setModal("router")}>
                Add router
              </button>
            )
          }
        >
          {routers.isLoading && <Skeleton className="h-20 w-full" />}
          {routers.isError && <ErrorState message="Could not load routers." onRetry={() => routers.refetch()} />}
          {routers.data && routerList.length === 0 && (
            <EmptyState title="No routers yet" description="Add a router so this place can connect users." />
          )}
          {routerList.length > 0 && (
            <ul className="divide-y divide-[var(--border)]">
              {routerList.map((r) => {
                const res = results[r.id];
                const stale = isStale(r.lastSeenAt, 15, now);
                return (
                  <li key={r.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--foreground)]">{r.name}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{r.identity}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs">
                          <RouterStatusBadge status={r.status} />
                          <p className={`mt-1 ${stale ? "text-[var(--warning)]" : "text-[var(--foreground-muted)]"}`}>
                            Last seen {timeAgo(r.lastSeenAt, now)}
                            {stale && r.lastSeenAt ? " (stale)" : ""}
                          </p>
                        </div>
                        {canManageRouters && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={r.status === "DISABLED" || (test.isPending && test.variables === r.id)}
                            onClick={() => runTest(r)}
                          >
                            {test.isPending && test.variables === r.id ? "Testing…" : "Test connection"}
                          </button>
                        )}
                      </div>
                    </div>
                    {res !== undefined && (
                      <p role="status" className={`text-xs ${typeof res === "string" || !res.healthy ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                        {typeof res === "string"
                          ? res
                          : `${res.healthy ? "Healthy" : "Unhealthy"}${res.latencyMs !== null ? ` · ${res.latencyMs} ms` : ""} · checked ${formatTime(new Date(res.checkedAt).getTime())} — ${res.detail}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {modal === "edit" && <EditDialog placeId={p.id} initial={{ name: p.name, timezone: p.timezone, address: p.address }} onClose={() => setModal(null)} />}
      {modal === "archive" && <ArchiveDialog placeName={p.name} placeId={p.id} onClose={() => setModal(null)} />}
      {modal === "router" && <AddRouterDialog placeId={p.id} canManageConnectors={canManageConnectors} onClose={() => setModal(null)} />}
    </div>
  );
}

function EditDialog({ placeId, initial, onClose }: { placeId: string; initial: { name: string; timezone: string; address: string }; onClose: () => void }) {
  const update = useUpdatePlace(placeId);
  const fe = update.error instanceof ApiError ? update.error.fieldErrors : undefined;
  const general = update.error && !fe ? (update.error instanceof Error ? update.error.message : "Could not save.") : null;
  return (
    <Dialog title="Edit place" onClose={onClose}>
      <PlaceForm
        initial={initial}
        submitLabel="Save changes"
        submitting={update.isPending}
        fieldErrors={fe}
        generalError={general}
        onSubmit={(input) => update.mutate(input, { onSuccess: onClose })}
        onCancel={onClose}
      />
    </Dialog>
  );
}

function ArchiveDialog({ placeId, placeName, onClose }: { placeId: string; placeName: string; onClose: () => void }) {
  const navigate = useNavigate();
  const update = useUpdatePlace(placeId);
  return (
    <Dialog
      title={`Archive ${placeName}?`}
      description="The place is marked Archived and left out of dashboard counts. Its routers, sessions and history are kept, and you can restore it later."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={update.isPending}
            onClick={() => update.mutate({ status: "ARCHIVED" }, { onSuccess: () => navigate("/app/places") })}
          >
            {update.isPending ? "Archiving…" : "Archive place"}
          </button>
        </>
      }
    >
      {update.error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {update.error instanceof Error ? update.error.message : "Could not archive."}
        </p>
      )}
    </Dialog>
  );
}
