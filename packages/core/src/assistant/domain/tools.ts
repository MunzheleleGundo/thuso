import { formatRand } from "../../shared/text";
import { addDaysLocal, DAY, formatLocalDateTime, instantToLocalDate, instantToLocalTime, isLocalDate, localToInstant } from "../../shared/time";
import { computeAvailability, type BookingReader, type ServiceReader } from "../../bookings";
import { matchesQuery, type CustomerReader } from "../../customers";
import { balanceDue, displayStatus, isOverdue, type InvoiceReader } from "../../invoicing";
import { isLow, type StockReader } from "../../stock";
import { isEnabled, MODULES, type Business, type ModuleId } from "../../workspace";
import type { JsonSchema, SuggestedAction, ToolDeclaration } from "./conversation";

/** Read-only access the business assistant gets. Every reader is scoped to one business by the caller. */
export interface AssistantContext {
  readonly business: Business;
  readonly now: number;
  readonly customers: CustomerReader;
  readonly services: ServiceReader;
  readonly bookings: BookingReader;
  readonly invoices: InvoiceReader;
  readonly stock: StockReader;
  /** Collects navigation suggestions made through `propose_action`. */
  readonly actions: SuggestedAction[];
}

interface ToolDef extends ToolDeclaration {
  /** The tool only exists when this module is enabled. Core modules are always enabled. */
  readonly module: ModuleId;
  run(args: Record<string, unknown>, ctx: AssistantContext): Promise<unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required });
const dateArg = (description: string): JsonSchema => ({ type: "string", description: `${description} Format YYYY-MM-DD.` });

function range(ctx: AssistantContext, from: unknown, to: unknown, defaultDays: number) {
  const off = ctx.business.utcOffsetMinutes;
  const today = instantToLocalDate(ctx.now, off);
  const f = isLocalDate(str(from)) ? str(from) : today;
  const t = isLocalDate(str(to)) ? str(to) : addDaysLocal(f, defaultDays - 1);
  return { fromDate: f, toDate: t, from: localToInstant(f, 0, off), to: localToInstant(addDaysLocal(t, 1), 0, off) };
}

