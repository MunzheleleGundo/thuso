/**
 * In-memory adapters for every port. Used by unit tests, and handy for demos or Storybook.
 * They apply the same domain-level operations as the Firestore adapters, including the
 * slot-lock rule (a lock can be created once, never overwritten).
 */
import type { AnyOp } from "../index";
import type { AuditEntry } from "../shared/audit";
import type { Clock, IdGenerator, Writer } from "../shared/ports";
import type { Business, Member, BusinessReader, SlugRegistry } from "../workspace";
import type { Customer, CustomerReader } from "../customers";
import type { Booking, BookingReader, Service, ServiceReader } from "../bookings";
import { lockId } from "../bookings";
import type { Invoice, InvoiceReader, Payment } from "../invoicing";
import { isOpen } from "../invoicing";
import type { StockItem, StockMovement, StockReader } from "../stock";

export class FixedClock implements Clock {
  constructor(public t: number) {}
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

export class SeqIds implements IdGenerator {
  private n = 0;
  constructor(private prefix = "id") {}
  next() { return `${this.prefix}${++this.n}`; }
}

interface Biz {
  business: Business;
  members: Map<string, Member>;
  customers: Map<string, Customer>;
  services: Map<string, Service>;
  bookings: Map<string, Booking>;
  locks: Map<string, string>;
  invoices: Map<string, Invoice>;
  payments: Map<string, Payment>;
  stock: Map<string, StockItem>;
  movements: StockMovement[];
  audit: AuditEntry[];
}

export class ConflictError extends Error {}

export class MemoryStore implements Writer<AnyOp>, BusinessReader, SlugRegistry {
  readonly biz = new Map<string, Biz>();
  readonly slugs = new Map<string, string>();
  commits = 0;

  private of(bizId: string): Biz {
    const b = this.biz.get(bizId);
    if (!b) throw new Error(`No business ${bizId}`);
    return b;
  }

  seedBusiness(business: Business) {
    this.biz.set(business.id, {
      business, members: new Map(), customers: new Map(), services: new Map(), bookings: new Map(), locks: new Map(),
      invoices: new Map(), payments: new Map(), stock: new Map(), movements: [], audit: [],
    });
    this.slugs.set(business.slug, business.id);
  }

  data(bizId: string) { return this.of(bizId); }

  /** Atomic: validate everything first, then apply. Mirrors a Firestore batch. */
  async commit(bizId: string, ops: readonly AnyOp[]): Promise<void> {
    for (const op of ops) {
      if (op.kind === "business.create") {
        if (this.slugs.has(op.business.slug)) throw new ConflictError("slug taken");
      }
      if (op.kind === "slots.claim") {
        const b = this.of(bizId);
        for (const block of op.blocks) if (b.locks.has(lockId(op.staffId, block))) throw new ConflictError("slot taken");
      }
    }
    this.commits++;
    for (const op of ops) {
      switch (op.kind) {
        case "business.create":
          this.seedBusiness(op.business);
          this.of(bizId).members.set(op.owner.uid, op.owner);
          break;
        case "business.save": this.of(bizId).business = op.business; break;
        case "customer.save": this.of(bizId).customers.set(op.customer.id, op.customer); break;
        case "service.save": this.of(bizId).services.set(op.service.id, op.service); break;
        case "booking.save": this.of(bizId).bookings.set(op.booking.id, op.booking); break;
        case "slots.claim": for (const block of op.blocks) this.of(bizId).locks.set(lockId(op.staffId, block), op.bookingId); break;
        case "slots.release": for (const block of op.blocks) this.of(bizId).locks.delete(lockId(op.staffId, block)); break;
        case "invoice.save": {
          const prev = this.of(bizId).invoices.get(op.invoice.id);
          // Like the Firestore adapter: the number is server-owned and never overwritten by a save.
          this.of(bizId).invoices.set(op.invoice.id, { ...op.invoice, number: prev?.number ?? op.invoice.number });
          break;
        }
        case "payment.save": this.of(bizId).payments.set(op.payment.id, op.payment); break;
        case "stock.saveItem": {
          const prev = this.of(bizId).stock.get(op.item.id);
          this.of(bizId).stock.set(op.item.id, { ...op.item, quantity: prev?.quantity ?? op.item.quantity });
          break;
        }
        case "stock.move": {
          const b = this.of(bizId);
          b.movements.push(op.movement);
          const item = b.stock.get(op.movement.itemId);
          if (item) b.stock.set(item.id, { ...item, quantity: Math.round((item.quantity + op.movement.delta) * 1000) / 1000 });
          break;
        }
        case "audit.append": this.of(bizId).audit.push(op.entry); break;
      }
    }
  }

  async get(bizId: string) { return this.biz.get(bizId)?.business ?? null; }
  async isAvailable(slug: string) { return !this.slugs.has(slug); }

  readonly customerReader: CustomerReader = {
    get: async (bizId, id) => this.biz.get(bizId)?.customers.get(id) ?? null,
    findByContact: async (bizId, c) => [...(this.biz.get(bizId)?.customers.values() ?? [])].find((x) => (!!c.phone && x.phone === c.phone) || (!!c.email && x.email === c.email)) ?? null,
    list: async (bizId, limit) => [...(this.biz.get(bizId)?.customers.values() ?? [])].slice(0, limit),
  };

  readonly serviceReader: ServiceReader = {
    get: async (bizId, id) => this.biz.get(bizId)?.services.get(id) ?? null,
    list: async (bizId) => [...(this.biz.get(bizId)?.services.values() ?? [])],
  };

  readonly bookingReader: BookingReader = {
    get: async (bizId, id) => this.biz.get(bizId)?.bookings.get(id) ?? null,
    listBetween: async (bizId, from, to) => [...(this.biz.get(bizId)?.bookings.values() ?? [])].filter((b) => b.startAt < to && b.endAt > from),
  };

  readonly invoiceReader: InvoiceReader = {
    get: async (bizId, id) => this.biz.get(bizId)?.invoices.get(id) ?? null,
    listOpen: async (bizId) => [...(this.biz.get(bizId)?.invoices.values() ?? [])].filter(isOpen),
    listIssuedBetween: async (bizId, from, to) => [...(this.biz.get(bizId)?.invoices.values() ?? [])].filter((i) => i.issueDate >= from && i.issueDate < to),
  };

  readonly stockReader: StockReader = {
    get: async (bizId, id) => this.biz.get(bizId)?.stock.get(id) ?? null,
    list: async (bizId) => [...(this.biz.get(bizId)?.stock.values() ?? [])],
  };
}
