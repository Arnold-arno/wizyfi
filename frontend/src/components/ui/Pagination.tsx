import { btnSecondary } from "./styles";

interface PaginationProps {
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  total?: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, hasNext, hasPrevious, total, onChange }: PaginationProps) {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between text-sm text-[var(--foreground-secondary)]"
    >
      <span>
        Page {page}
        {total !== undefined && ` · ${total.toLocaleString()} total`}
      </span>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} disabled={!hasPrevious} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button type="button" className={btnSecondary} disabled={!hasNext} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