export const TOOLS: readonly ToolDef[] = [
  {
    name: "business_overview", module: "customers",
    description: "Basic facts about this business: name, location, which THUSO tools are switched on, VAT status, working hours and today's date.",
    parameters: obj({}),
    async run(_a, ctx) {
      const b = ctx.business;
      return {
        name: b.name, town: b.town, province: b.province,
        today: instantToLocalDate(ctx.now, b.utcOffsetMinutes), timeNow: instantToLocalTime(ctx.now, b.utcOffsetMinutes),
        toolsOn: b.enabledModules.map((m) => MODULES[m].name), vatRegistered: b.vatRegistered, paymentTermsDays: b.paymentTermsDays,
        workingHours: b.schedule ? Object.fromEntries(Object.entries(b.schedule.days).map(([d, h]) => [d, h.open ? `${h.from}-${h.to}` : "closed"])) : "not set",
      };
    },
  },
  {
    name: "find_customers", module: "customers",
    description: "Search customers by name, phone or email. Returns up to 10 matches with their id and contact details.",
    parameters: obj({ query: { type: "string", description: "Part of a name, phone number or email. Empty returns the most recent customers." } }),
    async run(a, ctx) {
      const all = await ctx.customers.list(ctx.business.id, 500);
      const q = str(a.query);
      const hits = all.filter((c) => !c.archived && matchesQuery(c, q)).slice(0, 10);
      return { count: hits.length, customers: hits.map((c) => ({ id: c.id, name: c.name, phone: c.phone || null, email: c.email || null, prefers: c.preferredChannel })) };
    },
  },
  {
    name: "list_services", module: "bookings",
    description: "The services this business offers, with duration, price and deposit.",
    parameters: obj({}),
    async run(_a, ctx) {
      const s = await ctx.services.list(ctx.business.id);
      return s.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, minutes: x.durationMinutes, price: formatRand(x.priceCents), deposit: x.depositCents ? formatRand(x.depositCents) : "none" }));
    },
  },
  {
    name: "list_bookings", module: "bookings",
    description: "Bookings between two dates (inclusive). Defaults to today only.",
    parameters: obj({ from_date: dateArg("First day."), to_date: dateArg("Last day."), status: { type: "string", enum: ["any", "requested", "confirmed", "completed", "cancelled", "no_show"] } }),
    async run(a, ctx) {
      const r = range(ctx, a.from_date, a.to_date, 1);
      const status = str(a.status) || "any";
      const list = (await ctx.bookings.listBetween(ctx.business.id, r.from, r.to))
        .filter((b) => b.startAt >= r.from && b.startAt < r.to && (status === "any" || b.status === status))
        .sort((x, y) => x.startAt - y.startAt);
      return {
        from: r.fromDate, to: r.toDate, count: list.length,
        bookings: list.slice(0, 40).map((b) => ({ id: b.id, when: formatLocalDateTime(b.startAt, ctx.business.utcOffsetMinutes), customer: b.customerName, service: b.serviceName, status: b.status, price: formatRand(b.priceCents), depositOutstanding: b.depositCents > 0 && !b.depositPaid ? formatRand(b.depositCents) : null })),
      };
    },
  },
  {
    name: "check_availability", module: "bookings",
    description: "Free start times on a date for a service.",
    parameters: obj({ date: dateArg("The day to check."), service_name: { type: "string", description: "Name of the service, or part of it." } }, ["date"]),
    async run(a, ctx) {
      if (!ctx.business.schedule) return { error: "Working hours are not set yet, so availability cannot be calculated." };
      const services = (await ctx.services.list(ctx.business.id)).filter((s) => s.active);
      const name = str(a.service_name).toLowerCase();
      const svc = services.find((s) => name && s.name.toLowerCase().includes(name)) ?? services[0];
      if (!svc) return { error: "No services have been added yet." };
      const date = isLocalDate(str(a.date)) ? str(a.date) : instantToLocalDate(ctx.now, ctx.business.utcOffsetMinutes);
      const dayStart = localToInstant(date, 0, ctx.business.utcOffsetMinutes);
      const list = await ctx.bookings.listBetween(ctx.business.id, dayStart - DAY, dayStart + 2 * DAY);
      const starts = computeAvailability({ business: ctx.business, service: svc, localDate: date, bookingsThatDay: list, now: ctx.now, ownerOverride: false });
      return { date, service: svc.name, minutes: svc.durationMinutes, freeTimes: starts.map((s) => instantToLocalTime(s, ctx.business.utcOffsetMinutes)) };
    },
  },
  {
    name: "list_unpaid_invoices", module: "invoicing",
    description: "Invoices with money still owed, largest first, with how overdue each one is.",
    parameters: obj({}),
    async run(_a, ctx) {
      const open = (await ctx.invoices.listOpen(ctx.business.id)).filter((i) => balanceDue(i) > 0).sort((x, y) => balanceDue(y) - balanceDue(x));
      const total = open.reduce((s, i) => s + balanceDue(i), 0);
      return {
        totalOwed: formatRand(total), count: open.length,
        invoices: open.slice(0, 25).map((i) => ({ id: i.id, number: i.number ?? "unnumbered", customer: i.customerName, customerId: i.customerId, owed: formatRand(balanceDue(i)), status: displayStatus(i, ctx.now), due: instantToLocalDate(i.dueDate, ctx.business.utcOffsetMinutes), daysOverdue: isOverdue(i, ctx.now) ? Math.floor((ctx.now - i.dueDate) / DAY) : 0 })),
      };
    },
  },
  {
    name: "revenue_summary", module: "invoicing",
    description: "Totals for invoices issued between two dates: invoiced, received and still owed. Defaults to the last 30 days.",
    parameters: obj({ from_date: dateArg("First day."), to_date: dateArg("Last day.") }),
    async run(a, ctx) {
      const today = instantToLocalDate(ctx.now, ctx.business.utcOffsetMinutes);
      const r = range(ctx, a.from_date ?? addDaysLocal(today, -29), a.to_date ?? today, 30);
      const list = (await ctx.invoices.listIssuedBetween(ctx.business.id, r.from, r.to)).filter((i) => i.status !== "cancelled" && i.status !== "draft");
      const invoiced = list.reduce((s, i) => s + i.totalCents, 0);
      const received = list.reduce((s, i) => s + i.paidCents, 0);
      return { from: r.fromDate, to: r.toDate, invoices: list.length, invoiced: formatRand(invoiced), received: formatRand(received), stillOwed: formatRand(invoiced - received), note: "Drafts and cancelled invoices are excluded." };
    },
  },
  {
    name: "list_low_stock", module: "stock",
    description: "Stock items at or below their reorder level.",
    parameters: obj({}),
    async run(_a, ctx) {
      const low = (await ctx.stock.list(ctx.business.id)).filter(isLow).sort((x, y) => x.quantity - x.reorderLevel - (y.quantity - y.reorderLevel));
      return { count: low.length, items: low.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, reorderLevel: i.reorderLevel })) };
    },
  },
  {
    name: "find_stock_items", module: "stock",
    description: "Search stock items by name or SKU, with quantity and prices.",
    parameters: obj({ query: { type: "string" } }),
    async run(a, ctx) {
      const q = str(a.query).toLowerCase();
      const items = (await ctx.stock.list(ctx.business.id)).filter((i) => !i.archived && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)));
      return items.slice(0, 20).map((i) => ({ id: i.id, name: i.name, sku: i.sku || null, quantity: i.quantity, unit: i.unit, price: formatRand(i.priceCents), low: isLow(i) }));
    },
  },
  {
    name: "propose_action", module: "customers",
    description: "Offer the user a button that opens the right screen, for example to follow up an unpaid invoice. You cannot change anything yourself; the user reviews and confirms on that screen. Use ids returned by other tools only.",
    parameters: obj({
      type: { type: "string", enum: ["open_invoice", "open_booking", "open_customer", "new_invoice", "open_stock"] },
      target_id: { type: "string", description: "Id of the invoice, booking, customer or stock item. For new_invoice, the customer id." },
      label: { type: "string", description: "Short button text, e.g. 'Open INV-0007'." },
    }, ["type", "target_id", "label"]),
    async run(a, ctx) {
      const type = str(a.type) as SuggestedAction["type"];
      if (!["open_invoice", "open_booking", "open_customer", "new_invoice", "open_stock"].includes(type) || !str(a.target_id)) return { ok: false };
      if (ctx.actions.length < 4) ctx.actions.push({ type, targetId: str(a.target_id).slice(0, 64), label: str(a.label).slice(0, 40) || "Open" });
      return { ok: true, note: "The button will be shown under your answer." };
    },
  },
];

export function toolsFor(business: Business): ToolDef[] {
  return TOOLS.filter((t) => isEnabled(business.enabledModules, t.module));
}

export function declarations(tools: readonly ToolDef[]): ToolDeclaration[] {
  return tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
}
