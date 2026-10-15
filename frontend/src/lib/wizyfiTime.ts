// Wall-clock time in an IANA zone -> exact UTC instant, with no date library.
// doc03 §9: "exact date/time and explicit timezone". Known limit: a wall time
// that doesn't exist (spring-forward gap) or occurs twice (fall-back) resolves
// to one of the two valid instants; the review step shows the UTC result.

function zoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/** date "YYYY-MM-DD", time "HH:mm". Returns an Invalid Date for bad input. */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return new Date(NaN);
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const first = guess - zoneOffsetMs(timeZone, guess);
    return new Date(guess - zoneOffsetMs(timeZone, first));
  } catch {
    return new Date(NaN); // unknown time zone
  }
}

export function formatInZone(iso: string, timeZone: string): string {
  try {
    return `${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone })} (${timeZone})`;
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}
