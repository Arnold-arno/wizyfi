// Route: /admin/agents (supadmin §8). Account-level information only: identity,
// status, plan, networks used vs the plan limit, last active. The server returns
// an unpaginated allow-listed array, so search/filter/sort are client-side
// (fine for hundreds; paginate the endpoint before thousands).
// Spec column "Amount due" is omitted: there is no billing model yet.

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
import { timeAgo } from "../../../lib/relativeTime";
import type { AgentListItem, AgentStatus } from "../../../types/admin";
import { useAgents } from "../hooks/useAdmin";

type Filter = AgentStatus | "ALL";
type Sort = "name" | "networks" | "active" | "joined";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];

const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export function AgentsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useAgents();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("name");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter((a) => (status === "ALL" || a.status === status) && (!q || a.name.toLowerCase().includes(q)));
    const by: Record<Sort, (a: AgentListItem, b: AgentListItem) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      networks: (a, b) => b.placeCount - a.placeCount,
      active: (a, b) => ts(b.lastActiveAt) - ts(a.lastActiveAt),
      joined: (a, b) => ts(b.createdAt) - ts(a.createdAt),
    };
    return [...list].sort(by[sort]);
  }, [data, search, status, sort]);

  const columns: Column<AgentListItem>[] = [
    { key: "name", header: "Agent", mobile: "title", cell: (a) => a.name },
    { key: "plan", header: "Plan", cell: (a) => a.planName ?? "No plan" },
    {
      key: "networks", header: "Networks", align: "right",
      cell: (a) => (a.maxPlaces === null ? `${formatNumber(a.placeCount)} / ∞` : `${formatNumber(a.placeCount)} / ${formatNumber(a.maxPlaces)}`),
    },
    { key: "active", header: "Last active", cell: (a) => (a.lastActiveAt ? timeAgo(a.lastActiveAt) : "Never") },
    { key: "created", header: "Joined", cell: (a) => formatDateTime(a.createdAt) },
    {
      key: "status", header: "Status", mobile: "badge",
      cell: (a) => <StatusBadge label={a.status === "ACTIVE" ? "Active" : "Suspended"} tone={a.status === "ACTIVE" ? "success" : "danger"} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agents"
        description="Account-level information only. Network names, credentials and customer data are never shown here."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input aria-label="Search agents by name" placeholder="Search agents" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} sm:w-64`} />
          <select aria-label="Sort agents" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputClass} sm:w-48`}>
            <option value="name">Sort: name</option>
            <option value="networks">Sort: most networks</option>
            <option value="active">Sort: recently active</option>
            <option value="joined">Sort: newest</option>
          </select>
        </div>
        <FilterChips label="Filter by status" options={FILTERS} value={status} onChange={setStatus} />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load agents."} onRetry={() => refetch()} />}
      {data && rows.length === 0 && (
        <EmptyState
          title={data.length === 0 ? "No agents yet" : "No agents match"}
          description={data.length === 0 ? "Agent accounts appear here once organizations sign up." : "Try a different search or status."}
        />
      )}
      {rows.length > 0 && (
        <>
          <DataTable caption="Agents" rows={rows} columns={columns} rowKey={(a) => a.id} onRowOpen={(a) => navigate(`/admin/agents/${a.id}`)} />
          <p className="text-xs text-[var(--foreground-muted)]">{rows.length} of {data?.length ?? 0} agents</p>
        </>
      )}
    </div>
  );
}
