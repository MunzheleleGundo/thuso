import type { Business } from "./business";
import { isEnabled } from "./modules";

export interface ChecklistFacts {
  readonly serviceCount: number;
  readonly stockItemCount: number;
  readonly customerCount: number;
  readonly invoiceCount: number;
}

export type ChecklistAction =
  | "profile" | "goals" | "modules" | "hours" | "invoice-details"
  | "services" | "stock" | "customers" | "booking-page" | "first-invoice" | "professionals";

export interface ChecklistItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly done: boolean;
  readonly action: ChecklistAction;
}

/**
 * The setup checklist on Home. It is derived, never stored: it always reflects
 * the business as it is now, including anything skipped during onboarding.
 */
export function deriveChecklist(b: Business, f: ChecklistFacts): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: "verify", title: "Verify your email", detail: "", done: true, action: "profile" },
    { id: "profile", title: "Tell us about your business", detail: "", done: true, action: "profile" },
    { id: "goals", title: "Tell us why you joined", detail: "", done: b.goals.length > 0 || b.goalNote.length > 0, action: "goals" },
    { id: "modules", title: "Choose your tools", detail: "", done: b.onboarding.next !== "modules" && b.onboarding.next !== "goals", action: "modules" },
  ];
  if (isEnabled(b.enabledModules, "bookings")) {
    items.push(
      { id: "hours", title: "Add your working hours", detail: "Needed before customers can book online", done: b.schedule !== null, action: "hours" },
      { id: "services", title: "Add the services you offer", detail: "Name, duration and price", done: f.serviceCount > 0, action: "services" },
      { id: "booking-page", title: "Share your booking page", detail: "Put the link in your WhatsApp status", done: b.schedule !== null && f.serviceCount > 0, action: "booking-page" },
    );
  }
  if (isEnabled(b.enabledModules, "invoicing")) {
    items.push(
      { id: "invoice-details", title: "Add contact and banking details", detail: "Shown on your invoices", done: b.contactPhone.length > 0 && b.bankDetails.length > 0, action: "invoice-details" },
      { id: "first-invoice", title: "Send your first invoice", detail: "With a payment link", done: f.invoiceCount > 0, action: "first-invoice" },
    );
  }
  if (isEnabled(b.enabledModules, "stock")) {
    items.push({ id: "stock", title: "Add your stock items", detail: "And set reorder levels", done: f.stockItemCount > 0, action: "stock" });
  }
  items.push({ id: "customers", title: "Add your first customer", detail: "Or let them add themselves when they book", done: f.customerCount > 0, action: "customers" });
  if (b.onboarding.skipped.includes("professionals")) {
    items.push({ id: "professionals", title: "Tell us what expert help you need", detail: "Accountants, lawyers and consultants", done: false, action: "professionals" });
  }
  return items;
}

export function checklistProgress(items: readonly ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
