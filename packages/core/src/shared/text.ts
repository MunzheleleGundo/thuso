/** Formatting that every layer needs to agree on (previews, AI answers, UI). */

export function formatRand(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const rands = Math.floor(abs / 100);
  const c = abs % 100;
  const grouped = rands.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}R ${grouped}.${c.toString().padStart(2, "0")}`;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Normalise South African phone numbers to E.164 (+27...). Returns null if it does not look like a phone number. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+\d{9,15}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return "+27" + digits.slice(1);
  if (/^27\d{9}$/.test(digits)) return "+" + digits;
  return null;
}

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

export const nonEmpty = (s: string | undefined | null): s is string => typeof s === "string" && s.trim().length > 0;
