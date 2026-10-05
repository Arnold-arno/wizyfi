// Route: /admin/agents. The server returns an unpaginated array of
// allow-listed fields (id, name, status, placeCount, planName, createdAt), so
// search and status filtering are client-side. Fine for hundreds of agents;
// paginate the endpoint before thousands (see DELIVERY_NOTES).

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { inputClass } from "../../../components/ui/styles";
import { formatDateTime, formatNumber } from "../../../lib/format";
import type { AgentListItem, AgentStatus } from "../../../types/admin";
import { useAgents } from "../hooks/useAdmin";

type Filter = AgentStatus | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];

export function AgentsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useAgents();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Filter>("ALL");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (a) => (status === "ALL" || a.status === status) && (!q || a.name.toLowerCase().includes(q))
    );
  }, [data, search, status]);

  const columns: Column<AgentListItem>[] = [
    { key: "name", header: "Agent", mobile: "title", cell: (a) => a.name },
    { key: "plan", header: "Plan", cell: (a) => a.planName ?? "No plan" },
    { key: "places", header: "Networks", align: "right", cell: (a) => formatNumber(a.placeCount) },
    { key: "created", header: "Joined", cell: (a) => formatDateTime(a.createdAt) },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (a) => (
        <StatusBadge label={a.status === "ACTIVE" ? "Active" : "Suspended"} tone={a.status === "ACTIVE" ? "success" : "danger"} />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agents"
        description="Account-level information only. Network names, credentials and customer data are never shown here."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          aria-label="Search agents by name"
          placeholder="Search agents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} sm:max-w-xs`}
        />
        <FilterChips label="Filter by status" options={FILTERS} value={status} onChange={setStatus} />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load agents."} onRetry={() => refetch()} />}
      {data && rows.length === 0 && (
        <EmptyState
          title={data.length === 0 ? "No agents yet" : "No agents match"}
          description={data.length === 0 ? "Agent accounts appear here once organizations sign up." : "Try a different search or status."}
        />
      )}
      {rows.length > 0 && (
        <DataTable caption="Agents" rows={rows} columns={columns} rowKey={(a) => a.id} onRowOpen={(a) => navigate(`/admin/agents/${a.id}`)} />
      )}
    </div>
  );
}
