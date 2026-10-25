import { isValidCents, type Cents } from "../../shared/money";
import { err, ok, type Result } from "../../shared/result";

/** Stock a service uses each time it is performed, e.g. one bottle of treatment per appointment. */
export interface StockUsage {
  readonly itemId: string;
  readonly quantity: number;
}

export interface Service {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly durationMinutes: number;
  readonly priceCents: Cents;
  /** Deposit required to secure a booking. 0 means no deposit. */
  readonly depositCents: Cents;
  readonly active: boolean;
  readonly stockUsage: readonly StockUsage[];
  readonly createdAt: number;
}

export interface ServiceInput {
  readonly name: string;
  readonly description?: string;
  readonly durationMinutes: number;
  readonly priceCents: Cents;
  readonly depositCents?: Cents;
  readonly active?: boolean;
  readonly stockUsage?: readonly StockUsage[];
}

export function buildService(id: string, input: ServiceInput, now: number, existing?: Service): Result<Service> {
  const name = input.name.trim();
  if (name.length < 2) return err("validation", "Give the service a name.", { field: "name" });
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 12 * 60 || input.durationMinutes % 5 !== 0) {
    return err("validation", "Duration must be between 5 minutes and 12 hours, in steps of 5 minutes.", { field: "durationMinutes" });
  }
  if (!isValidCents(input.priceCents)) return err("validation", "Enter a valid price.", { field: "priceCents" });
  const deposit = input.depositCents ?? 0;
  if (!isValidCents(deposit) || deposit > input.priceCents) return err("validation", "The deposit cannot be more than the price.", { field: "depositCents" });
  const usage = (input.stockUsage ?? []).filter((u) => u.itemId && u.quantity > 0);
  if (usage.some((u) => !Number.isFinite(u.quantity) || u.quantity > 10_000)) return err("validation", "Stock used must be a sensible number.", { field: "stockUsage" });
  return ok({
    id,
    name,
    description: (input.description ?? "").trim().slice(0, 300),
    durationMinutes: input.durationMinutes,
    priceCents: input.priceCents,
    depositCents: deposit,
    active: input.active ?? true,
    stockUsage: usage,
    createdAt: existing?.createdAt ?? now,
  });
}
