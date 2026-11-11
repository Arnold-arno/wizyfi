// Route: /admin/agents (supadmin §8). Account-level information only: identity, status,
// plan, places vs the plan limit, billing, last active. Network names, credentials and
// customer data are never returned by the API.
// CHANGED (Round 23): server-side pagination, search, status filter and ordering
// (the endpoint is paginated since backend Round 20), billing columns.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import { timeAgo } from "../../../lib/relativeTime";
import type { AgentListItem, AgentStatus } from "../../../types/admin";
import { SubscriptionBadge } from "../components/SubscriptionBadge";
import { useAgents } from "../hooks/useAdmin";

type Filter = AgentStatus | "ALL";
type Sort = "name" | "networks" | "active" | "joined";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];
// Allow-listed on the server; never an arbitrary client string.
const ORDERING: Record<Sort, string> = {
  name: "name",
  networks: "-place_count",
  active: "-last_active",
  joined: "-created_at",
};

export function AgentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("name");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useAgents({
    page,
    search: q || undefined,
    status: status === "ALL" ? undefined : status,
    ordering: ORDERING[sort],
  });

  const columns: Column<AgentListItem>[] = [
    { key: "name", header: "Agent", mobile: "title", cell: (a) => a.name },
    { key: "plan", header: "Plan", cell: (a) => a.planName ?? "No plan" },
    {
      key: "places", header: "Places", align: "right",
      cell: (a) => (a.maxPlaces === null ? `${formatNumber(a.placeCount)} / ∞` : `${formatNumber(a.placeCount)} / ${formatNumber(a.maxPlaces)}`),
    },
    { key: "billing", header: "Subscription", cell: (a) => <SubscriptionBadge status={a.subscriptionStatus} /> },
    {
      key: "due", header: "Amount due", align: "right",
      cell: (a) =>
        Number(a.amountDue) > 0 ? (
          <span className="font-medium text-[var(--danger-text)]">{formatMoney(a.amountDue, "USD")}</span>
        ) : (
          "—"
        ),
    },
    { key: "active", header: "Last active", cell: (a) => (a.lastActiveAt ? timeAgo(a.lastActiveAt) : "Never") },
    { key: "created", header: "Joined", cell: (a) => formatDateTime(a.createdAt) },
    {
      key: "status", header: "Status", mobile: "badge",
      cell: (a) => <StatusBadge label={a.status === "ACTIVE" ? "Active" : "Suspended"} tone={a.status === "ACTIVE" ? "success" : "danger"} />,
    },
  ];

  const filtered = q !== "" || status !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agents"
        description="Account-level information only. Network names, credentials and customer data are never shown here."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="Search agents by name" placeholder="Search agents" value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            className={`${inputClass} sm:w-64`}
          />
          <select
            aria-label="Sort agents" value={sort}
            onChange={(e) => { setPage(1); setSort(e.target.value as Sort); }}
            className={`${inputClass} sm:w-52`}
          >
            <option value="name">Sort: name</option>
            <option value="networks">Sort: most places</option>
            <option value="active">Sort: recently active</option>
            <option value="joined">Sort: newest</option>
          </select>
        </div>
        <FilterChips label="Filter by status" options={FILTERS} value={status} onChange={(v) => { setPage(1); setStatus(v); }} />
      </div>

      {isLoading && <TableSkeleton columns={8} />}
      {isError && !data && <ErrorState message={error instanceof Error ? error.message : "Could not load agents."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title={filtered ? "No agents match" : "No agents yet"}
          description={filtered ? "Try a different search or status." : "Agent accounts appear here once organizations sign up."}
        />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Agents" rows={data.results} columns={columns} rowKey={(a) => a.id} onRowOpen={(a) => navigate(`/admin/agents/${a.id}`)} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
