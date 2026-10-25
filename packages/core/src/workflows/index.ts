/**
 * Workflows coordinate several modules in one atomic action. Each module still owns its own
 * rules; a workflow only decides which of them to run, based on which modules are enabled.
 */
import { audit } from "../shared/audit";
import { effect, type Effect, type Preview } from "../shared/effect";
import type { Actor, Clock, IdGenerator, Writer } from "../shared/ports";
import { err, ok, type Result } from "../shared/result";
import { formatRand } from "../shared/text";
import { formatLocalDateTime } from "../shared/time";
import { transition, type Booking, type BookingOp, type BookingReader, type ServiceReader } from "../bookings";
import type { CustomerReader } from "../customers";
import { buildInvoice, invoiceName, type Invoice, type InvoiceLine, type InvoiceOp } from "../invoicing";
import { planStockUse, type StockItem, type StockOp, type StockReader } from "../stock";
import { canWrite, isEnabled, type BusinessReader, type Role } from "../workspace";

export type WorkflowOp = BookingOp | InvoiceOp | StockOp;

export interface WorkflowDeps {
  readonly businesses: BusinessReader;
  readonly bookings: BookingReader;
  readonly services: ServiceReader;
  readonly customers: CustomerReader;
  readonly stock: StockReader;
  readonly writer: Writer<WorkflowOp>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CompleteBookingCmd {
  readonly bizId: string;
  readonly actor: Actor;
  readonly role: Role;
  readonly bookingId: string;
  /** Default: true when invoicing is enabled. */
  readonly createInvoice?: boolean;
  /** Default: true when stock is enabled and the service uses stock. */
  readonly useStock?: boolean;
}

export interface CompleteBookingResult {
  readonly booking: Booking;
  readonly invoice: Invoice | null;
}

export interface CreateInvoiceCmd {
  readonly bizId: string;
  readonly actor: Actor;
  readonly role: Role;
  readonly customerId: string;
  readonly lines: readonly InvoiceLine[];
  readonly notes?: string;
  /** Reduce stock for lines linked to stock items. Default: true when stock is enabled. */
  readonly deductStock?: boolean;
}

interface Planned<T> { preview: Preview<T>; ops: WorkflowOp[] }

export function makeWorkflows(d: WorkflowDeps) {
  async function stockMap(bizId: string, ids: readonly string[]): Promise<Map<string, StockItem>> {
    const unique = [...new Set(ids)];
    const items = await Promise.all(unique.map((id) => d.stock.get(bizId, id)));
    return new Map(items.filter((i): i is StockItem => !!i).map((i) => [i.id, i]));
  }

  async function planComplete(cmd: CompleteBookingCmd): Promise<Result<Planned<CompleteBookingResult>>> {
    if (!canWrite(cmd.role)) return err("forbidden", "Your role cannot complete bookings.");
    const [biz, booking] = await Promise.all([d.businesses.get(cmd.bizId), d.bookings.get(cmd.bizId, cmd.bookingId)]);
    if (!biz || !booking) return err("not_found", "We could not find this booking.");
    const now = d.clock.now();
    const completed = transition(booking, "completed", now);
    if (!completed.ok) return completed;

    const effects: Effect[] = [];
    const ops: WorkflowOp[] = [];
    let invoice: Invoice | null = null;
    let next: Booking = completed.value;

    const wantInvoice = isEnabled(biz.enabledModules, "invoicing") && (cmd.createInvoice ?? true) && !booking.invoiceId;
    if (wantInvoice) {
      const customer = await d.customers.get(cmd.bizId, booking.customerId);
      const built = buildInvoice(d.ids.next(), {
        customer: { id: booking.customerId, name: booking.customerName, email: customer?.email ?? "", phone: customer?.phone ?? "" },
        lines: [{ description: `${booking.serviceName}, ${formatLocalDateTime(booking.startAt, biz.utcOffsetMinutes)}`, quantity: 1, unitPriceCents: booking.priceCents, stockItemId: null }],
        vatRegistered: biz.vatRegistered,
        paymentTermsDays: biz.paymentTermsDays,
        bookingId: booking.id,
        alreadyPaidCents: booking.depositPaid ? booking.depositCents : 0,
      }, now);
      if (!built.ok) return built;
      invoice = built.value;
      next = { ...next, invoiceId: invoice.id };
      effects.push(effect("money", "Create invoice", `${formatRand(invoice.totalCents)} for ${booking.customerName}${invoice.vatCents ? ` (incl. ${formatRand(invoice.vatCents)} VAT)` : ""}`));
      if (invoice.paidCents > 0) effects.push(effect("money", "Deposit counted", `${formatRand(invoice.paidCents)} already paid, ${formatRand(invoice.totalCents - invoice.paidCents)} still due`));
      ops.push({ kind: "invoice.save", invoice });
    }

    if (isEnabled(biz.enabledModules, "stock") && (cmd.useStock ?? true)) {
      const service = await d.services.get(cmd.bizId, booking.serviceId);
      const uses = service?.stockUsage ?? [];
      if (uses.length) {
        const items = await stockMap(cmd.bizId, uses.map((u) => u.itemId));
        const s = planStockUse({ items, uses, reason: "used", refType: "booking", refId: booking.id, actor: cmd.actor, now, nextId: () => d.ids.next() });
        ops.push(...s.ops);
        effects.push(...s.effects);
      }
    }

    effects.push(effect("booking", "Close booking", `${booking.serviceName} for ${booking.customerName} marked completed`));
    ops.push({ kind: "booking.save", booking: next });
    ops.push(audit(d.ids.next(), now, cmd.actor, "booking.completed", `Completed ${booking.serviceName} for ${booking.customerName}`, { bookingId: booking.id, ...(invoice ? { invoiceId: invoice.id } : {}) }));
    return ok({ preview: { effects, draft: { booking: next, invoice } }, ops });
  }

  async function planInvoice(cmd: CreateInvoiceCmd): Promise<Result<Planned<Invoice>>> {
    if (!canWrite(cmd.role)) return err("forbidden", "Your role cannot create invoices.");
    const [biz, customer] = await Promise.all([d.businesses.get(cmd.bizId), d.customers.get(cmd.bizId, cmd.customerId)]);
    if (!biz) return err("not_found", "We could not find this business.");
    if (!isEnabled(biz.enabledModules, "invoicing")) return err("module_disabled", "Invoices are switched off for this business.");
    if (!customer) return err("validation", "Choose a customer.", { field: "customerId" });
    const now = d.clock.now();
    const built = buildInvoice(d.ids.next(), {
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
      lines: cmd.lines, vatRegistered: biz.vatRegistered, paymentTermsDays: biz.paymentTermsDays, notes: cmd.notes,
    }, now);
    if (!built.ok) return built;
    const inv = built.value;
    const effects: Effect[] = [
      effect("money", "Create invoice", `${formatRand(inv.totalCents)} for ${customer.name}, ${inv.lines.length} line${inv.lines.length === 1 ? "" : "s"}${inv.vatCents ? `, incl. ${formatRand(inv.vatCents)} VAT` : ""}`),
    ];
    const ops: WorkflowOp[] = [{ kind: "invoice.save", invoice: inv }];
    if (isEnabled(biz.enabledModules, "stock") && (cmd.deductStock ?? true)) {
      const linked = inv.lines.filter((l): l is InvoiceLine & { stockItemId: string } => !!l.stockItemId);
      if (linked.length) {
        const items = await stockMap(cmd.bizId, linked.map((l) => l.stockItemId));
        const s = planStockUse({ items, uses: linked.map((l) => ({ itemId: l.stockItemId, quantity: l.quantity })), reason: "sold", refType: "invoice", refId: inv.id, actor: cmd.actor, now, nextId: () => d.ids.next() });
        ops.push(...s.ops);
        effects.push(...s.effects);
      }
    }
    ops.push(audit(d.ids.next(), now, cmd.actor, "invoice.created", `Created ${invoiceName(inv)} for ${customer.name} (${formatRand(inv.totalCents)})`, { invoiceId: inv.id }));
    return ok({ preview: { effects, draft: inv }, ops });
  }

  return {
    async previewCompleteBooking(cmd: CompleteBookingCmd): Promise<Result<Preview<CompleteBookingResult>>> {
      const p = await planComplete(cmd);
      return p.ok ? ok(p.value.preview) : p;
    },
    async completeBooking(cmd: CompleteBookingCmd): Promise<Result<CompleteBookingResult>> {
      const p = await planComplete(cmd);
      if (!p.ok) return p;
      await d.writer.commit(cmd.bizId, p.value.ops);
      return ok(p.value.preview.draft);
    },
    async previewCreateInvoice(cmd: CreateInvoiceCmd): Promise<Result<Preview<Invoice>>> {
      const p = await planInvoice(cmd);
      return p.ok ? ok(p.value.preview) : p;
    },
    async createInvoice(cmd: CreateInvoiceCmd): Promise<Result<Invoice>> {
      const p = await planInvoice(cmd);
      if (!p.ok) return p;
      await d.writer.commit(cmd.bizId, p.value.ops);
      return ok(p.value.preview.draft);
    },
  };
}

export type Workflows = ReturnType<typeof makeWorkflows>;
