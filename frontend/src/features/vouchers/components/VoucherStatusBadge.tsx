// src/features/vouchers/components/VoucherStatusBadge.tsx

import type { VoucherStatus } from "../../../types/voucher";

const CONFIG: Record<VoucherStatus, { label: string; varName: string }> = {
  AVAILABLE: { label: "Available", varName: "--foreground-muted" },
  ISSUED: { label: "Issued", varName: "--info" },
  REDEEMED: { label: "Redeemed", varName: "--success" },
  EXPIRED: { label: "Expired", varName: "--warning" },
  REVOKED: { label: "Revoked", varName: "--danger" },
};

export function VoucherStatusBadge({ status }: { status: VoucherStatus }) {
  const { label, varName } = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-secondary)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(${varName})` }}
      />
      {label}
    </span>
  );
}
