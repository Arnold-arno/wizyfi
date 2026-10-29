export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const firstName = (fullName: string | undefined | null): string =>
  (fullName ?? "").trim().split(/\s+/)[0] || "there";
