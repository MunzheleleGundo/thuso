/**
 * Composition root: the one place where ports are wired to adapters.
 * Pages call these use cases; they never talk to Firestore directly for writes.
 */
import { collection, doc } from "firebase/firestore";
import {
  makeBookingUseCases, makeCustomerUseCases, makeInvoiceUseCases, makeStockUseCases, makeWorkflows, makeWorkspaceUseCases,
  systemClock, type IdGenerator,
} from "@thuso/core";
import { webReaders, webWriter, type WriteListener } from "../adapters/firestore";
import { db } from "./firebase";

const listeners = new Set<WriteListener>();
export const onWrite = (l: WriteListener) => { listeners.add(l); return () => { listeners.delete(l); }; };

const writer = webWriter(db, (e) => listeners.forEach((l) => l(e)));
const ids: IdGenerator = { next: () => doc(collection(db, "_")).id };
const clock = systemClock;
export const readers = webReaders(db);
const common = { writer, ids, clock };

export const uc = {
  workspace: makeWorkspaceUseCases({ ...common, businesses: readers.businesses, slugs: readers.slugs }),
  customers: makeCustomerUseCases({ ...common, customers: readers.customers }),
  bookings: makeBookingUseCases({ ...common, businesses: readers.businesses, services: readers.services, bookings: readers.bookings, customers: readers.customers }),
  invoices: makeInvoiceUseCases({ ...common, invoices: readers.invoices }),
  stock: makeStockUseCases({ ...common, stock: readers.stock }),
  workflows: makeWorkflows({ ...common, businesses: readers.businesses, bookings: readers.bookings, services: readers.services, customers: readers.customers, stock: readers.stock }),
};
