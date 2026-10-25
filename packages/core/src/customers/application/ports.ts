import type { AuditOp } from "../../shared/audit";
import type { Customer } from "../domain/customer";

export interface CustomerReader {
  get(bizId: string, id: string): Promise<Customer | null>;
  /** Exact matches on normalised phone or email, used to avoid duplicates. */
  findByContact(bizId: string, contact: { phone?: string; email?: string }): Promise<Customer | null>;
  list(bizId: string, limit: number): Promise<Customer[]>;
}

export type CustomerOp = { readonly kind: "customer.save"; readonly customer: Customer } | AuditOp;
