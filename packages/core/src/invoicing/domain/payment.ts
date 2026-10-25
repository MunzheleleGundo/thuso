import type { Cents } from "../../shared/money";

export type PaymentMethod = "cash" | "eft" | "card";

export interface Payment {
  /** For provider payments this is the provider reference, which makes recording idempotent. */
  readonly id: string;
  readonly invoiceId: string;
  readonly amountCents: Cents;
  readonly method: PaymentMethod;
  readonly provider: "manual" | "paystack";
  readonly providerRef: string;
  readonly receivedAt: number;
  readonly recordedBy: string;
  readonly note: string;
}

/** Payment references sent to the provider: "<bizId>.<invoiceId>.<nonce>". */
export function paymentReference(bizId: string, invoiceId: string, nonce: string): string {
  return `${bizId}.${invoiceId}.${nonce}`.slice(0, 100);
}

export function parsePaymentReference(ref: string): { bizId: string; invoiceId: string } | null {
  const parts = ref.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1]) return null;
  return { bizId: parts[0], invoiceId: parts[1] };
}
