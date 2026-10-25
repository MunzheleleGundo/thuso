import { describe, expect, it } from "vitest";
import { toWrites } from "./storage";
import type { Invoice } from "./invoicing";

describe("storage contract", () => {
  const inv = { id: "i1", number: "INV-0001", paymentLink: { url: "u", reference: "r", createdAt: 1 }, totalCents: 100 } as unknown as Invoice;
  it("never lets the browser write server-owned invoice fields", () => {
    const [w] = toWrites("b1", [{ kind: "invoice.save", invoice: inv }], "client");
    expect(w).toMatchObject({ op: "set", merge: true, path: "businesses/b1/invoices/i1" });
    expect(w && "data" in w ? Object.keys(w.data) : []).not.toContain("number");
    expect(w && "data" in w ? Object.keys(w.data) : []).not.toContain("paymentLink");
  });
  it("lets the server write the payment link but still not the number", () => {
    const [w] = toWrites("b1", [{ kind: "invoice.save", invoice: inv }], "server");
    expect(w && "data" in w ? w.data : {}).toHaveProperty("paymentLink");
    expect(w && "data" in w ? w.data : {}).not.toHaveProperty("number");
  });
  it("turns stock movements into a record plus an atomic increment", () => {
    const writes = toWrites("b1", [{ kind: "stock.move", movement: { id: "m1", itemId: "s1", itemName: "Bread", delta: -2, reason: "sold", refType: "manual", refId: "", note: "", at: 1, by: "u" } }], "client");
    expect(writes.map((x) => x.op)).toEqual(["set", "increment"]);
    expect(writes[1]).toMatchObject({ path: "businesses/b1/stockItems/s1", field: "quantity", by: -2 });
  });
  it("claims one create-only lock per block", () => {
    const writes = toWrites("b1", [{ kind: "slots.claim", staffId: "main", blocks: [1, 2], bookingId: "bk" }], "client");
    expect(writes).toEqual([
      { op: "create", path: "businesses/b1/slotLocks/main_1", data: { bookingId: "bk", at: 1 } },
      { op: "create", path: "businesses/b1/slotLocks/main_2", data: { bookingId: "bk", at: 2 } },
    ]);
  });
});
