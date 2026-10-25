import type { Cents } from "../../shared/money";
import { err, ok, type Result } from "../../shared/result";
import { MINUTE } from "../../shared/time";

export type BookingStatus = "requested" | "confirmed" | "completed" | "cancelled" | "no_show";

export const ACTIVE_STATUSES: readonly BookingStatus[] = ["requested", "confirmed"];

export interface Booking {
  readonly id: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly priceCents: Cents;
  readonly depositCents: Cents;
  readonly depositPaid: boolean;
  readonly staffId: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly status: BookingStatus;
  readonly source: "owner" | "public";
  readonly notes: string;
  readonly invoiceId: string | null;
  /** The slot-lock blocks this booking holds. Released when it is cancelled. */
  readonly lockBlocks: readonly number[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** In version 1 every business has one calendar. Staff calendars arrive with team support. */
export const DEFAULT_STAFF = "main";

const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(b: Booking, to: BookingStatus, now: number): Result<Booking> {
  if (!canTransition(b.status, to)) return err("invalid_state", `A ${label(b.status).toLowerCase()} booking cannot be marked ${label(to).toLowerCase()}.`);
  if (to === "completed" && b.startAt > now) return err("invalid_state", "You can only complete a booking once it has started.");
  return ok({ ...b, status: to, updatedAt: now, lockBlocks: to === "cancelled" ? [] : b.lockBlocks });
}

export function label(s: BookingStatus): string {
  return { requested: "Requested", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" }[s];
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export const durationOf = (b: Pick<Booking, "startAt" | "endAt">) => Math.round((b.endAt - b.startAt) / MINUTE);
