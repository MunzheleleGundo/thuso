/**
 * Time helpers. Instants are epoch milliseconds (UTC). Businesses work in local time,
 * described by a fixed UTC offset in minutes (South Africa: +120, no daylight saving).
 * Local dates are "YYYY-MM-DD" strings and local times are "HH:mm" strings.
 */
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function isLocalDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isLocalTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Instant for a local date + minutes after local midnight. */
export function localToInstant(localDate: string, minutes: number, offsetMinutes: number): number {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) + minutes * MINUTE - offsetMinutes * MINUTE;
}

export function instantToLocalDate(instant: number, offsetMinutes: number): string {
  return new Date(instant + offsetMinutes * MINUTE).toISOString().slice(0, 10);
}

export function instantToLocalTime(instant: number, offsetMinutes: number): string {
  return new Date(instant + offsetMinutes * MINUTE).toISOString().slice(11, 16);
}

export function weekdayOf(localDate: string): Weekday {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(js + 6) % 7]!;
}

export function startOfLocalDay(instant: number, offsetMinutes: number): number {
  return localToInstant(instantToLocalDate(instant, offsetMinutes), 0, offsetMinutes);
}

export function addDaysLocal(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

export function formatLocalDateTime(instant: number, offsetMinutes: number): string {
  const date = new Date(instant + offsetMinutes * MINUTE);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}, ${instantToLocalTime(instant, offsetMinutes)}`;
}
