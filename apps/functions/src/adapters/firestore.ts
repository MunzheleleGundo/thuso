/**
 * Admin SDK adapters: implement the core's reader ports and apply the core's writes.
 * Cloud Functions bypass security rules, so every function checks membership itself (see auth.ts).
 */
import { FieldValue, getFirestore, type DocumentReference, type Firestore, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import {
  C, fromStored, isOpen, sub, toWrites,
  type AnyOp, type BookingReader, type Business, type BusinessReader, type CustomerReader, type DocWrite,
  type InvoiceReader, type ServiceReader, type StockReader, type Writer,
} from "@thuso/core";

export const db = (): Firestore => getFirestore();

export function applyWrites(target: Transaction | WriteBatch, writes: readonly DocWrite[]): void {
  const fs = db();
  for (const w of writes) {
    const ref = fs.doc(w.path);
    switch (w.op) {
      case "set": (target as WriteBatch).set(ref, w.data, { merge: w.merge }); break;
      case "create": (target as WriteBatch).create(ref, w.data); break;
      case "delete": (target as WriteBatch).delete(ref); break;
      case "increment": (target as WriteBatch).set(ref, { [w.field]: FieldValue.increment(w.by) }, { merge: true }); break;
    }
  }
}

export const adminWriter: Writer<AnyOp> = {
  async commit(bizId, ops) {
    const batch = db().batch();
    applyWrites(batch, toWrites(bizId, ops, "server"));
    await batch.commit();
  },
};

/** Optional transaction: reads go through it when given, so planning sees a consistent snapshot. */
const read = (ref: DocumentReference, tx?: Transaction) => (tx ? tx.get(ref) : ref.get());

export function readers(tx?: Transaction) {
  const fs = db();
  const businesses: BusinessReader = {
    async get(bizId) {
      const s = await read(fs.doc(`${C.businesses}/${bizId}`), tx);
      return s.exists ? fromStored.business(s.id, s.data()!) : null;
    },
  };
  const customers: CustomerReader = {
    async get(bizId, id) {
      const s = await read(fs.doc(sub(bizId, C.customers, id)), tx);
      return s.exists ? fromStored.customer(s.id, s.data()!) : null;
    },
    async findByContact(bizId, c) {
      const col = fs.collection(`${C.businesses}/${bizId}/${C.customers}`);
      for (const [field, value] of [["phone", c.phone], ["email", c.email]] as const) {
        if (!value) continue;
        const q = col.where(field, "==", value).limit(1);
        const snap = tx ? await tx.get(q) : await q.get();
        const d = snap.docs[0];
        if (d) return fromStored.customer(d.id, d.data());
      }
      return null;
    },
    async list(bizId, limit) {
      const snap = await fs.collection(`${C.businesses}/${bizId}/${C.customers}`).orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => fromStored.customer(d.id, d.data()));
    },
  };
  const services: ServiceReader = {
    async get(bizId, id) {
      const s = await read(fs.doc(sub(bizId, C.services, id)), tx);
      return s.exists ? fromStored.service(s.id, s.data()!) : null;
    },
    async list(bizId) {
      const snap = await fs.collection(`${C.businesses}/${bizId}/${C.services}`).get();
      return snap.docs.map((d) => fromStored.service(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
    },
  };
  const bookings: BookingReader = {
    async get(bizId, id) {
      const s = await read(fs.doc(sub(bizId, C.bookings, id)), tx);
      return s.exists ? fromStored.booking(s.id, s.data()!) : null;
    },
    async listBetween(bizId, from, to) {
      // Bookings are at most 12 hours long, so start >= from - 12h catches every overlap.
      const q = fs.collection(`${C.businesses}/${bizId}/${C.bookings}`).where("startAt", ">=", from - 12 * 3600_000).where("startAt", "<", to);
      const snap = tx ? await tx.get(q) : await q.get();
      return snap.docs.map((d) => fromStored.booking(d.id, d.data())).filter((b) => b.endAt > from);
    },
  };
  const invoices: InvoiceReader = {
    async get(bizId, id) {
      const s = await read(fs.doc(sub(bizId, C.invoices, id)), tx);
      return s.exists ? fromStored.invoice(s.id, s.data()!) : null;
    },
    async listOpen(bizId) {
      const snap = await fs.collection(`${C.businesses}/${bizId}/${C.invoices}`).where("status", "in", ["draft", "sent", "partially_paid"]).get();
      return snap.docs.map((d) => fromStored.invoice(d.id, d.data())).filter(isOpen);
    },
    async listIssuedBetween(bizId, from, to) {
      const snap = await fs.collection(`${C.businesses}/${bizId}/${C.invoices}`).where("issueDate", ">=", from).where("issueDate", "<", to).get();
      return snap.docs.map((d) => fromStored.invoice(d.id, d.data()));
    },
  };
  const stock: StockReader = {
    async get(bizId, id) {
      const s = await read(fs.doc(sub(bizId, C.stockItems, id)), tx);
      return s.exists ? fromStored.stockItem(s.id, s.data()!) : null;
    },
    async list(bizId) {
      const snap = await fs.collection(`${C.businesses}/${bizId}/${C.stockItems}`).get();
      return snap.docs.map((d) => fromStored.stockItem(d.id, d.data()));
    },
  };
  return { businesses, customers, services, bookings, invoices, stock };
}

export async function businessBySlug(slug: string): Promise<Business | null> {
  if (!/^[a-z0-9-]{1,50}$/.test(slug)) return null;
  const s = await db().doc(`${C.slugs}/${slug}`).get();
  const bizId = s.get("bizId");
  return typeof bizId === "string" ? readers().businesses.get(bizId) : null;
}

export const newId = () => db().collection("_").doc().id;
