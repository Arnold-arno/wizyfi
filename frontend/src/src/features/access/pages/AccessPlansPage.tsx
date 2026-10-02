// src/features/access/pages/AccessPlansPage.tsx
//
// Route: /app/access-plans (doc04 §2 route inventory).
// Covers doc04 §12 universal state matrix: loading / empty / error / success.
// Create/edit gated by permission per doc07 (frontend guard is UX-only;
// backend remains the authority).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlans } from "../hooks/usePlans";
import { PlanTable } from "../components/PlanTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import type { AccessPlan, AccessPlanStatus } from "../../../types/accessPlan";
import { usePermissions } from "../../../hooks/usePermissions"; // reconcile with existing permission hook

const STATUS_FILTERS: Array<{ label: string; value: AccessPlanStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
  { label: "Paused", value: "PAUSED" },
  { label: "Archived", value: "ARCHIVED" },
];

export function AccessPlansPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("access_plans:create");
  const canEdit = hasPermission("access_plans:edit");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccessPlanStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = usePlans({
    page,
    search: search || undefined,
    status: status === "ALL" ? undefined : status,
  });

  const openPlan = (plan: AccessPlan) => navigate(`/app/access-plans/${plan.id}`);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[24px] font-bold text-[var(--foreground)]">Access plans</h1>
          {canCreate && (
            <button
              type="button"
              onClick={() => navigate("/app/access-plans/new")}
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              Create plan
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Define price, duration and limits for the access products customers can buy.
        </p>
      </header>

      {/* Search/filter controls sit above the table, not in a menu (doc04 §3) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search plans"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setPage(1);
                setStatus(f.value);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                status === f.value
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <TableSkeleton columns={6} />}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load access plans."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="No access plans yet"
          description="Create your first plan to start selling access on the captive portal."
          action={
            canCreate && (
              <button
                type="button"
                onClick={() => navigate("/app/access-plans/new")}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
              >
                Create plan
              </button>
            )
          }
        />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <>
          <PlanTable plans={data.results} canEdit={canEdit} onOpen={openPlan} />
          <PaginationBar
            page={page}
            hasNext={Boolean(data.next)}
            hasPrevious={Boolean(data.previous)}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function PaginationBar({
  page,
  hasNext,
  hasPrevious,
  onChange,
}: {
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm text-[var(--foreground-secondary)]">
      <span>Page {page}</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasPrevious}
          onClick={() => onChange(page - 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => onChange(page + 1)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
