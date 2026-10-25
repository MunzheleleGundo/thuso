import { audit } from "../../shared/audit";
import { effect, type Preview } from "../../shared/effect";
import type { Cents } from "../../shared/money";
import type { Actor, Clock, IdGenerator, Writer } from "../../shared/ports";
import { err, ok, type Result } from "../../shared/result";
import { formatRand, isEmail } from "../../shared/text";
import { canManage, canWrite, type Role } from "../../workspace";
import { applyPayment, balanceDue, cancel, markSent, type Invoice } from "../domain/invoice";
import { paymentReference, type Payment, type PaymentMethod } from "../domain/payment";
import type { InvoiceOp, InvoiceReader, PaymentLinkGateway } from "./ports";

export interface InvoiceDeps {
  readonly invoices: InvoiceReader;
  readonly writer: Writer<InvoiceOp>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export const invoiceName = (i: Pick<Invoice, "number">) => i.number ?? "New invoice";

export function makeInvoiceUseCases(d: InvoiceDeps) {
  async function load(bizId: string, id: string): Promise<Result<Invoice>> {
    const i = await d.invoices.get(bizId, id);
    return i ? ok(i) : err("not_found", "We could not find this invoice.");
  }

  return {
    async markSent(bizId: string, actor: Actor, role: Role, id: string, channel: string): Promise<Result<Invoice>> {
      if (!canWrite(role)) return err("forbidden", "Your role cannot send invoices.");
      const i = await load(bizId, id);
      if (!i.ok) return i;
      const next = markSent(i.value, d.clock.now());
      if (!next.ok) return next;
      await d.writer.commit(bizId, [{ kind: "invoice.save", invoice: next.value }, audit(d.ids.next(), d.clock.now(), actor, "invoice.sent", `Sent ${invoiceName(i.value)} to ${i.value.customerName} by ${channel}`, { invoiceId: id })]);
      return next;
    },

    async previewCancel(bizId: string, id: string): Promise<Result<Preview<Invoice>>> {
      const i = await load(bizId, id);
      if (!i.ok) return i;
      const next = cancel(i.value, d.clock.now());
      if (!next.ok) return next;
      return ok({
        effects: [
          effect("money", `Cancel ${invoiceName(i.value)}`, `${formatRand(i.value.totalCents)} for ${i.value.customerName}. It stays on record, marked cancelled.`),
          ...(i.value.paymentLink ? [effect("warning", "Payment link stops working", "The customer can no longer pay this invoice online.")] : []),
        ],
        draft: next.value,
      });
    },

    async cancel(bizId: string, actor: Actor, role: Role, id: string): Promise<Result<Invoice>> {
      if (!canManage(role)) return err("forbidden", "Only the owner or an admin can cancel invoices.");
      const i = await load(bizId, id);
      if (!i.ok) return i;
      const next = cancel(i.value, d.clock.now());
      if (!next.ok) return next;
      await d.writer.commit(bizId, [{ kind: "invoice.save", invoice: next.value }, audit(d.ids.next(), d.clock.now(), actor, "invoice.cancelled", `Cancelled ${invoiceName(i.value)}`, { invoiceId: id })]);
      return next;
    },

    async previewManualPayment(bizId: string, id: string, amountCents: Cents, method: PaymentMethod): Promise<Result<Preview<Invoice>>> {
      const i = await load(bizId, id);
      if (!i.ok) return i;
      const next = applyPayment(i.value, amountCents, d.clock.now());
      if (!next.ok) return next;
      const over = amountCents > balanceDue(i.value);
      return ok({
        effects: [
          effect("money", `Record ${formatRand(amountCents)} received`, `${method === "cash" ? "Cash" : method === "eft" ? "EFT" : "Card"} payment from ${i.value.customerName}`),
          effect("money", next.value.status === "paid" ? "Invoice fully paid" : "Balance remaining", next.value.status === "paid" ? `${invoiceName(i.value)} will show as paid` : formatRand(balanceDue(next.value))),
          ...(over ? [effect("warning", "More than the balance", `The balance was ${formatRand(balanceDue(i.value))}.`)] : []),
        ],
        draft: next.value,
      });
    },

    async recordManualPayment(bizId: string, actor: Actor, role: Role, id: string, amountCents: Cents, method: Exclude<PaymentMethod, "card">, note = ""): Promise<Result<Invoice>> {
      if (!canManage(role)) return err("forbidden", "Only the owner or an admin can record payments.");
      const i = await load(bizId, id);
      if (!i.ok) return i;
      const now = d.clock.now();
      const next = applyPayment(i.value, amountCents, now);
      if (!next.ok) return next;
      const payment: Payment = { id: d.ids.next(), invoiceId: id, amountCents, method, provider: "manual", providerRef: "", receivedAt: now, recordedBy: actor.uid, note: note.trim().slice(0, 200) };
      await d.writer.commit(bizId, [
        { kind: "payment.save", payment },
        { kind: "invoice.save", invoice: next.value },
        audit(d.ids.next(), now, actor, "payment.recorded", `Recorded ${formatRand(amountCents)} ${method} for ${invoiceName(i.value)}`, { invoiceId: id, paymentId: payment.id }),
      ]);
      return next;
    },
  };
}

/** Server side: ask the payment provider for a hosted payment page for the outstanding balance. */
export async function requestPaymentLink(args: {
  bizId: string; invoice: Invoice; businessName: string; fallbackEmail: string; gateway: PaymentLinkGateway;
  callbackUrl: string; nonce: string; now: number; actor: Actor; auditId: string;
}): Promise<Result<{ invoice: Invoice; ops: InvoiceOp[] }>> {
  const inv = args.invoice;
  if (inv.status === "cancelled") return err("invalid_state", "This invoice was cancelled.");
  const due = balanceDue(inv);
  if (due <= 0) return err("invalid_state", "This invoice is already paid.");
  if (due < 100) return err("validation", "Online payments must be at least R 1.");
  const reference = paymentReference(args.bizId, inv.id, args.nonce);
  const email = isEmail(inv.customerEmail) ? inv.customerEmail : args.fallbackEmail;
  const { url } = await args.gateway.createLink({
    reference, amountCents: due, email,
    description: `${args.businessName} ${inv.number ?? "invoice"}`,
    callbackUrl: args.callbackUrl,
    metadata: { bizId: args.bizId, invoiceId: inv.id, invoiceNumber: inv.number ?? "" },
  });
  const sent = markSent(inv, args.now);
  const next: Invoice = { ...(sent.ok ? sent.value : inv), paymentLink: { url, reference, createdAt: args.now } };
  return ok({ invoice: next, ops: [{ kind: "invoice.save", invoice: next }, audit(args.auditId, args.now, args.actor, "invoice.payment_link", `Created a payment link for ${invoiceName(inv)}`, { invoiceId: inv.id })] });
}

/**
 * Server side: a verified provider webhook says money arrived. Idempotent: the payment id
 * is the provider reference, so a repeated webhook records nothing new.
 */
export function planProviderPayment(args: {
  invoice: Invoice; alreadyRecorded: boolean; reference: string; amountCents: Cents; now: number;
}): Result<{ ops: InvoiceOp[]; invoice: Invoice }> {
  if (args.alreadyRecorded) return ok({ ops: [], invoice: args.invoice });
  // A payment that arrives after cancellation is still recorded so the money is never lost from view.
  const base = args.invoice.status === "cancelled" ? { ...args.invoice, status: "sent" as const } : args.invoice;
  const next = applyPayment(base, args.amountCents, args.now);
  if (!next.ok) return next;
  const payment: Payment = {
    id: args.reference, invoiceId: args.invoice.id, amountCents: args.amountCents, method: "card", provider: "paystack",
    providerRef: args.reference, receivedAt: args.now, recordedBy: "system", note: "",
  };
  const actor = { uid: "system", name: "Paystack" };
  return ok({
    invoice: next.value,
    ops: [
      { kind: "payment.save", payment },
      { kind: "invoice.save", invoice: next.value },
      audit(`${args.reference}-audit`, args.now, actor, "payment.received", `Received ${formatRand(args.amountCents)} online for ${invoiceName(args.invoice)}`, { invoiceId: args.invoice.id, paymentId: payment.id }),
    ],
  });
}
