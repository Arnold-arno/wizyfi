// Route: /app/audit — who did what, and when. Append-only: this page can only
// read. Metadata is already redacted server-side (no secrets are ever stored).
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { auditApi, type ActorType, type AuditEvent } from "../../../lib/api/auditApi";
import { formatDateTime, shortId } from "../../../lib/format";
import { useSessionStore } from "../../../state/sessionStore";

type Filter = ActorType | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Staff", value: "STAFF" },
  { label: "System", value: "SYSTEM" },
  { label: "Customers", value: "CUSTOMER" },
];

const humanize = (action: string) => {
  const [area, ...rest] = action.split(".");
  const text = `${area.replace(/_/g, " ")} · ${rest.join(" ").replace(/_/g, " ")}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const summarize = (meta: Record<string, unknown>) =>
  Object.entries(meta)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");

export function AuditLogPage() {
  const orgId = useSessionStore((s) => s.activeOrganizationId);
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [actor, setActor] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit", orgId, page, q, actor],
    queryFn: () => auditApi.list({ page, search: q || undefined, actorType: actor === "ALL" ? undefined : actor }),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });

  const columns: Column<AuditEvent>[] = [
    { key: "when", header: "When", mobile: "title", cell: (e) => formatDateTime(e.createdAt) },
    { key: "action", header: "Action", cell: (e) => humanize(e.action) },
    { key: "actor", header: "By", cell: (e) => e.actorEmail ?? (e.actorType === "SYSTEM" ? "System" : e.actorType === "CUSTOMER" ? "Customer" : "—") },
    { key: "resource", header: "Resource", cell: (e) => <span className="text-xs">{e.resourceType} <span className="font-mono">{shortId(e.resourceId)}</span></span> },
    { key: "details", header: "Details", mobile: "hidden", cell: (e) => <span className="text-xs text-[var(--foreground-secondary)]">{summarize(e.metadata) || "—"}</span> },
  ];
  const filtered = q !== "" || actor !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Activity log" description="A permanent record of important actions in your organization. Entries can't be edited or deleted." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input aria-label="Search by action or resource ID" placeholder="Search action or resource ID" value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }} className={`${inputClass} sm:max-w-sm`} />
        <FilterChips label="Filter by who acted" options={FILTERS} value={actor} onChange={(v) => { setPage(1); setActor(v); }} />
      </div>
      {isLoading && <TableSkeleton columns={5} />}
      {isError && !data && <ErrorState message={error instanceof Error ? error.message : "Could not load the activity log."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState title={filtered ? "No entries match" : "Nothing recorded yet"} description={filtered ? "Try a different search or filter." : "Hard logouts, voucher revocations and similar actions are recorded here."} />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Activity log" rows={data.results} columns={columns} rowKey={(e) => e.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
