// src/features/vouchers/pages/VouchersPage.tsx
//
// Route: /app/vouchers (doc04 §2). Covers list/issue/bulk/detail per the
// route inventory, and doc04 §12 universal state matrix.

import { useState } from "react";
import { useVouchers } from "../hooks/useVouchers";
import { VoucherTable } from "../components/VoucherTable";
import { BulkVoucherWizard } from "../components/BulkVoucherWizard";
import { VoucherDetailDrawer } from "../components/VoucherDetailDrawer";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import type { Voucher, VoucherStatus } from "../../../types/voucher";
import { usePermissions } from "../../../hooks/usePermissions"; // reconcile with existing permission hook

const STATUS_FILTERS: Array<{ label: string; value: VoucherStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Issued", value: "ISSUED" },
  { label: "Redeemed", value: "REDEEMED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Revoked", value: "REVOKED" },
];

export function VouchersPage() {
  const { hasPermission } = usePermissions();
  const canIssue = hasPermission("vouchers:issue");
  const canRevoke = hasPermission("vouchers:revoke");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VoucherStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);

  const { data, isLoading, isError, error, refetch } = useVouchers({
    page,
    search: search || undefined,
    status: status === "ALL" ? undefined : status,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[24px] font-bold text-[var(--foreground)]">Vouchers</h1>
          {canIssue && (
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              Generate vouchers
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Issue and track redeemable access codes tied to a plan.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search vouchers"
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

      {isLoading && <TableSkeleton columns={5} />}

      {isError && (
        <ErrorState
          message={error instanceof Error ? error.message : "Could not load vouchers."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="No vouchers yet"
          description="Generate a batch of vouchers for one of your access plans."
          action={
            canIssue && (
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
              >
                Generate vouchers
              </button>
            )
          }
        />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <>
          <VoucherTable vouchers={data.results} onOpen={(v) => setSelectedVoucher(v)} />
          <div className="flex items-center justify-between text-sm text-[var(--foreground-secondary)]">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!data.previous}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data.next}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {wizardOpen && <BulkVoucherWizard onClose={() => setWizardOpen(false)} />}

      {selectedVoucher && (
        <VoucherDetailDrawer
          voucherId={selectedVoucher.id}
          canRevoke={canRevoke}
          onClose={() => setSelectedVoucher(null)}
        />
      )}
    </div>
  );
}
