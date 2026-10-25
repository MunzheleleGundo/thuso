import { unwrap } from "../shared/result";
import { localToInstant } from "../shared/time";
import { DEFAULT_SCHEDULE, makeWorkspaceUseCases, newBusiness, setModules, type Business } from "../workspace";
import { makeCustomerUseCases } from "../customers";
import { makeBookingUseCases } from "../bookings";
import { makeInvoiceUseCases } from "../invoicing";
import { makeStockUseCases } from "../stock";
import { makeWorkflows } from "../workflows";
import { FixedClock, MemoryStore, SeqIds } from "./index";

export const OWNER = { uid: "u1", name: "Owner" };
export const OFFSET = 120;
/** Monday 2 November 2026, 07:00 local (05:00 UTC). */
export const MONDAY = "2026-11-02";
export const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return localToInstant(date, h * 60 + m, OFFSET);
};

export function setup(modules: string[] = ["bookings", "invoicing", "stock"], tweak: (b: Business) => Business = (b) => b) {
  const store = new MemoryStore();
  const clock = new FixedClock(at(MONDAY, "07:00"));
  const ids = new SeqIds();
  const base = unwrap(newBusiness({
    id: "biz1", slug: "ndou-studio", ownerId: OWNER.uid, now: clock.now(), contactEmail: "owner@example.com",
    profile: { name: "Ndou Studio", industry: "beauty", size: "2-10", province: "Limpopo", town: "Thohoyandou", ownerRole: "Owner or founder" },
  }));
  const biz = tweak({ ...setModules(base, modules, true), schedule: DEFAULT_SCHEDULE });
  store.seedBusiness(biz);
  const common = { writer: store, ids, clock };
  return {
    store, clock, ids, biz,
    workspace: makeWorkspaceUseCases({ ...common, businesses: store, slugs: store }),
    customers: makeCustomerUseCases({ ...common, customers: store.customerReader }),
    bookings: makeBookingUseCases({ ...common, businesses: store, services: store.serviceReader, bookings: store.bookingReader, customers: store.customerReader }),
    invoices: makeInvoiceUseCases({ ...common, invoices: store.invoiceReader }),
    stock: makeStockUseCases({ ...common, stock: store.stockReader }),
    workflows: makeWorkflows({ ...common, businesses: store, bookings: store.bookingReader, services: store.serviceReader, customers: store.customerReader, stock: store.stockReader }),
  };
}
