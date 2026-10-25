import type { AuditOp } from "../../shared/audit";
import type { Customer } from "../../customers";
import type { Booking } from "../domain/booking";
import type { Service } from "../domain/service";

export interface ServiceReader {
  get(bizId: string, id: string): Promise<Service | null>;
  list(bizId: string): Promise<Service[]>;
}

export interface BookingReader {
  get(bizId: string, id: string): Promise<Booking | null>;
  /** Bookings that start before `to` and end after `from`, any status. */
  listBetween(bizId: string, from: number, to: number): Promise<Booking[]>;
}

export type BookingOp =
  | { readonly kind: "service.save"; readonly service: Service }
  | { readonly kind: "booking.save"; readonly booking: Booking }
  | { readonly kind: "slots.claim"; readonly staffId: string; readonly blocks: readonly number[]; readonly bookingId: string }
  | { readonly kind: "slots.release"; readonly staffId: string; readonly blocks: readonly number[] }
  | { readonly kind: "customer.save"; readonly customer: Customer }
  | AuditOp;
