import { audit } from "../../shared/audit";
import { effect, type Effect, type Preview } from "../../shared/effect";
import type { Actor, Clock, IdGenerator, Writer } from "../../shared/ports";
import { err, ok, type Result } from "../../shared/result";
import { formatRand } from "../../shared/text";
import { DAY, formatLocalDateTime, instantToLocalDate, isLocalDate, MINUTE, startOfLocalDay } from "../../shared/time";
import { upsertCustomerFromBooking, type Customer, type CustomerInput, type CustomerReader } from "../../customers";
import { canManage, canWrite, isEnabled, type Business, type BusinessReader, type Role } from "../../workspace";
import { availableStarts, isWithinHours, type BusyInterval } from "../domain/availability";
import { ACTIVE_STATUSES, DEFAULT_STAFF, overlaps, transition, type Booking, type BookingStatus } from "../domain/booking";
import { buildService, type Service, type ServiceInput } from "../domain/service";
import { lockBlocks } from "../domain/slots";
import type { BookingOp, BookingReader, ServiceReader } from "./ports";

export interface BookingDeps {
  readonly businesses: BusinessReader;
  readonly services: ServiceReader;
  readonly bookings: BookingReader;
  readonly customers: CustomerReader;
  readonly writer: Writer<BookingOp>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CreateBookingCmd {
  readonly bizId: string;
  readonly actor: Actor;
  readonly role: Role;
  readonly customerId: string;
  readonly serviceId: string;
  readonly startAt: number;
  readonly notes?: string;
  /** Allow a time outside working hours (the owner squeezing someone in). */
  readonly outsideHours?: boolean;
}

interface Plan<T> {
  readonly preview: Preview<T>;
  readonly ops: BookingOp[];
}

export function busyFrom(bookings: readonly Booking[], exceptId?: string): BusyInterval[] {
  return bookings.filter((b) => ACTIVE_STATUSES.includes(b.status) && b.id !== exceptId).map((b) => ({ startAt: b.startAt, endAt: b.endAt }));
}

/** Free start times for a service on a local date. Shared by the app and the public booking page. */
export function computeAvailability(args: {
  business: Business; service: Service; localDate: string; bookingsThatDay: readonly Booking[]; now: number; ownerOverride?: boolean;
}): number[] {
  if (!args.business.schedule) return [];
  return availableStarts({
    schedule: args.business.schedule,
    utcOffsetMinutes: args.business.utcOffsetMinutes,
    localDate: args.localDate,
    durationMinutes: args.service.durationMinutes,
    busy: busyFrom(args.bookingsThatDay),
    now: args.now,
    ownerOverride: args.ownerOverride,
  });
}

/**
 * Pure planning for a new booking. Used by the in-app use case and by the server-side
 * public booking function (inside a Firestore transaction).
 */
export function planBooking(args: {
  id: string; business: Business; service: Service; customer: Customer; startAt: number; now: number;
  bookingsThatDay: readonly Booking[]; source: Booking["source"]; notes: string; outsideHours: boolean;
}): Result<{ booking: Booking; effects: Effect[] }> {
  const { business: biz, service: svc } = args;
  if (!isEnabled(biz.enabledModules, "bookings")) return err("module_disabled", "Bookings are switched off for this business.");
  if (!svc.active) return err("invalid_state", "This service is not being offered right now.");
  const endAt = args.startAt + svc.durationMinutes * MINUTE;
  const localDate = instantToLocalDate(args.startAt, biz.utcOffsetMinutes);
  if (args.source === "public") {
    if (!biz.schedule) return err("unavailable", "This business is not taking online bookings yet.");
    const free = computeAvailability({ business: biz, service: svc, localDate, bookingsThatDay: args.bookingsThatDay, now: args.now });
    if (!free.includes(args.startAt)) return err("conflict", "Sorry, that time was just taken. Please choose another time.");
  } else {
    if (args.startAt < args.now - DAY) return err("validation", "You cannot book a time that has already passed.");
    if (!args.outsideHours && biz.schedule && !isWithinHours(biz.schedule, biz.utcOffsetMinutes, localDate, args.startAt, svc.durationMinutes)) {
      return err("validation", "That time is outside your working hours. Tick 'Book outside working hours' to book it anyway.", { field: "startAt" });
    }
    const clash = busyFrom(args.bookingsThatDay).find((b) => overlaps(args.startAt, endAt, b.startAt, b.endAt));
    if (clash) return err("conflict", `That clashes with another booking at ${formatLocalDateTime(clash.startAt, biz.utcOffsetMinutes)}.`);
  }
  const needsDeposit = args.source === "public" && svc.depositCents > 0;
  const status: BookingStatus = needsDeposit ? "requested" : "confirmed";
  const booking: Booking = {
    id: args.id,
    customerId: args.customer.id,
    customerName: args.customer.name,
    serviceId: svc.id,
    serviceName: svc.name,
    priceCents: svc.priceCents,
    depositCents: svc.depositCents,
    depositPaid: false,
    staffId: DEFAULT_STAFF,
    startAt: args.startAt,
    endAt,
    status,
    source: args.source,
    notes: args.notes.trim().slice(0, 500),
    invoiceId: null,
    lockBlocks: lockBlocks(args.startAt, endAt),
    createdAt: args.now,
    updatedAt: args.now,
  };
  const when = formatLocalDateTime(args.startAt, biz.utcOffsetMinutes);
  const effects: Effect[] = [
    effect("booking", `Book ${svc.name}`, `${args.customer.name}, ${when} (${svc.durationMinutes} min), ${formatRand(svc.priceCents)}`),
  ];
  if (svc.depositCents > 0) effects.push(effect("money", "Deposit due", `${formatRand(svc.depositCents)} to secure the booking`));
  if (args.outsideHours) effects.push(effect("warning", "Outside working hours", "This time is outside your normal hours."));
  return ok({ booking, effects });
}

export function bookingOps(booking: Booking, actor: Actor, auditId: string, at: number, customer?: Customer): BookingOp[] {
  return [
    ...(customer ? [{ kind: "customer.save" as const, customer }] : []),
    { kind: "booking.save", booking },
    { kind: "slots.claim", staffId: booking.staffId, blocks: booking.lockBlocks, bookingId: booking.id },
    audit(auditId, at, actor, "booking.created", `Booked ${booking.serviceName} for ${booking.customerName}`, { bookingId: booking.id }),
  ];
}

/** Public booking: plan the customer upsert and the booking together. */
export function planPublicBooking(args: {
  bookingId: string; newCustomerId: string; business: Business; service: Service; existingCustomer: Customer | null;
  customerInput: CustomerInput; startAt: number; now: number; bookingsThatDay: readonly Booking[]; notes: string;
}): Result<{ booking: Booking; customer: Customer; ops: BookingOp[] }> {
  const customer = upsertCustomerFromBooking(args.existingCustomer, args.newCustomerId, args.customerInput, args.now);
  if (!customer.ok) return customer;
  const planned = planBooking({
    id: args.bookingId, business: args.business, service: args.service, customer: customer.value, startAt: args.startAt,
    now: args.now, bookingsThatDay: args.bookingsThatDay, source: "public", notes: args.notes, outsideHours: false,
  });
  if (!planned.ok) return planned;
  const actor = { uid: "public", name: customer.value.name };
  return ok({ booking: planned.value.booking, customer: customer.value, ops: bookingOps(planned.value.booking, actor, `${args.bookingId}-audit`, args.now, customer.value) });
}

export function makeBookingUseCases(d: BookingDeps) {
  async function bookingsOnDayOf(bizId: string, instant: number, offset: number): Promise<Booking[]> {
    const start = startOfLocalDay(instant, offset);
    return d.bookings.listBetween(bizId, start - DAY, start + 2 * DAY);
  }

  async function planCreate(cmd: CreateBookingCmd): Promise<Result<Plan<Booking>>> {
    if (!canWrite(cmd.role)) return err("forbidden", "Your role can view bookings but not create them.");
    const [biz, svc, customer] = await Promise.all([
      d.businesses.get(cmd.bizId), d.services.get(cmd.bizId, cmd.serviceId), d.customers.get(cmd.bizId, cmd.customerId),
    ]);
    if (!biz) return err("not_found", "We could not find this business.");
    if (!svc) return err("not_found", "Choose a service.", { field: "serviceId" });
    if (!customer) return err("not_found", "Choose a customer.", { field: "customerId" });
    const now = d.clock.now();
    const sameDay = await bookingsOnDayOf(cmd.bizId, cmd.startAt, biz.utcOffsetMinutes);
    const planned = planBooking({
      id: d.ids.next(), business: biz, service: svc, customer, startAt: cmd.startAt, now,
      bookingsThatDay: sameDay, source: "owner", notes: cmd.notes ?? "", outsideHours: !!cmd.outsideHours,
    });
    if (!planned.ok) return planned;
    return ok({ preview: { effects: planned.value.effects, draft: planned.value.booking }, ops: bookingOps(planned.value.booking, cmd.actor, d.ids.next(), now) });
  }

  async function changeStatus(bizId: string, actor: Actor, role: Role, id: string, to: BookingStatus): Promise<Result<Plan<Booking>>> {
    if (!canWrite(role)) return err("forbidden", "Your role cannot change bookings.");
    const [b, biz] = await Promise.all([d.bookings.get(bizId, id), d.businesses.get(bizId)]);
    if (!b || !biz) return err("not_found", "We could not find this booking.");
    const next = transition(b, to, d.clock.now());
    if (!next.ok) return next;
    const when = formatLocalDateTime(b.startAt, biz.utcOffsetMinutes);
    const effects: Effect[] = [effect("booking", `Mark as ${to === "no_show" ? "no-show" : to}`, `${b.serviceName} for ${b.customerName}, ${when}`)];
    const ops: BookingOp[] = [{ kind: "booking.save", booking: next.value }];
    if (to === "cancelled") {
      effects.push(effect("booking", "Free up the time slot", "Others can book this time again."));
      if (b.depositPaid) effects.push(effect("warning", "Deposit was paid", `Refund ${formatRand(b.depositCents)} to the customer yourself if your policy allows.`));
      ops.push({ kind: "slots.release", staffId: b.staffId, blocks: b.lockBlocks });
    }
    ops.push(audit(d.ids.next(), d.clock.now(), actor, `booking.${to}`, `${b.serviceName} for ${b.customerName} marked ${to}`, { bookingId: b.id }));
    return ok({ preview: { effects, draft: next.value }, ops });
  }

  async function planDeposit(bizId: string, role: Role, id: string): Promise<Result<Preview<Booking>>> {
    if (!canManage(role)) return err("forbidden", "Only the owner or an admin can record money received.");
    const b = await d.bookings.get(bizId, id);
    if (!b) return err("not_found", "We could not find this booking.");
    if (b.depositCents <= 0) return err("invalid_state", "This booking has no deposit.");
    if (b.depositPaid) return err("invalid_state", "The deposit is already recorded.");
    if (b.status !== "requested" && b.status !== "confirmed") return err("invalid_state", "This booking is closed.");
    const next: Booking = { ...b, depositPaid: true, status: "confirmed", updatedAt: d.clock.now() };
    const effects: Effect[] = [effect("money", `Record ${formatRand(b.depositCents)} deposit received`, `From ${b.customerName}. It will be counted on the invoice.`)];
    if (b.status === "requested") effects.push(effect("booking", "Confirm the booking", `${b.serviceName} for ${b.customerName}`));
    return ok({ effects, draft: next });
  }

  return {
    async saveService(bizId: string, actor: Actor, role: Role, id: string | null, input: ServiceInput): Promise<Result<Service>> {
      if (!canWrite(role)) return err("forbidden", "Your role cannot change services.");
      const existing = id ? await d.services.get(bizId, id) : null;
      if (id && !existing) return err("not_found", "We could not find this service.");
      const built = buildService(id ?? d.ids.next(), input, d.clock.now(), existing ?? undefined);
      if (!built.ok) return built;
      await d.writer.commit(bizId, [{ kind: "service.save", service: built.value }, audit(d.ids.next(), d.clock.now(), actor, id ? "service.updated" : "service.added", `${id ? "Updated" : "Added"} service ${built.value.name}`, { serviceId: built.value.id })]);
      return ok(built.value);
    },

    async availability(bizId: string, serviceId: string, localDate: string, ownerOverride = true): Promise<Result<number[]>> {
      if (!isLocalDate(localDate)) return err("validation", "Choose a date.");
      const [biz, svc] = await Promise.all([d.businesses.get(bizId), d.services.get(bizId, serviceId)]);
      if (!biz || !svc) return err("not_found", "We could not find this service.");
      const dayStart = startOfLocalDay(Date.parse(localDate + "T12:00:00Z"), biz.utcOffsetMinutes);
      const list = await d.bookings.listBetween(bizId, dayStart - DAY, dayStart + 2 * DAY);
      return ok(computeAvailability({ business: biz, service: svc, localDate, bookingsThatDay: list, now: d.clock.now(), ownerOverride }));
    },

    async previewCreate(cmd: CreateBookingCmd): Promise<Result<Preview<Booking>>> {
      const p = await planCreate(cmd);
      return p.ok ? ok(p.value.preview) : p;
    },

    async create(cmd: CreateBookingCmd): Promise<Result<Booking>> {
      const p = await planCreate(cmd);
      if (!p.ok) return p;
      await d.writer.commit(cmd.bizId, p.value.ops);
      return ok(p.value.preview.draft);
    },

    async previewStatus(bizId: string, actor: Actor, role: Role, id: string, to: BookingStatus): Promise<Result<Preview<Booking>>> {
      const p = await changeStatus(bizId, actor, role, id, to);
      return p.ok ? ok(p.value.preview) : p;
    },

    /** The deposit arrived (cash, EFT or a link the owner shared). Confirms a requested booking. */
    previewDepositPaid: (bizId: string, role: Role, id: string) => planDeposit(bizId, role, id),

    async setDepositPaid(bizId: string, actor: Actor, role: Role, id: string): Promise<Result<Booking>> {
      const p = await planDeposit(bizId, role, id);
      if (!p.ok) return p;
      const b = p.value.draft;
      await d.writer.commit(bizId, [{ kind: "booking.save", booking: b }, audit(d.ids.next(), d.clock.now(), actor, "booking.deposit_paid", `Deposit of ${formatRand(b.depositCents)} received from ${b.customerName}`, { bookingId: id })]);
      return ok(b);
    },

    async setStatus(bizId: string, actor: Actor, role: Role, id: string, to: Exclude<BookingStatus, "completed">): Promise<Result<Booking>> {
      const p = await changeStatus(bizId, actor, role, id, to);
      if (!p.ok) return p;
      await d.writer.commit(bizId, p.value.ops);
      return ok(p.value.preview.draft);
    },
  };
}

export type BookingUseCases = ReturnType<typeof makeBookingUseCases>;
