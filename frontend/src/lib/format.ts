// Display helpers. Money arrives from DRF as decimal strings; it is only ever
// converted to Number for display/charting, never for arithmetic that is
// persisted.

export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat().format(n) : "—";
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null
): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (currency && /^[A-Za-z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: currency.toUpperCase() === "UGX" ? 0 : 2,
      }).format(n);
    } catch {
      /* unknown currency code — fall through to plain number */
    }
  }
  return new Intl.NumberFormat().format(n);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function weekdayShort(isoDate: string): string {
  // isoDate is a UTC calendar day; parse as UTC so it never shifts a day.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}
