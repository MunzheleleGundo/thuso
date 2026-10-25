import { describe, expect, it } from "vitest";
import { unwrap } from "../shared/result";
import { OWNER, setup } from "../testing/fixtures";

describe("stock", () => {
  it("records an opening quantity as a movement", async () => {
    const s = setup(["stock"]);
    const item = unwrap(await s.stock.saveItem(s.biz.id, OWNER, "owner", null, { name: "Bread", priceCents: 1800, reorderLevel: 5, unit: "loaf" }, 20));
    expect(item.quantity).toBe(20);
    expect(s.store.data(s.biz.id).movements).toHaveLength(1);
  });

  it("previews and applies adjustments with the right sign", async () => {
    const s = setup(["stock"]);
    const item = unwrap(await s.stock.saveItem(s.biz.id, OWNER, "owner", null, { name: "Bread", priceCents: 1800, reorderLevel: 5, unit: "loaf" }, 20));
    const p = unwrap(await s.stock.previewAdjust(s.biz.id, OWNER, "staff", item.id, "sold", 16));
    expect(p.effects.map((e) => e.title)).toEqual(["Sold: Bread", "Running low"]);
    expect(p.effects[0]!.detail).toBe("20 loaf goes to 4 loaf");
    expect(unwrap(await s.stock.adjust(s.biz.id, OWNER, "staff", item.id, "sold", 16)).quantity).toBe(4);
    // A count correction takes the new total.
    expect(unwrap(await s.stock.adjust(s.biz.id, OWNER, "staff", item.id, "adjusted", 10)).quantity).toBe(10);
    expect(await s.stock.adjust(s.biz.id, OWNER, "staff", item.id, "adjusted", 10)).toMatchObject({ ok: false });
  });

  it("does not let an edit overwrite the quantity", async () => {
    const s = setup(["stock"]);
    const item = unwrap(await s.stock.saveItem(s.biz.id, OWNER, "owner", null, { name: "Bread", priceCents: 1800, reorderLevel: 5 }, 20));
    unwrap(await s.stock.saveItem(s.biz.id, OWNER, "owner", item.id, { name: "White bread", priceCents: 1900, reorderLevel: 5 }));
    expect(s.store.data(s.biz.id).stock.get(item.id)).toMatchObject({ name: "White bread", quantity: 20 });
  });
});
