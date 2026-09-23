// src/features/vouchers/components/VoucherDetailDrawer.tsx
//
// Detail drawer per doc04 "Voucher list/detail" — full lifecycle,
// association with plan, and revoke where the current state allows it.
// State transitions per doc08: AVAILABLE / ISSUED / REDEEMED / EXPIRED / REVOKED.

import { useVoucher, useRevokeVoucher } from "../hooks/useVouchers";
import { VoucherStatusBadge } from "./VoucherStatusBadge";
import { ErrorState } from "../../../components/ui/ErrorState";

interface VoucherDetailDrawerProps {
  voucherId: string;
  canRevoke: boolean;
  onClose: () => void;
}

const REVOCABLE_STATUSES = new Set(["AVAILABLE", "ISSUED"]);

export function VoucherDetailDrawer({
  voucherId,
  canRevoke,
  onClose,
}: VoucherDetailDrawerProps) {
  const { data: voucher, isLoading, isError } = useVoucher(voucherId);
  const revoke = useRevokeVoucher();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Voucher</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
          >
            Close
          </button>
        </div>

        {isLoading && <p className="text-sm text-[var(--foreground-secondary)]">Loading…</p>}
        {isError && <ErrorState message="Could not load this voucher." />}

        {voucher && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-[var(--foreground)]">
                {voucher.maskedCode}
              </span>
              <VoucherStatusBadge status={voucher.status} />
            </div>

            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-[var(--foreground-secondary)]">Plan</dt>
              <dd className="text-[var(--foreground)]">{voucher.planName}</dd>
              <dt className="text-[var(--foreground-secondary)]">Issued</dt>
              <dd className="text-[var(--foreground)]">{voucher.issuedAt ?? "—"}</dd>
              <dt className="text-[var(--foreground-secondary)]">Redeemed</dt>
              <dd className="text-[var(--foreground)]">{voucher.redeemedAt ?? "—"}</dd>
              <dt className="text-[var(--foreground-secondary)]">Expires</dt>
              <dd className="text-[var(--foreground)]">{voucher.expiresAt ?? "No expiry"}</dd>
            </dl>

            {canRevoke && REVOCABLE_STATUSES.has(voucher.status) && (
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(voucher.id)}
                className="rounded-md border border-[var(--danger)] px-4 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
              >
                {revoke.isPending ? "Revoking…" : "Revoke voucher"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
