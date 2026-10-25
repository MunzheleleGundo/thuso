/**
 * Money is always an integer number of cents (ZAR). Never use floats for money.
 */
export type Cents = number;

export const VAT_RATE_BPS = 1500; // 15% South African VAT, in basis points

export function isValidCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000_00;
}

/** Parse a user-typed rand amount ("1 200,50", "R1200.5", "1200") into cents. */
export function parseRand(input: string): Cents | null {
  const cleaned = input.replace(/[Rr\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** Basis-point percentage with half-up rounding to the nearest cent. */
export function percentOf(amount: Cents, bps: number): Cents {
  return Math.round((amount * bps) / 10_000);
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}
