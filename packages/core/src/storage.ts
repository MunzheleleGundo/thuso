/**
 * The storage contract, shared by the browser and server adapters.
 *
 * Use cases describe changes as domain operations (AnyOp). This file turns them into
 * plain document writes (paths + data) without knowing about any database SDK, so the
 * Firestore web adapter and the Admin SDK adapter apply exactly the same writes.
 * It also restores defaults when reading documents back.
 */
import type { AnyOp } from "./index";
import type { Business, Member } from "./workspace";
import type { Customer } from "./customers";
import type { Booking, Service } from "./bookings";
import { lockId } from "./bookings";
import type { Invoice, Payment } from "./invoicing";
import type { StockItem, StockMovement } from "./stock";
import type { AuditEntry } from "./shared/audit";

export const C = {
  users: "users",
  slugs: "slugs",
  businesses: "businesses",
  members: "members",
  customers: "customers",
  services: "services",
  bookings: "bookings",
  slotLocks: "slotLocks",
  invoices: "invoices",
  payments: "payments",
  stockItems: "stockItems",
  stockMovements: "stockMovements",
  auditLog: "auditLog",
  counters: "counters",
  private: "private",
} as const;

export const bizDoc = (bizId: string) => `${C.businesses}/${bizId}`;
export const sub = (bizId: string, collection: string, id: string) => `${C.businesses}/${bizId}/${collection}/${id}`;

export type DocWrite =
  | { readonly op: "set"; readonly path: string; readonly data: Record<string, unknown>; readonly merge: boolean }
  /** Must not already exist. The browser maps this to a set that rules only allow as a create. */
  | { readonly op: "create"; readonly path: string; readonly data: Record<string, unknown> }
  | { readonly op: "delete"; readonly path: string }
  | { readonly op: "increment"; readonly path: string; readonly field: string; readonly by: number };

export type WriterSide = "client" | "server";

const plain = (o: object) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

function omit<T extends object>(o: T, keys: readonly string[]): Record<string, unknown> {
  const out = plain(o);
  for (const k of keys) delete out[k];
  return out;
}

/** Fields only Cloud Functions may write. */
const SERVER_INVOICE_FIELDS = ["number", "paymentLink"];

export function toWrites(bizId: string, ops: readonly AnyOp[], side: WriterSide): DocWrite[] {
  const w: DocWrite[] = [];
  for (const op of ops) {
    switch (op.kind) {
      case "business.create":
        w.push({ op: "set", path: bizDoc(op.business.id), data: plain(op.business), merge: false });
        w.push({ op: "set", path: sub(op.business.id, C.members, op.owner.uid), data: plain(op.owner), merge: false });
        w.push({ op: "create", path: `${C.slugs}/${op.business.slug}`, data: { bizId: op.business.id } });
        w.push({ op: "set", path: `${C.users}/${op.owner.uid}`, data: { activeBizId: op.business.id, updatedAt: op.business.createdAt }, merge: true });
        break;
      case "business.save":
        w.push({ op: "set", path: bizDoc(bizId), data: plain(op.business), merge: false });
        break;
      case "customer.save":
        w.push({ op: "set", path: sub(bizId, C.customers, op.customer.id), data: plain(op.customer), merge: false });
        break;
      case "service.save":
        w.push({ op: "set", path: sub(bizId, C.services, op.service.id), data: plain(op.service), merge: false });
        break;
      case "booking.save":
        w.push({ op: "set", path: sub(bizId, C.bookings, op.booking.id), data: plain(op.booking), merge: false });
        break;
      case "slots.claim":
        for (const block of op.blocks) w.push({ op: "create", path: sub(bizId, C.slotLocks, lockId(op.staffId, block)), data: { bookingId: op.bookingId, at: block } });
        break;
      case "slots.release":
        for (const block of op.blocks) w.push({ op: "delete", path: sub(bizId, C.slotLocks, lockId(op.staffId, block)) });
        break;
      case "invoice.save":
        // Merge so server-owned fields (number, payment link) are never overwritten by a stale copy.
        w.push({ op: "set", path: sub(bizId, C.invoices, op.invoice.id), data: omit(op.invoice, side === "client" ? SERVER_INVOICE_FIELDS : ["number"]), merge: true });
        break;
      case "payment.save":
        // Server payments use the provider reference as id; "create" makes a repeated webhook fail safely.
        w.push(side === "server"
          ? { op: "create", path: sub(bizId, C.payments, op.payment.id), data: plain(op.payment) }
          : { op: "set", path: sub(bizId, C.payments, op.payment.id), data: plain(op.payment), merge: false });
        break;
      case "stock.saveItem":
        // Quantity only changes through increments, so concurrent offline sales add up correctly.
        w.push({ op: "set", path: sub(bizId, C.stockItems, op.item.id), data: omit(op.item, ["quantity"]), merge: true });
        break;
      case "stock.move":
        w.push({ op: "set", path: sub(bizId, C.stockMovements, op.movement.id), data: plain(op.movement), merge: false });
        w.push({ op: "increment", path: sub(bizId, C.stockItems, op.movement.itemId), field: "quantity", by: op.movement.delta });
        break;
      case "audit.append":
        w.push({ op: "set", path: sub(bizId, C.auditLog, op.entry.id), data: plain(op.entry), merge: false });
        break;
      default: {
        const never: never = op;
        throw new Error(`Unknown op ${(never as { kind: string }).kind}`);
      }
    }
  }
  return w;
}

/** Restore a document into its domain shape, filling defaults for fields that may be absent. */
type Data = Record<string, unknown>;
const withId = <T>(id: string, d: Data) => ({ ...d, id }) as T;

export const fromStored = {
  business: (id: string, d: Data): Business => withId<Business>(id, d),
  member: (uid: string, d: Data): Member => ({ ...(d as unknown as Member), uid }),
  customer: (id: string, d: Data): Customer => withId<Customer>(id, d),
  service: (id: string, d: Data): Service => withId<Service>(id, { stockUsage: [], description: "", ...d }),
  booking: (id: string, d: Data): Booking => withId<Booking>(id, { lockBlocks: [], invoiceId: null, notes: "", ...d }),
  invoice: (id: string, d: Data): Invoice => withId<Invoice>(id, { number: null, paymentLink: null, notes: "", bookingId: null, ...d }),
  payment: (id: string, d: Data): Payment => withId<Payment>(id, d),
  stockItem: (id: string, d: Data): StockItem => withId<StockItem>(id, { quantity: 0, sku: "", unit: "each", archived: false, ...d }),
  movement: (id: string, d: Data): StockMovement => withId<StockMovement>(id, d),
  audit: (id: string, d: Data): AuditEntry => withId<AuditEntry>(id, d),
};
