// src/components/ui/TableSkeleton.tsx
//
// Per doc02 §7: skeletons should match page structure, not replace the
// whole page. Used by PlanTable / VoucherTable while data is loading.

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 6, columns = 5 }: TableSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="grid gap-4 border-b border-[var(--border)] px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-3 w-2/3 animate-pulse rounded bg-[var(--border)]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-4 border-b border-[var(--border)] px-4 py-4 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-3 animate-pulse rounded bg-[var(--border)]"
              style={{ width: c === 0 ? "80%" : "50%" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
