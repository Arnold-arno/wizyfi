// Route: /app/sales — the analytical view (doc04 §9). Evidence lives on the
// Transactions page; each sale links to its ledger entries.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../../../components/ui/Dialog";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { StatCard } from "../../../components/ui/StatCard";
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnDanger, btnGhost, btnPrimary } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import type { Sale, SaleStatus } from "../../../types/sales";
import { RecordSaleDialog } from "../components/RecordSaleDialog";
import { useRefundSale, useSales, useSalesSummary } from "../hooks/useSales";

type Filter = SaleStatus | "ALL";

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Refunded", value: "REFUNDED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const SALE_STATUS: Record<SaleStatus, { label: string; tone: Tone }> = {
  COMPLETED: { label: "Completed", tone: "success" },
  REFUNDED: { label: "Refunded", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export function SalesPage() {
  const { hasPermission } = usePermissions();
  const canRecord = hasPermission("sales:create"); // the backend also gates refunds on sales:create
  const canSeeLedger = hasPermission("transactions:view");

  const [status, setStatus] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [refunding, setRefunding] = useState<Sale | null>(null);

  const summary = useSalesSummary();
  const { data, isLoading, isError, error, refetch } = useSales({
    page,
    status: status === "ALL" ? undefined : status,
  });

  const columns: Column<Sale>[] = [
    { key: "soldAt", header: "Sold", mobile: "title", cell: (s) => formatDateTime(s.soldAt) },
    { key: "total", header: "Amount", align: "right", cell: (s) => formatMoney(s.total, s.currency) },
    { key: "plan", header: "Plan", cell: (s) => s.accessPlanName ?? "—" },
    { key: "place", header: "Place", cell: (s) => s.placeName ?? "—" },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (s) => <StatusBadge label={SALE_STATUS[s.status].label} tone={SALE_STATUS[s.status].tone} />,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (s) => (
        <span className="flex flex-wrap justify-end gap-3 text-sm">
          {canSeeLedger && (
            <Link
              to={`/app/transactions?sale=${s.id}`}
              className="text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Ledger
            </Link>
          )}
          {canRecord && s.status === "COMPLETED" && (
            <button
              type="button"
              onClick={() => setRefunding(s)}
              className="text-[var(--danger)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Refund
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sales"
        description="Analytical view of what you've sold. Evidence of each payment is on Transactions."
        actions={
          canRecord && (
            <button type="button" className={btnPrimary} onClick={() => setRecording(true)}>
              Record sale
            </button>
          )
        }
      />

      <section aria-label="Sales summary" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total sales" value={summary.data ? formatNumber(summary.data.totalSales) : "—"} hint="All statuses" />
        <StatCard
          label="Revenue (completed)"
          value={summary.data ? formatNumber(summary.data.totalRevenue) : "—"}
          hint="Sum of completed sales, not split by currency"
        />
        <StatCard label="Refunded" value={summary.data ? formatNumber(summary.data.refundedCount) : "—"} hint="Sales refunded" />
      </section>

      <FilterChips
        label="Filter by status"
        options={FILTERS}
        value={status}
        onChange={(v) => {
          setPage(1);
          setStatus(v);
        }}
      />

      {isLoading && <TableSkeleton columns={6} />}

      {isError && (
        <ErrorState message={error instanceof Error ? error.message : "Could not load sales."} onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title={status === "ALL" ? "No sales yet" : "No sales with this status"}
          description={
            status === "ALL"
              ? "Record a sale when a customer pays you, and it will appear here."
              : "Try a different status filter."
          }
          action={
            status === "ALL" && canRecord ? (
              <button type="button" className={btnPrimary} onClick={() => setRecording(true)}>
                Record sale
              </button>
            ) : undefined
          }
        />
      )}

      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Sales" rows={data.results} columns={columns} rowKey={(s) => s.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}

      {recording && <RecordSaleDialog onClose={() => setRecording(false)} />}
      {refunding && <RefundDialog sale={refunding} onClose={() => setRefunding(null)} />}
    </div>
  );
}

function RefundDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const refund = useRefundSale();
  return (
    <Dialog
      title="Refund this sale?"
      description={`${formatMoney(sale.total, sale.currency)} sold ${formatDateTime(sale.soldAt)}${
        sale.accessPlanName ? ` · ${sale.accessPlanName}` : ""
      }`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={refund.isPending}
            onClick={() => refund.mutate(sale.id, { onSuccess: onClose })}
          >
            {refund.isPending ? "Refunding…" : "Refund sale"}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--foreground-secondary)]">
        This marks the sale as refunded and adds a refund entry to the transaction ledger. It can't be undone.
      </p>
      {refund.error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {refund.error instanceof Error ? refund.error.message : "Could not refund this sale."}
        </p>
      )}
    </Dialog>
  );
}
