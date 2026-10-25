/** Live data for pages. Each hook is one Firestore listener, cached offline. */
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { C, fromStored, sub } from "@thuso/core";
import { useLiveDoc, useLiveQuery } from "../adapters/live";
import { db } from "../app/firebase";

const col = (bizId: string, name: string) => collection(db, `${C.businesses}/${bizId}/${name}`);
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function useCustomers(bizId: string) {
  return useLiveQuery(`customers:${bizId}`, query(col(bizId, C.customers), orderBy("createdAt", "desc"), limit(1000)), fromStored.customer);
}
export const useCustomer = (bizId: string, id: string | undefined) => useLiveDoc(id ? sub(bizId, C.customers, id) : null, fromStored.customer);

export function useServices(bizId: string) {
  const r = useLiveQuery(`services:${bizId}`, col(bizId, C.services), fromStored.service);
  return { ...r, data: [...r.data].sort(byName) };
}

export function useBookingsBetween(bizId: string, from: number, to: number) {
  return useLiveQuery(`bookings:${bizId}:${from}:${to}`,
    query(col(bizId, C.bookings), where("startAt", ">=", from), where("startAt", "<", to), orderBy("startAt")), fromStored.booking);
}
export function useBookingsForCustomer(bizId: string, customerId: string) {
  return useLiveQuery(`bookings-c:${bizId}:${customerId}`, query(col(bizId, C.bookings), where("customerId", "==", customerId), limit(100)), fromStored.booking);
}

export function useInvoices(bizId: string) {
  return useLiveQuery(`invoices:${bizId}`, query(col(bizId, C.invoices), orderBy("createdAt", "desc"), limit(500)), fromStored.invoice);
}
export function useInvoicesForCustomer(bizId: string, customerId: string) {
  return useLiveQuery(`invoices-c:${bizId}:${customerId}`, query(col(bizId, C.invoices), where("customerId", "==", customerId), limit(100)), fromStored.invoice);
}
export const useInvoice = (bizId: string, id: string | undefined) => useLiveDoc(id ? sub(bizId, C.invoices, id) : null, fromStored.invoice);
export function usePaymentsFor(bizId: string, invoiceId: string) {
  return useLiveQuery(`payments:${bizId}:${invoiceId}`, query(col(bizId, C.payments), where("invoiceId", "==", invoiceId)), fromStored.payment);
}

export function useStockItems(bizId: string) {
  const r = useLiveQuery(`stock:${bizId}`, col(bizId, C.stockItems), fromStored.stockItem);
  return { ...r, data: [...r.data].sort(byName) };
}
export function useMovementsFor(bizId: string, itemId: string | null) {
  return useLiveQuery(`moves:${bizId}:${itemId}`, itemId ? query(col(bizId, C.stockMovements), where("itemId", "==", itemId), limit(50)) : null, fromStored.movement);
}

/** Does this business have at least one document in a collection? Used by the setup checklist. */
export function useHasAny(bizId: string, name: string) {
  const r = useLiveQuery(`any:${bizId}:${name}`, query(col(bizId, name), limit(1)), (id) => id);
  return { loading: r.loading, value: r.data.length > 0 };
}
