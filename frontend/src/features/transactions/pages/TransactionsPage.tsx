// Route: /app/transactions — immutable, evidentiary ledger (doc04 §9).
// Strictly read-only: the backend exposes no create/update/delete here.
// Optional ?sale=<id> narrows the ledger to one sale (linked from Sales).

import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnSecondary } from "../../../components/ui/styles";
import { formatDateTime, formatMoney, shortId } from "../../../lib/format";
import type { Transaction, TransactionStatus } from "../../../types/sales";
import { useTransactions } from "../hooks/useTransactions";

type Filter = TransactionStatus | "ALL";

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Succeeded", value: "SUCCEEDED" },
  { label: "Refunded", value: "REFUNDED" },
  { label: "Failed", value: "FAILED" },
];

const STATUS: Record<TransactionStatus, { label: string; tone: Tone }> = {
  SUCCEEDED: { label: "Succeeded", tone: "success" },
  REFUNDED: { label: "Refunded", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
};

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sale = searchParams.get("sale") ?? undefined;

  const [status, setStatus] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useTransactions({
    page,
    sale,
    status: status === "ALL" ? undefined : status,
  });

  const columns: Column<Transaction>[] = [
    { key: "createdAt", header: "Recorded", mobile: "title", cell: (t) => formatDateTime(t.createdAt) },
    { key: "amount", header: "Amount", align: "right", cell: (t) => formatMoney(t.amount, t.currency) },
    { key: "reference", header: "Reference", cell: (t) => t.reference || "—" },
    { key: "sale", header: "Sale", cell: (t) => <span className="font-mono text-xs">{shortId(t.sale)}</span> },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (t) => <StatusBadge label={STATUS[t.status].label} tone={STATUS[t.status].tone} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="The payment ledger. Entries are permanent evidence and can't be edited or deleted."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          label="Filter by status"
          options={FILTERS}
          value={status}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        />
        {sale && (
          <div className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
            <span>
              Showing sale <span className="font-mono">{shortId(sale)}</span>
            </span>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setPage(1);
                setSearchParams({});
              }}
            >
              Show all
            </button>
          </div>
        )}
      </div>

      {isLoading && <TableSkeleton columns={5} />}

      {isError && (
        <ErrorState message={error instanceof Error ? error.message : "Could not load transactions."} onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="No transactions found"
          description={
            sale || status !== "ALL"
              ? "Nothing matches these filters."
              : "Transactions appear here automatically when you record a sale."
          }
        />
      )}

      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Transactions" rows={data.results} columns={columns} rowKey={(t) => t.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
    </div>
  );
}
