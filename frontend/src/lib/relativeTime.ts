// Freshness helpers (doc03 §6): stale data must be distinguishable from live.

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function isStale(iso: string | null | undefined, maxMinutes = 15, now = Date.now()): boolean {
  if (!iso) return true;
  return now - new Date(iso).getTime() > maxMinutes * 60_000;
}
