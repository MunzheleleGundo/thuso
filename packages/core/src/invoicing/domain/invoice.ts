import { isValidCents, percentOf, sum, VAT_RATE_BPS, type Cents } from "../../shared/money";
import { err, ok, type Result } from "../../shared/result";
import { DAY } from "../../shared/time";

export interface InvoiceLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
  /** When set, sending or completing the invoice can reduce this stock item. */
  readonly stockItemId: string | null;
}

/** Stored statuses. "Overdue" is derived from the due date, never stored. */
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "cancelled";

export interface PaymentLink {
  readonly url: string;
  readonly reference: string;
  readonly createdAt: number;
}

export interface Invoice {
  readonly id: string;
  /** Sequential per business, e.g. "INV-0007". Assigned by the server, so it is null until then. */
  readonly number: string | null;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
  readonly lines: readonly InvoiceLine[];
  readonly vatRateBps: number; // 0 when the business is not VAT registered
  readonly subtotalCents: Cents;
  readonly vatCents: Cents;
  readonly totalCents: Cents;
  readonly paidCents: Cents;
  readonly status: InvoiceStatus;
  readonly issueDate: number;
  readonly dueDate: number;
  readonly notes: string;
  readonly bookingId: string | null;
  readonly paymentLink: PaymentLink | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface InvoiceDraftInput {
  readonly customer: { id: string; name: string; email: string; phone: string };
  readonly lines: readonly InvoiceLine[];
  readonly vatRegistered: boolean;
  readonly paymentTermsDays: number;
  readonly notes?: string;
  readonly bookingId?: string | null;
  /** Amounts already paid before the invoice exists, e.g. a booking deposit. */
  readonly alreadyPaidCents?: Cents;
}

export function validateLines(lines: readonly InvoiceLine[]): Result<InvoiceLine[]> {
  const clean = lines
    .map((l) => ({ ...l, description: l.description.trim() }))
    .filter((l) => l.description.length > 0 || l.unitPriceCents > 0);
  if (clean.length === 0) return err("validation", "Add at least one line.", { field: "lines" });
  if (clean.length > 50) return err("validation", "An invoice can have up to 50 lines.", { field: "lines" });
  for (const [i, l] of clean.entries()) {
    if (!l.description) return err("validation", `Line ${i + 1} needs a description.`, { field: "lines" });
    if (!(l.quantity > 0) || l.quantity > 100_000 || Math.round(l.quantity * 1000) !== l.quantity * 1000) {
      return err("validation", `Line ${i + 1} needs a quantity above zero.`, { field: "lines" });
    }
    if (!isValidCents(l.unitPriceCents)) return err("validation", `Line ${i + 1} needs a valid price.`, { field: "lines" });
  }
  return ok(clean);
}

export const lineTotal = (l: InvoiceLine): Cents => Math.round(l.quantity * l.unitPriceCents);

export function totals(lines: readonly InvoiceLine[], vatRateBps: number) {
  const subtotalCents = sum(lines.map(lineTotal));
  const vatCents = percentOf(subtotalCents, vatRateBps);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

export function buildInvoice(id: string, input: InvoiceDraftInput, now: number): Result<Invoice> {
  const lines = validateLines(input.lines);
  if (!lines.ok) return lines;
  if (!input.customer.id) return err("validation", "Choose a customer.", { field: "customerId" });
  const vatRateBps = input.vatRegistered ? VAT_RATE_BPS : 0;
  const t = totals(lines.value, vatRateBps);
  if (t.totalCents <= 0) return err("validation", "The invoice total must be more than R 0.", { field: "lines" });
  const paid = Math.min(input.alreadyPaidCents ?? 0, t.totalCents);
  return ok({
    id,
    number: null,
    customerId: input.customer.id,
    customerName: input.customer.name,
    customerEmail: input.customer.email,
    customerPhone: input.customer.phone,
    lines: lines.value,
    vatRateBps,
    ...t,
    paidCents: paid,
    status: paid >= t.totalCents ? "paid" : paid > 0 ? "partially_paid" : "draft",
    issueDate: now,
    dueDate: now + Math.max(0, input.paymentTermsDays) * DAY,
    notes: (input.notes ?? "").trim().slice(0, 1000),
    bookingId: input.bookingId ?? null,
    paymentLink: null,
    createdAt: now,
    updatedAt: now,
  });
}

export const balanceDue = (i: Pick<Invoice, "totalCents" | "paidCents">): Cents => Math.max(0, i.totalCents - i.paidCents);

export function isOverdue(i: Invoice, now: number): boolean {
  return (i.status === "sent" || i.status === "partially_paid") && i.dueDate < now && balanceDue(i) > 0;
}

export function isOpen(i: Invoice): boolean {
  return i.status === "draft" || i.status === "sent" || i.status === "partially_paid";
}

export function displayStatus(i: Invoice, now: number): "Draft" | "Sent" | "Partly paid" | "Paid" | "Cancelled" | "Overdue" {
  if (isOverdue(i, now)) return "Overdue";
  return ({ draft: "Draft", sent: "Sent", partially_paid: "Partly paid", paid: "Paid", cancelled: "Cancelled" } as const)[i.status];
}

export function markSent(i: Invoice, now: number): Result<Invoice> {
  if (i.status === "cancelled") return err("invalid_state", "This invoice was cancelled.");
  if (i.status === "paid") return err("invalid_state", "This invoice is already paid.");
  return ok({ ...i, status: i.status === "draft" ? "sent" : i.status, updatedAt: now });
}

export function cancel(i: Invoice, now: number): Result<Invoice> {
  if (i.paidCents > 0) return err("invalid_state", "This invoice has payments. Record a refund outside THUSO, then issue a new invoice.");
  if (i.status === "cancelled") return err("invalid_state", "This invoice is already cancelled.");
  return ok({ ...i, status: "cancelled", paymentLink: null, updatedAt: now });
}

export function applyPayment(i: Invoice, amountCents: Cents, now: number): Result<Invoice> {
  if (i.status === "cancelled") return err("invalid_state", "This invoice was cancelled.");
  if (!isValidCents(amountCents) || amountCents <= 0) return err("validation", "Enter the amount received.", { field: "amount" });
  const paid = i.paidCents + amountCents;
  return ok({ ...i, paidCents: paid, status: paid >= i.totalCents ? "paid" : "partially_paid", updatedAt: now });
}

export function formatInvoiceNumber(n: number): string {
  return `INV-${n.toString().padStart(4, "0")}`;
}
