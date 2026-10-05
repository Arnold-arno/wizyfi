import { formatNumber } from "../../lib/format";

export interface RankedItem {
  id: string;
  label: string;
  value: number;
}

export function RankedBars({ items, unit }: { items: RankedItem[]; unit: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-[var(--foreground)]">{item.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--foreground-secondary)]">
              {formatNumber(item.value)} {unit}
            </span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
