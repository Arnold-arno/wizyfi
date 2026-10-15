// Route: /app/connections — Live Connections (doc04 §6): user/device, place,
// router, plan, start, remaining, status, authorised disconnect.
//
// Honesty rules (doc00 §4, doc03 §6):
//  * polls every 15 s and shows "Updated hh:mm"; a failed refresh keeps the
//    last data but says so — stale data is never presented as live;
//  * the backend does not yet expire sessions automatically, so a session
//    still ACTIVE past its expiry is labelled "Past expiry" instead of
//    showing a fake countdown.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnDanger, btnGhost, btnSecondary, inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useNow } from "../../../hooks/useNow";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatDateTime, formatTime } from "../../../lib/format";
import { formatRemaining } from "../../../lib/wizyfiTime";
import type { Session, SessionStatus } from "../../../types/network";
import { SessionStatusBadge } from "../../network/components/badges";
import { useDisconnectSession, usePlaceOptions, useSessions } from "../../network/hooks/useNetwork";

type Filter = SessionStatus | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "Active", value: "ACTIVE" },
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Expiring", value: "EXPIRING" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Disconnected", value: "DISCONNECTED" },
  { label: "Failed", value: "FAILED" },
];
const LIVE: ReadonlySet<SessionStatus> = new Set<SessionStatus>(["ACTIVE", "EXPIRING"]);

function remaining(s: Session, now: number): string {
  if (!LIVE.has(s.status)) return "—";
  if (!s.expiresAt) return "No limit";
  const ms = new Date(s.expiresAt).getTime() - now;
  return ms <= 0 ? "Past expiry" : formatRemaining(ms);
}

export function ConnectionsPage() {
  const { hasPermission } = usePermissions();
  const canDisconnect = hasPermission("connections:disconnect");
  const [params, setParams] = useSearchParams();
  const place = params.get("place") ?? "";
  const [status, setStatus] = useState<Filter>("ACTIVE");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Session | null>(null);
  const now = useNow(15_000);

  const places = usePlaceOptions();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useSessions(
    { page, status: status === "ALL" ? undefined : status, place: place || undefined, search: q || undefined },
    { pollMs: 15_000 }
  );

  const columns: Column<Session>[] = [
    { key: "user", header: "User / device", mobile: "title", cell: (s) => s.customerLabel },
    { key: "place", header: "Place", cell: (s) => s.placeName ?? "—" },
    { key: "router", header: "Router", cell: (s) => s.routerName ?? "—" },
    { key: "plan", header: "Plan", cell: (s) => s.accessPlanName ?? "—" },
    { key: "started", header: "Started", cell: (s) => formatDateTime(s.startedAt) },
    { key: "remaining", header: "Remaining", align: "right", cell: (s) => remaining(s, now) },
    { key: "status", header: "Status", mobile: "badge", cell: (s) => <SessionStatusBadge status={s.status} /> },
    {
      key: "actions",
      header: "Actions",
      cell: (s) =>
        canDisconnect && LIVE.has(s.status) ? (
          <button type="button" className={`${btnSecondary} !px-3 !py-1.5`} onClick={() => setTarget(s)}>
            Disconnect
          </button>
        ) : null,
    },
  ];

  const filtered = q !== "" || place !== "" || status !== "ACTIVE";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Live connections"
        description="Who is connected right now. Disconnect ends one specific session."
        actions={
          <span className="text-xs text-[var(--foreground-muted)]" aria-live="polite">
            {isFetching ? "Refreshing…" : `Updated ${formatTime(dataUpdatedAt)}`}
          </span>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            aria-label="Search by name or MAC address"
            placeholder="Search by name or MAC"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className={`${inputClass} sm:max-w-xs`}
          />
          <select
            aria-label="Filter by place"
            value={place}
            onChange={(e) => {
              setPage(1);
              setParams(e.target.value ? { place: e.target.value } : {});
            }}
            className={`${inputClass} sm:max-w-xs`}
          >
            <option value="">All places</option>
            {places.data?.results.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <FilterChips
          label="Filter by status"
          options={FILTERS}
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        />
      </div>

      {isLoading && <TableSkeleton columns={7} />}
      {isError && !data && (
        <ErrorState message={error instanceof Error ? error.message : "Could not load connections."} onRetry={() => refetch()} />
      )}
      {isError && data && (
        <p role="alert" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--warning)]">
          Couldn't refresh. Showing the last known data from {formatTime(dataUpdatedAt)} — it may be out of date.
        </p>
      )}

      {data && data.results.length === 0 && (
        <EmptyState
          title={filtered ? "No connections match" : "No one is connected"}
          description={filtered ? "Try a different status, place or search." : "Active sessions appear here as users connect."}
        />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Live connections" rows={data.results} columns={columns} rowKey={(s) => s.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}

      {target && <DisconnectDialog session={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

// doc02 §7 destructive contract: exact object, scope, consequence, cancel/confirm.
function DisconnectDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const disconnect = useDisconnectSession();
  return (
    <Dialog
      title="Disconnect this session?"
      description="This ends one session on the router right now."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate(session.id, { onSuccess: onClose })}
          >
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-[var(--foreground-secondary)]">User / device</dt>
        <dd className="text-[var(--foreground)]">{session.customerLabel}</dd>
        <dt className="text-[var(--foreground-secondary)]">Place</dt>
        <dd className="text-[var(--foreground)]">{session.placeName ?? "—"}</dd>
        <dt className="text-[var(--foreground-secondary)]">Router</dt>
        <dd className="text-[var(--foreground)]">{session.routerName ?? "—"}</dd>
        <dt className="text-[var(--foreground-secondary)]">Plan</dt>
        <dd className="text-[var(--foreground)]">{session.accessPlanName ?? "—"}</dd>
        <dt className="text-[var(--foreground-secondary)]">Started</dt>
        <dd className="text-[var(--foreground)]">{formatDateTime(session.startedAt)}</dd>
      </dl>
      <p className="mt-4 text-sm text-[var(--foreground-secondary)]">
        The user loses access immediately. They only get back online if your access rules let them — a voucher that
        was already redeemed can't be redeemed again.
      </p>
      {disconnect.error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {disconnect.error instanceof Error ? disconnect.error.message : "Could not disconnect."} The session was not marked disconnected.
        </p>
      )}
    </Dialog>
  );
}
