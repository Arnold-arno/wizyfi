// Route: /app/hard-logout/history — doc04 §10 "History".
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { formatInZone } from "../../../lib/wizyfiTime";
import type { HardLogoutEvent, HardLogoutScope, HardLogoutStatus } from "../../../types/wizyfi";
import { EventStatusBadge } from "../components/EventStatusBadge";
import { useHardLogoutEvents, usePlacesLite } from "../hooks/useWizyfi";

type Filter = HardLogoutStatus | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Running", value: "RUNNING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];
const SCOPE: Record<HardLogoutScope, string> = { ROUTER: "One router", ROUTERS: "Selected routers", PLACE: "Whole place" };

export function WizyfiHistoryPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useHardLogoutEvents({
    page,
    status: status === "ALL" ? undefined : status,
  });
  const places = usePlacesLite();
  const placeName = (id: string) => places.data?.results.find((p) => p.id === id)?.name ?? "Unknown place";

  const columns: Column<HardLogoutEvent>[] = [
    { key: "when", header: "Scheduled for", mobile: "title", cell: (e) => formatInZone(e.scheduledAt, e.scheduledTimezone) },
    { key: "place", header: "Place", cell: (e) => placeName(e.place) },
    { key: "scope", header: "Scope", cell: (e) => SCOPE[e.scopeType] },
    { key: "result", header: "Succeeded / failed", align: "right", cell: (e) => `${e.succeededCount} / ${e.failedCount}` },
    { key: "status", header: "Status", mobile: "badge", cell: (e) => <EventStatusBadge status={e.status} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Wizyfi history" description="Every hard logout, with its exact outcome. Records are permanent." />
      <FilterChips
        label="Filter by status"
        options={FILTERS}
        value={status}
        onChange={(v) => {
          setPage(1);
          setStatus(v);
        }}
      />
      {isLoading && <TableSkeleton columns={5} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load history."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title="No events found"
          description={status === "ALL" ? "Scheduled and finished hard logouts appear here." : "No events with this status."}
        />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Hard logout events" rows={data.results} columns={columns} rowKey={(e) => e.id} onRowOpen={(e) => navigate(`/app/hard-logout/${e.id}`)} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
