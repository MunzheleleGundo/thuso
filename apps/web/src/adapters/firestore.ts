/**
 * Browser adapters for the core's ports, using the Firestore web SDK.
 * Writes go through toWrites() from @thuso/core so the browser and the server
 * apply exactly the same document changes.
 */
import {
  collection, doc, getDoc, getDocs, increment, limit, orderBy, query, where, writeBatch, type Firestore,
} from "firebase/firestore";
import {
  C, fromStored, isOpen, sub, toWrites,
  type AnyOp, type BookingReader, type BusinessReader, type CustomerReader, type InvoiceReader,
  type ServiceReader, type SlugRegistry, type StockReader, type Writer,
} from "@thuso/core";

export type WriteListener = (event: { kind: "queued" } | { kind: "failed"; error: unknown }) => void;

/**
 * Applies a use case's operations in one atomic batch. When the device is offline the batch is
 * queued by Firestore and the UI updates from the local cache straight away; listeners hear
 * about it so the user can be told "saved on this device".
 */
export function webWriter(db: Firestore, listen: WriteListener): Writer<AnyOp> {
  return {
    async commit(bizId, ops) {
      const batch = writeBatch(db);
      for (const w of toWrites(bizId, ops, "client")) {
        const ref = doc(db, w.path);
        switch (w.op) {
          case "set": batch.set(ref, w.data, { merge: w.merge }); break;
          case "create": batch.set(ref, w.data); break; // rules only allow this as a create
          case "delete": batch.delete(ref); break;
          case "increment": batch.set(ref, { [w.field]: increment(w.by) }, { merge: true }); break;
        }
      }
      const pending = batch.commit();
      if (!navigator.onLine) {
        pending.catch((error) => listen({ kind: "failed", error }));
        listen({ kind: "queued" });
        return;
      }
      const result = await Promise.race([pending.then(() => "done" as const), new Promise<"slow">((r) => setTimeout(() => r("slow"), 10_000))]);
      if (result === "slow") {
        pending.catch((error) => listen({ kind: "failed", error }));
        listen({ kind: "queued" });
      }
    },
  };
}

export function webReaders(db: Firestore) {
  const col = (bizId: string, name: string) => collection(db, `${C.businesses}/${bizId}/${name}`);
  const one = async <T>(path: string, map: (id: string, d: Record<string, unknown>) => T): Promise<T | null> => {
    const s = await getDoc(doc(db, path));
    return s.exists() ? map(s.id, s.data()) : null;
  };

  const businesses: BusinessReader = { get: (bizId) => one(`${C.businesses}/${bizId}`, fromStored.business) };
  const slugs: SlugRegistry = {
    async isAvailable(slug) {
      const s = await getDoc(doc(db, `${C.slugs}/${slug}`));
      return !s.exists();
    },
  };
  const customers: CustomerReader = {
    get: (bizId, id) => one(sub(bizId, C.customers, id), fromStored.customer),
    async findByContact(bizId, c) {
      for (const [field, value] of [["phone", c.phone], ["email", c.email]] as const) {
        if (!value) continue;
        const snap = await getDocs(query(col(bizId, C.customers), where(field, "==", value), limit(1)));
        if (snap.docs[0]) return fromStored.customer(snap.docs[0].id, snap.docs[0].data());
      }
      return null;
    },
    async list(bizId, max) {
      const snap = await getDocs(query(col(bizId, C.customers), orderBy("createdAt", "desc"), limit(max)));
      return snap.docs.map((d) => fromStored.customer(d.id, d.data()));
    },
  };
  const services: ServiceReader = {
    get: (bizId, id) => one(sub(bizId, C.services, id), fromStored.service),
    async list(bizId) {
      const snap = await getDocs(col(bizId, C.services));
      return snap.docs.map((d) => fromStored.service(d.id, d.data()));
    },
  };
  const bookings: BookingReader = {
    get: (bizId, id) => one(sub(bizId, C.bookings, id), fromStored.booking),
    async listBetween(bizId, from, to) {
      const snap = await getDocs(query(col(bizId, C.bookings), where("startAt", ">=", from - 12 * 3600_000), where("startAt", "<", to)));
      return snap.docs.map((d) => fromStored.booking(d.id, d.data())).filter((b) => b.endAt > from);
    },
  };
  const invoices: InvoiceReader = {
    get: (bizId, id) => one(sub(bizId, C.invoices, id), fromStored.invoice),
    async listOpen(bizId) {
      const snap = await getDocs(query(col(bizId, C.invoices), where("status", "in", ["draft", "sent", "partially_paid"])));
      return snap.docs.map((d) => fromStored.invoice(d.id, d.data())).filter(isOpen);
    },
    async listIssuedBetween(bizId, from, to) {
      const snap = await getDocs(query(col(bizId, C.invoices), where("issueDate", ">=", from), where("issueDate", "<", to)));
      return snap.docs.map((d) => fromStored.invoice(d.id, d.data()));
    },
  };
  const stock: StockReader = {
    get: (bizId, id) => one(sub(bizId, C.stockItems, id), fromStored.stockItem),
    async list(bizId) {
      const snap = await getDocs(col(bizId, C.stockItems));
      return snap.docs.map((d) => fromStored.stockItem(d.id, d.data()));
    },
  };
  return { businesses, slugs, customers, services, bookings, invoices, stock };
}
