import { describe, expect, it } from "vitest";
import { unwrap } from "../shared/result";
import { OWNER, setup } from "../testing/fixtures";
import { matchesQuery } from "./index";

describe("customers", () => {
  it("normalises contact details and picks a sensible channel", async () => {
    const s = setup();
    const c = unwrap(await s.customers.add(s.biz.id, OWNER, { name: " Lerato K ", phone: "082 123 4567", email: "LERATO@Example.com" }));
    expect(c).toMatchObject({ name: "Lerato K", phone: "+27821234567", email: "lerato@example.com", preferredChannel: "whatsapp" });
  });

  it("needs a way to reach the customer", async () => {
    const s = setup();
    expect(await s.customers.add(s.biz.id, OWNER, { name: "No Contact" })).toMatchObject({ ok: false, error: { field: "phone" } });
  });

  it("detects duplicates by phone even when typed differently", async () => {
    const s = setup();
    const first = unwrap(await s.customers.add(s.biz.id, OWNER, { name: "Sipho", phone: "0821234567" }));
    const r = await s.customers.add(s.biz.id, OWNER, { name: "Sipho M", phone: "+27 82 123 4567" });
    expect(r).toMatchObject({ ok: false, error: { code: "duplicate", details: { customerId: first.id } } });
  });

  it("searches by name and phone", async () => {
    const s = setup();
    const c = unwrap(await s.customers.add(s.biz.id, OWNER, { name: "Sipho Mokoena", phone: "0821234567" }));
    expect(matchesQuery(c, "moko")).toBe(true);
    expect(matchesQuery(c, "082 123")).toBe(true);
    expect(matchesQuery(c, "thandi")).toBe(false);
  });
});
