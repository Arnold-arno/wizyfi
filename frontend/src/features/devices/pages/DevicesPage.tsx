// Route: /app/devices — doc04 §6: identifier, router, place, last update;
// server-side pagination. Devices are observed, never typed in, so there is no
// create button. "Last seen" carries its age and a stale flag (doc03 §6).
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnGhost, inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useNow } from "../../../hooks/useNow";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatDateTime } from "../../../lib/format";
import { isStale, timeAgo } from "../../../lib/relativeTime";
import type { Device } from "../../../types/network";
import { SessionStatusBadge } from "../../network/components/badges";
import { useDevices, usePlaceOptions, useSessions } from "../../network/hooks/useNetwork";

export function DevicesPage() {
  const [params, setParams] = useSearchParams();
  const place = params.get("place") ?? "";
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Device | null>(null);
  const now = useNow();

  const places = usePlaceOptions();
  const { data, isLoading, isError, error, refetch } = useDevices({ page, search: q || undefined, place: place || undefined });

  const columns: Column<Device>[] = [
    { key: "device", header: "Device", mobile: "title", cell: (d) => d.hostname || d.macAddress },
    { key: "mac", header: "MAC address", cell: (d) => <span className="font-mono text-xs">{d.macAddress}</span> },
    { key: "place", header: "Place", cell: (d) => d.placeName ?? "—" },
    { key: "router", header: "Router", cell: (d) => d.routerName ?? "—" },
    {
      key: "seen",
      header: "Last seen",
      mobile: "badge",
      cell: (d) => (
        <span className={isStale(d.lastSeenAt, 60, now) ? "text-[var(--warning)]" : ""}>
          {timeAgo(d.lastSeenAt, now)}
          {d.lastSeenAt && isStale(d.lastSeenAt, 60, now) ? " (stale)" : ""}
        </span>
      ),
    },
  ];

  const filtered = q !== "" || place !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Devices" description="Endpoints seen on your networks. Open a device to see its connection history." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          aria-label="Search devices by MAC address or hostname"
          placeholder="Search by MAC or hostname"
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

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load devices."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title={filtered ? "No devices match" : "No devices seen yet"}
          description={filtered ? "Try a different search or place." : "Devices appear here once users connect through a router."}
        />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Devices" rows={data.results} columns={columns} rowKey={(d) => d.id} onRowOpen={setOpen} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}

      {open && <DeviceDialog device={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DeviceDialog({ device, onClose }: { device: Device; onClose: () => void }) {
  const { hasPermission } = usePermissions();
  const canSessions = hasPermission("connections:view");
  const sessions = useSessions({ device: device.id, pageSize: 10 }, { enabled: canSessions });

  return (
    <Dialog
      title={device.hostname || device.macAddress}
      description="Device identity and its recent connections."
      onClose={onClose}
      footer={
        <button type="button" className={btnGhost} onClick={onClose}>
          Close
        </button>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-[var(--foreground-secondary)]">MAC address</dt>
        <dd className="font-mono text-xs text-[var(--foreground)]">{device.macAddress}</dd>
        <dt className="text-[var(--foreground-secondary)]">Hostname</dt>
        <dd className="text-[var(--foreground)]">{device.hostname || "—"}</dd>
        <dt className="text-[var(--foreground-secondary)]">Place</dt>
        <dd className="text-[var(--foreground)]">{device.placeName ?? "—"}</dd>
        <dt className="text-[var(--foreground-secondary)]">Router</dt>
        <dd className="text-[var(--foreground)]">{device.routerName ?? "—"}</dd>
        <dt className="text-[var(--foreground-secondary)]">Last seen</dt>
        <dd className="text-[var(--foreground)]">{formatDateTime(device.lastSeenAt)}</dd>
      </dl>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-[var(--foreground)]">Recent connections</h3>
      {!canSessions && <p className="text-sm text-[var(--foreground-secondary)]">Connection history isn't available for your role.</p>}
      {canSessions && sessions.isLoading && <p className="text-sm text-[var(--foreground-secondary)]">Loading…</p>}
      {canSessions && sessions.isError && <p className="text-sm text-[var(--danger)]">Couldn't load connection history.</p>}
      {sessions.data && sessions.data.results.length === 0 && (
        <p className="text-sm text-[var(--foreground-secondary)]">No connections recorded for this device.</p>
      )}
      {sessions.data && sessions.data.results.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {sessions.data.results.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-[var(--foreground)]">{s.accessPlanName ?? "No plan"}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{formatDateTime(s.startedAt)}</p>
              </div>
              <SessionStatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
