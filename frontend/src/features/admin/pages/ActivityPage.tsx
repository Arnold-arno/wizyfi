// Route: /admin/activity — PlatformActivityEvent: coarse, safe messages only
// (deliberately not the organization's own audit log).

import { useState } from "react";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { formatDateTime } from "../../../lib/format";
import type { PlatformActivity } from "../../../types/admin";
import { usePlatformActivity } from "../hooks/useAdmin";

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = usePlatformActivity(page);

  const columns: Column<PlatformActivity>[] = [
    { key: "when", header: "When", mobile: "title", cell: (a) => formatDateTime(a.createdAt) },
    { key: "agent", header: "Agent", cell: (a) => a.organizationName },
    { key: "message", header: "What happened", cell: (a) => a.message },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform activity" description="Actions taken on agent accounts by platform staff." />
      {isLoading && <TableSkeleton columns={3} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load activity."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState title="No activity yet" description="Suspensions, restorations and plan changes will be listed here." />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Platform activity" rows={data.results} columns={columns} rowKey={(a) => a.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
