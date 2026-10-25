import { err, ok, type Result } from "../../shared/result";
import { isLocalTime, minutesOfDay, WEEKDAYS, type Weekday } from "../../shared/time";

export interface DayHours {
  readonly open: boolean;
  readonly from: string; // "HH:mm"
  readonly to: string; // "HH:mm"
}

export interface WorkingSchedule {
  readonly days: Readonly<Record<Weekday, DayHours>>;
  /** How far apart bookable start times are, in minutes. */
  readonly slotStepMinutes: 15 | 30 | 60;
  /** Minimum notice for a new booking, in minutes. */
  readonly minNoticeMinutes: number;
  /** How far ahead customers may book, in days. */
  readonly maxAdvanceDays: number;
}

export const DEFAULT_SCHEDULE: WorkingSchedule = {
  days: {
    mon: { open: true, from: "08:00", to: "17:00" },
    tue: { open: true, from: "08:00", to: "17:00" },
    wed: { open: true, from: "08:00", to: "17:00" },
    thu: { open: true, from: "08:00", to: "17:00" },
    fri: { open: true, from: "08:00", to: "17:00" },
    sat: { open: true, from: "09:00", to: "14:00" },
    sun: { open: false, from: "09:00", to: "13:00" },
  },
  slotStepMinutes: 30,
  minNoticeMinutes: 60,
  maxAdvanceDays: 60,
};

export function validateSchedule(input: WorkingSchedule): Result<WorkingSchedule> {
  for (const d of WEEKDAYS) {
    const day = input.days[d];
    if (!day) return err("validation", `Missing hours for ${d}.`, { field: d });
    if (!isLocalTime(day.from) || !isLocalTime(day.to)) return err("validation", `Use the 24-hour format, for example 08:00.`, { field: d });
    if (day.open && minutesOfDay(day.to) <= minutesOfDay(day.from)) {
      return err("validation", `Closing time must be after opening time on ${dayName(d)}.`, { field: d });
    }
  }
  if (![15, 30, 60].includes(input.slotStepMinutes)) return err("validation", "Slot step must be 15, 30 or 60 minutes.");
  if (input.minNoticeMinutes < 0 || input.minNoticeMinutes > 7 * 24 * 60) return err("validation", "Minimum notice must be between 0 minutes and 7 days.");
  if (input.maxAdvanceDays < 1 || input.maxAdvanceDays > 365) return err("validation", "Customers can book between 1 and 365 days ahead.");
  if (!WEEKDAYS.some((d) => input.days[d].open)) return err("validation", "Open at least one day a week.");
  return ok(input);
}

export function dayName(d: Weekday): string {
  return { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" }[d];
}
