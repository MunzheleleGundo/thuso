import { describe, expect, it } from "vitest";
import { formatRand, normalizePhone, parseRand, percentOf, slugify } from "./index";
import { instantToLocalDate, instantToLocalTime, localToInstant, weekdayOf } from "./time";

describe("money", () => {
  it("parses rand amounts typed by people", () => {
    expect(parseRand("1200")).toBe(120000);
    expect(parseRand("R 1 200,5")).toBe(120050);
    expect(parseRand("99.99")).toBe(9999);
    expect(parseRand("12.345")).toBeNull();
    expect(parseRand("abc")).toBeNull();
  });
  it("calculates VAT with half-up rounding", () => {
    expect(percentOf(10000, 1500)).toBe(1500);
    expect(percentOf(333, 1500)).toBe(50); // 49.95 -> 50
  });
  it("formats rand", () => {
    expect(formatRand(125000)).toBe("R 1,250.00");
    expect(formatRand(125050)).toBe("R 1,250.50");
    expect(formatRand(-5)).toBe("-R 0.05");
  });
});

describe("text", () => {
  it("normalises South African numbers to E.164", () => {
    expect(normalizePhone("082 123 4567")).toBe("+27821234567");
    expect(normalizePhone("27821234567")).toBe("+27821234567");
    expect(normalizePhone("+27 82 123 4567")).toBe("+27821234567");
    expect(normalizePhone("123")).toBeNull();
  });
  it("makes web-safe slugs", () => {
    expect(slugify("Ndou's Hair & Nails!")).toBe("ndou-s-hair-and-nails");
    expect(slugify("   ")).toBe("");
  });
});

describe("time", () => {
  it("converts between local SA time and instants", () => {
    const t = localToInstant("2026-11-02", 9 * 60, 120);
    expect(new Date(t).toISOString()).toBe("2026-11-02T07:00:00.000Z");
    expect(instantToLocalDate(t, 120)).toBe("2026-11-02");
    expect(instantToLocalTime(t, 120)).toBe("09:00");
    expect(weekdayOf("2026-11-02")).toBe("mon");
    expect(weekdayOf("2026-11-08")).toBe("sun");
  });
  it("handles local midnight on the previous UTC day", () => {
    const t = localToInstant("2026-11-02", 30, 120); // 00:30 local = 22:30 UTC on the 1st
    expect(instantToLocalDate(t, 120)).toBe("2026-11-02");
  });
});
