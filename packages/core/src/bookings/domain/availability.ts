import { DAY, localToInstant, minutesOfDay, MINUTE, weekdayOf } from "../../shared/time";
import type { WorkingSchedule } from "../../workspace";
import { overlaps } from "./booking";

export interface BusyInterval {
  readonly startAt: number;
  readonly endAt: number;
}

export interface AvailabilityQuery {
  readonly schedule: WorkingSchedule;
  readonly utcOffsetMinutes: number;
  readonly localDate: string; // "YYYY-MM-DD"
  readonly durationMinutes: number;
  readonly busy: readonly BusyInterval[];
  readonly now: number;
  /** Ignore notice and advance limits (the owner booking someone in by hand). */
  readonly ownerOverride?: boolean;
}

/**
 * Free start times for a service on a local date: inside working hours, respecting
 * minimum notice and booking horizon, and not overlapping any busy interval.
 */
export function availableStarts(q: AvailabilityQuery): number[] {
  const day = q.schedule.days[weekdayOf(q.localDate)];
  if (!day.open) return [];
  const open = minutesOfDay(day.from);
  const close = minutesOfDay(day.to);
  const step = q.schedule.slotStepMinutes;
  const dur = q.durationMinutes;
  const earliest = q.ownerOverride ? -Infinity : q.now + q.schedule.minNoticeMinutes * MINUTE;
  const latest = q.ownerOverride ? Infinity : q.now + q.schedule.maxAdvanceDays * DAY;
  const out: number[] = [];
  for (let m = open; m + dur <= close; m += step) {
    const start = localToInstant(q.localDate, m, q.utcOffsetMinutes);
    const end = start + dur * MINUTE;
    if (start < earliest || start > latest) continue;
    if (q.busy.some((b) => overlaps(start, end, b.startAt, b.endAt))) continue;
    out.push(start);
  }
  return out;
}

/** Is this exact start time bookable? Used to re-check right before writing. */
export function isWithinHours(schedule: WorkingSchedule, offset: number, localDate: string, startAt: number, durationMinutes: number): boolean {
  const day = schedule.days[weekdayOf(localDate)];
  if (!day.open) return false;
  const open = localToInstant(localDate, minutesOfDay(day.from), offset);
  const close = localToInstant(localDate, minutesOfDay(day.to), offset);
  return startAt >= open && startAt + durationMinutes * MINUTE <= close;
}
