// Route: /app/network-cycles — planned operating periods per Place (doc04 §8).
// A cycle is informational scheduling only: it never triggers a hard logout
// (doc00 §4 independence rule). Times are entered in the place's time zone.
import { useState } from "react";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnDanger, btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { ApiError } from "../../../lib/api/client";
import type { CycleStatus, NetworkCycle } from "../../../lib/api/directoryApi";
import { formatDateTime } from "../../../lib/format";
import { usePlaceOptions } from "../../network/hooks/useNetwork";
import { useCreateCycle, useCycles, useDeleteCycle } from "../../directory/hooks";

type Filter = CycleStatus | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];
const STATUS: Record<CycleStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  COMPLETED: { label: "Completed", tone: "muted" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export function NetworkCyclesPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("network_cycles:manage");
  const [status, setStatus] = useState<Filter>("ALL");
  const [place, setPlace] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<NetworkCycle | null>(null);

  const places = usePlaceOptions();
  const placeName = (id: string) => places.data?.results.find((p) => p.id === id)?.name ?? "Unknown place";
  const { data, isLoading, isError, error, refetch } = useCycles({
    page, place: place || undefined, status: status === "ALL" ? undefined : status,
  });

  const columns: Column<NetworkCycle>[] = [
    { key: "name", header: "Cycle", mobile: "title", cell: (c) => c.name || "Untitled cycle" },
    { key: "place", header: "Place", cell: (c) => placeName(c.place) },
    { key: "starts", header: "Starts", cell: (c) => formatDateTime(c.startsAt) },
    { key: "ends", header: "Ends", cell: (c) => formatDateTime(c.endsAt) },
    { key: "status", header: "Status", mobile: "badge", cell: (c) => <StatusBadge label={STATUS[c.status].label} tone={STATUS[c.status].tone} /> },
    {
      key: "actions", header: "Actions",
      cell: (c) => canManage && (
        <button type="button" onClick={() => setRemoving(c)} className="text-sm text-[var(--danger-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
          Delete
        </button>
      ),
    },
  ];
  const filtered = status !== "ALL" || place !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Network cycles"
        description="Plan when each Place operates. Cycles are for planning only and never disconnect anyone."
        actions={canManage && <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New cycle</button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select aria-label="Filter by place" value={place} onChange={(e) => { setPage(1); setPlace(e.target.value); }} className={`${inputClass} sm:max-w-xs`}>
          <option value="">All places</option>
          {places.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <FilterChips label="Filter by status" options={FILTERS} value={status} onChange={(v) => { setPage(1); setStatus(v); }} />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load cycles."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title={filtered ? "No cycles match" : "No network cycles yet"}
          description={filtered ? "Try a different place or status." : "Create a cycle to plan an operating period for a Place."}
          action={!filtered && canManage ? <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New cycle</button> : undefined}
        />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Network cycles" rows={data.results} columns={columns} rowKey={(c) => c.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {removing && <RemoveDialog cycle={removing} placeName={placeName(removing.place)} onClose={() => setRemoving(null)} />}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCycle();
  const places = usePlaceOptions();
  const [placeId, setPlaceId] = useState("");
  const [name, setName] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");

  const startMs = starts ? new Date(starts).getTime() : NaN;
  const endMs = ends ? new Date(ends).getTime() : NaN;
  const orderOk = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const valid = placeId !== "" && orderOk;
  const fe = create.error instanceof ApiError ? create.error.fieldErrors : undefined;
  const general = create.error && !fe ? (create.error instanceof Error ? create.error.message : "Could not create the cycle.") : null;

  return (
    <Dialog
      title="New network cycle"
      description="The end must be after the start. Times use your browser's time zone."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button
            type="button" className={btnPrimary} disabled={!valid || create.isPending}
            onClick={() => create.mutate({ place: placeId, name: name.trim(), startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() }, { onSuccess: onClose })}
          >
            {create.isPending ? "Creating…" : "Create cycle"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Place" error={fe?.place?.[0]}>
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={inputClass}>
            <option value="">Select a place</option>
            {places.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Name (optional)" error={fe?.name?.[0]}><input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Starts" error={fe?.startsAt?.[0]}><input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} /></Field>
          <Field label="Ends" error={fe?.endsAt?.[0] ?? fe?.ends_at?.[0]}><input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={inputClass} /></Field>
        </div>
        {starts && ends && !orderOk && <p role="alert" className="text-sm text-[var(--danger-text)]">The end must be after the start.</p>}
        {general && <p role="alert" className="text-sm text-[var(--danger-text)]">{general}</p>}
      </div>
    </Dialog>
  );
}

function RemoveDialog({ cycle, placeName, onClose }: { cycle: NetworkCycle; placeName: string; onClose: () => void }) {
  const del = useDeleteCycle();
  return (
    <Dialog
      title="Delete this cycle?"
      description={`${cycle.name || "Untitled cycle"} · ${placeName} · ${formatDateTime(cycle.startsAt)} → ${formatDateTime(cycle.endsAt)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Keep it</button>
          <button type="button" className={btnDanger} disabled={del.isPending} onClick={() => del.mutate(cycle.id, { onSuccess: onClose })}>
            {del.isPending ? "Deleting…" : "Delete cycle"}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--foreground-secondary)]">This only removes the planned period. No one is disconnected and no sessions change. This can't be undone.</p>
      {del.error && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{del.error instanceof Error ? del.error.message : "Could not delete."}</p>}
    </Dialog>
  );
}
