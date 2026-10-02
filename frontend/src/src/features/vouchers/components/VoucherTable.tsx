// src/features/vouchers/components/VoucherTable.tsx
//
// Content per doc04 §7 Voucher list: code/status, plan, activation, expiry,
// association. "Codes not unnecessarily re-exposed" — only maskedCode is
// ever rendered here; full codes are shown once, at generation time, by
// BulkVoucherWizard's result step.

import type { Voucher } from "../../../types/voucher";
import { VoucherStatusBadge } from "./VoucherStatusBadge";

interface VoucherTableProps {
  vouchers: Voucher[];
  onOpen: (voucher: Voucher) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function VoucherTable({ vouchers, onOpen }: VoucherTableProps) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--foreground-secondary)]">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr
                key={v.id}
                className="cursor-pointer border-b border-[var(--border)] text-[var(--foreground)] last:border-b-0 hover:bg-[var(--surface-elevated)]"
                onClick={() => onOpen(v)}
              >
                <td className="px-4 py-3 font-mono text-xs">{v.maskedCode}</td>
                <td className="px-4 py-3">{v.planName}</td>
                <td className="px-4 py-3">
                  <VoucherStatusBadge status={v.status} />
                </td>
                <td className="px-4 py-3 text-[var(--foreground-secondary)]">
                  {formatDate(v.issuedAt)}
                </td>
                <td className="px-4 py-3 text-[var(--foreground-secondary)]">
                  {formatDate(v.expiresAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 sm:hidden">
        {vouchers.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onOpen(v)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-[var(--foreground)]">{v.maskedCode}</span>
                <VoucherStatusBadge status={v.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--foreground-secondary)]">
                <span>{v.planName}</span>
                <span>Issued {formatDate(v.issuedAt)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
