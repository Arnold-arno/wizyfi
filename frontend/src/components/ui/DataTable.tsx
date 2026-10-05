// Operational table contract (doc05 §6): identity + status first, desktop is a
// dense table, mobile transforms rows into cards that keep identity / status /
// time / action (doc02 §8) — it does not just shrink the table.

import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Where this column lands in the mobile card. Default: "detail". */
  mobile?: "title" | "badge" | "detail" | "hidden";
}

interface DataTableProps<T> {
  caption: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Makes the first column a real button (keyboard-reachable) and the row clickable. */
  onRowOpen?: (row: T) => void;
}

export function DataTable<T>({ caption, rows, columns, rowKey, onRowOpen }: DataTableProps<T>) {
  const title = columns.find((c) => c.mobile === "title") ?? columns[0];
  const badge = columns.find((c) => c.mobile === "badge");
  const details = columns.filter((c) => c !== title && c !== badge && c.mobile !== "hidden");

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--foreground-secondary)]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                className={`border-b border-[var(--border)] text-[var(--foreground)] last:border-b-0 hover:bg-[var(--surface-elevated)] focus-within:bg-[var(--surface-elevated)] ${
                  onRowOpen ? "cursor-pointer" : ""
                }`}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {i === 0 && onRowOpen ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowOpen(row);
                        }}
                        className="text-left font-medium text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        {c.cell(row)}
                      </button>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 sm:hidden" aria-label={caption}>
        {rows.map((row) => {
          const content = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-[var(--foreground)]">{title.cell(row)}</span>
                {badge && badge.cell(row)}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {details.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-[var(--foreground-muted)]">{c.header}</dt>
                    <dd className="text-right text-[var(--foreground-secondary)]">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          const cls = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left";
          return (
            <li key={rowKey(row)}>
              {onRowOpen ? (
                <button
                  type="button"
                  onClick={() => onRowOpen(row)}
                  className={`${cls} focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]`}
                >
                  {content}
                </button>
              ) : (
                <div className={cls}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
