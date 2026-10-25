import type { AuditOp } from "../../shared/audit";
import type { Cents } from "../../shared/money";
import type { Invoice } from "../domain/invoice";
import type { Payment } from "../domain/payment";

export interface InvoiceReader {
  get(bizId: string, id: string): Promise<Invoice | null>;
  /** Draft, sent and partly paid invoices. */
  listOpen(bizId: string): Promise<Invoice[]>;
  /** Invoices issued in [from, to). */
  listIssuedBetween(bizId: string, from: number, to: number): Promise<Invoice[]>;
}

/** A payment provider that can create a hosted payment page (Paystack, Peach Payments). */
export interface PaymentLinkGateway {
  createLink(req: {
    reference: string;
    amountCents: Cents;
    email: string;
    description: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ url: string }>;
}

export type InvoiceOp =
  | { readonly kind: "invoice.save"; readonly invoice: Invoice }
  | { readonly kind: "payment.save"; readonly payment: Payment }
  | AuditOp;
