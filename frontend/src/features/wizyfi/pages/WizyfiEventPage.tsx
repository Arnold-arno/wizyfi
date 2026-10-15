// Route: /app/hard-logout/:eventId — event detail. Lifecycle comes from the
// backend only; counts are real, there is NO invented progress percentage
// (doc02 §6 "Running"). Partial and failed outcomes are never hidden.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Dialog } from "../../../components/ui/Dialog";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StatCard } from "../../../components/ui/StatCard";
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import { btnDanger, btnGhost, inputClass } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatDateTime, shortId } from "../../../lib/format";
import { formatInZone } from "../../../lib/wizyfiTime";
import type { TargetStatus } from "../../../types/wizyfi";
import { Countdown } from "../components/Countdown";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { useCancelHardLogout, useHardLogoutEvent, usePlacesLite, useRoutersLite } from "../hooks/useWizyfi";

const TARGET: Record<TargetStatus, { label: string; tone: Tone }> = {
  ATTEMPTED: { label: "In progress", tone: "warning" },
  SUCCEEDED: { label: "Succeeded", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export function WizyfiEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { hasPermission } = usePermissions();
  const canCancel = hasPermission("hard_logout:cancel");
  const { data: event, isLoading, isError, error, refetch } = useHardLogoutEvent(eventId);
  const places = usePlacesLite();
  const routers = useRoutersLite(event?.place);
  const [cancelling, setCancelling] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !event) {
    return <ErrorState message={error instanceof Error ? error.message : "Could not load this event."} onRetry={() => refetch()} />;
  }

  const placeName = places.data?.results.find((p) => p.id === event.place)?.name ?? "Unknown place";
  const routerName = (id: string) => routers.data?.results.find((r) => r.id === id)?.name ?? shortId(id);

  const timeline: Array<{ label: string; at: string | null; detail?: string }> = [
    { label: "Scheduled", at: event.createdAt },
    { label: "Started", at: event.startedAt },
    { label: event.status === "CANCELLED" ? "Cancelled" : "Finished", at: event.cancelledAt ?? event.completedAt, detail: event.cancelReason || undefined },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/hard-logout/history" className="text-sm text-[var(--primary)] hover:underline">
        ← History
      </Link>
      <PageHeader
        title={`Hard logout · ${placeName}`}
        description={`Event ${shortId(event.id)} · ${formatInZone(event.scheduledAt, event.scheduledTimezone)}`}
        actions={
          <>
            <EventStatusBadge status={event.status} />
            {event.status === "SCHEDULED" && canCancel && (
              <button type="button" className={btnDanger} onClick={() => setCancelling(true)}>
                Cancel event
              </button>
            )}
          </>
        }
      />

      {event.status === "SCHEDULED" && (
        <Panel title="Time remaining" description="The server runs this even if you close the browser.">
          <p className="text-2xl font-bold text-[var(--foreground)]">
            <Countdown target={event.scheduledAt} />
          </p>
        </Panel>
      )}
      {event.status === "RUNNING" && (
        <p role="status" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)]">
          Running now. Results below update as routers report back.
        </p>
      )}
      {(event.status === "PARTIAL" || event.status === "FAILED") && (
        <div role="alert" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--warning)]">
          <p>
            {event.status === "PARTIAL"
              ? "Some routers were disconnected and some were not. See the failed targets below."
              : event.targetResults.length === 0
                ? "Nobody was disconnected by this event."
                : "No router completed the disconnect. See the reasons below."}
          </p>
          {event.failureReason && <p className="mt-1 text-[var(--foreground)]">{event.failureReason}</p>}
        </div>
      )}
      {event.attemptCount > 1 && event.status === "RUNNING" && (
        <p role="status" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground-secondary)]">
          A worker stopped part-way and this event was resumed (attempt {event.attemptCount}). Routers already finished are not repeated.
        </p>
      )}

      <section aria-label="Outcome" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Routers succeeded" value={event.succeededCount} />
        <StatCard label="Routers failed" value={event.failedCount} />
        <StatCard
          label="Estimated impact"
          value={event.impactEstimateConnections ?? "—"}
          hint="Connections when scheduled — an estimate"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Lifecycle">
          <ol className="space-y-3 text-sm">
            {timeline.map((t) => (
              <li key={t.label} className="flex items-start justify-between gap-3">
                <span className="text-[var(--foreground-secondary)]">{t.label}</span>
                <span className="text-right text-[var(--foreground)]">
                  {t.at ? formatDateTime(t.at) : "—"}
                  {t.detail && <span className="block text-xs text-[var(--foreground-muted)]">Reason: {t.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Per-router results">
          {event.targetResults.length === 0 ? (
            <p className="text-sm text-[var(--foreground-secondary)]">
              {event.status === "SCHEDULED" ? "Targets are resolved when the event runs." : "No routers were targeted."}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {event.targetResults.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">{routerName(t.router)}</p>
                    {t.errorMessage && <p className="text-xs text-[var(--danger)]">{t.errorMessage}</p>}
                  </div>
                  <StatusBadge label={TARGET[t.status].label} tone={TARGET[t.status].tone} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {cancelling && <CancelDialog id={event.id} onClose={() => setCancelling(false)} />}
    </div>
  );
}

function CancelDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const cancel = useCancelHardLogout();
  const [reason, setReason] = useState("");
  return (
    <Dialog
      title="Cancel this hard logout?"
      description="No one will be disconnected by this event. This can't be undone — schedule a new one if needed."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Keep it
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ id, reason: reason.trim() }, { onSuccess: onClose })}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel event"}
          </button>
        </>
      }
    >
      <Field label="Reason (recorded in the audit log)">
        <textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      </Field>
      {cancel.error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {cancel.error instanceof Error ? cancel.error.message : "Could not cancel."}
        </p>
      )}
    </Dialog>
  );
}

