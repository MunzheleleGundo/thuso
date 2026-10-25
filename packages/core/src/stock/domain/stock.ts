import { isValidCents, type Cents } from "../../shared/money";
import { err, ok, type Result } from "../../shared/result";

export interface StockItem {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly unit: string;
  readonly priceCents: Cents;
  readonly costCents: Cents;
  /**
   * Derived from movements. Adapters apply movements with an atomic increment, which keeps
   * offline sales from different phones from overwriting each other.
   */
  readonly quantity: number;
  readonly reorderLevel: number;
  readonly archived: boolean;
  readonly createdAt: number;
}

export type MovementReason = "opening" | "received" | "sold" | "used" | "adjusted" | "damaged" | "returned";

export const MOVEMENT_REASONS: readonly { id: MovementReason; label: string; sign: 1 | -1 | 0 }[] = [
  { id: "received", label: "Received stock", sign: 1 },
  { id: "sold", label: "Sold", sign: -1 },
  { id: "used", label: "Used in a service", sign: -1 },
  { id: "damaged", label: "Damaged or expired", sign: -1 },
  { id: "returned", label: "Returned by a customer", sign: 1 },
  { id: "adjusted", label: "Count correction", sign: 0 },
];

export interface StockMovement {
  readonly id: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly delta: number;
  readonly reason: MovementReason;
  readonly refType: "invoice" | "booking" | "manual";
  readonly refId: string;
  readonly note: string;
  readonly at: number;
  readonly by: string;
}

export interface StockItemInput {
  readonly name: string;
  readonly sku?: string;
  readonly unit?: string;
  readonly priceCents: Cents;
  readonly costCents?: Cents;
  readonly reorderLevel: number;
}

const validQty = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1_000_000 && Math.round(n * 1000) === n * 1000;

export function buildStockItem(id: string, input: StockItemInput, now: number, existing?: StockItem): Result<StockItem> {
  const name = input.name.trim();
  if (name.length < 2) return err("validation", "Give the item a name.", { field: "name" });
  if (!isValidCents(input.priceCents)) return err("validation", "Enter a valid selling price.", { field: "priceCents" });
  const cost = input.costCents ?? 0;
  if (!isValidCents(cost)) return err("validation", "Enter a valid cost price.", { field: "costCents" });
  if (!validQty(input.reorderLevel) || input.reorderLevel < 0) return err("validation", "Reorder level must be zero or more.", { field: "reorderLevel" });
  return ok({
    id,
    name,
    sku: (input.sku ?? "").trim().slice(0, 40),
    unit: (input.unit ?? "").trim().slice(0, 20) || "each",
    priceCents: input.priceCents,
    costCents: cost,
    quantity: existing?.quantity ?? 0,
    reorderLevel: input.reorderLevel,
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? now,
  });
}

export function validateDelta(delta: number): Result<number> {
  if (!validQty(delta) || delta === 0) return err("validation", "Enter a quantity other than zero.", { field: "quantity" });
  return ok(delta);
}

export const isLow = (i: Pick<StockItem, "quantity" | "reorderLevel" | "archived">) => !i.archived && i.quantity <= i.reorderLevel;
export const stockValue = (i: Pick<StockItem, "quantity" | "costCents">) => Math.round(Math.max(0, i.quantity) * i.costCents);
