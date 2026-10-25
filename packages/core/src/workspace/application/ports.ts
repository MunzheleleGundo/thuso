import type { AuditOp } from "../../shared/audit";
import type { Business, Member } from "../domain/business";

export interface BusinessReader {
  get(bizId: string): Promise<Business | null>;
}

export interface SlugRegistry {
  /** True when nobody has claimed this public web address yet. */
  isAvailable(slug: string): Promise<boolean>;
}

export type WorkspaceOp =
  | { readonly kind: "business.create"; readonly business: Business; readonly owner: Member }
  | { readonly kind: "business.save"; readonly business: Business }
  | AuditOp;
