// Route: /app/places — doc04 §5 Places list: name, status, router count,
// active connections; search/filter above the table; server-side pagination.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnPrimary, inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatNumber } from "../../../lib/format";
import type { Place, PlaceStatus } from "../../../types/network";
import { PlaceStatusBadge } from "../../network/components/badges";
import { usePlaces } from "../../network/hooks/useNetwork";

type Filter = PlaceStatus | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Setting up", value: "SETUP" },
  { label: "Archived", value: "ARCHIVED" },
];

export function PlacesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("places:create");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = usePlaces({
    page,
    search: q || undefined,
    status: status === "ALL" ? undefined : status,
  });

  const columns: Column<Place>[] = [
    { key: "name", header: "Place", mobile: "title", cell: (p) => p.name },
    { key: "routers", header: "Routers", align: "right", cell: (p) => formatNumber(p.routerCount) },
    { key: "active", header: "Active connections", align: "right", cell: (p) => formatNumber(p.activeConnectionCount) },
    { key: "tz", header: "Time zone", cell: (p) => p.timezone },
    { key: "status", header: "Status", mobile: "badge", cell: (p) => <PlaceStatusBadge status={p.status} /> },
  ];

  const filtered = q !== "" || status !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Places"
        description="Locations where you run networks. Open a place to see its routers and connections."
        actions={
          canCreate && (
            <Link to="/app/places/new" className={btnPrimary}>
              Add place
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          aria-label="Search places by name"
          placeholder="Search places"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className={`${inputClass} sm:max-w-xs`}
        />
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

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load places."} onRetry={() => refetch()} />}

      {data && data.results.length === 0 && (
        <EmptyState
          title={filtered ? "No places match" : "No places yet"}
          description={filtered ? "Try a different search or status." : "Add your first place, then connect a router to it."}
          action={
            !filtered && canCreate ? (
              <Link to="/app/places/new" className={btnPrimary}>
                Add place
              </Link>
            ) : undefined
          }
        />
      )}

      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Places" rows={data.results} columns={columns} rowKey={(p) => p.id} onRowOpen={(p) => navigate(`/app/places/${p.id}`)} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
