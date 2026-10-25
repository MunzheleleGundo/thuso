import { describe, expect, it } from "vitest";
import { unwrap } from "../shared/result";
import { HOUR } from "../shared/time";
import { at, MONDAY, OWNER, setup } from "../testing/fixtures";

async function scenario(modules?: string[], vat = false) {
  const s = setup(modules, (b) => ({ ...b, vatRegistered: vat, vatNumber: vat ? "4123456789" : "" }));
  const item = unwrap(await s.stock.saveItem(s.biz.id, OWNER, "owner", null, { name: "Treatment bottle", priceCents: 5000, reorderLevel: 3 }, 4));
  const svc = unwrap(await s.bookings.saveService(s.biz.id, OWNER, "owner", null, {
    name: "Consultation", durationMinutes: 45, priceCents: 60000, depositCents: 10000, stockUsage: [{ itemId: item.id, quantity: 2 }],
  }));
  const cus = unwrap(await s.customers.add(s.biz.id, OWNER, { name: "Sipho M", phone: "0821234567", email: "sipho@example.com" }));
  const booking = unwrap(await s.bookings.create({ bizId: s.biz.id, actor: OWNER, role: "owner", customerId: cus.id, serviceId: svc.id, startAt: at(MONDAY, "09:00") }));
  return { ...s, item, svc, cus, booking };
}

describe("complete booking (booking -> invoice -> stock)", () => {
  it("previews every effect in plain language, then applies them atomically", async () => {
    const s = await scenario();
    s.clock.t = at(MONDAY, "10:00");
    const cmd = { bizId: s.biz.id, actor: OWNER, role: "owner" as const, bookingId: s.booking.id };
    const before = s.store.commits;
    const preview = unwrap(await s.workflows.previewCompleteBooking(cmd));
    expect(s.store.commits).toBe(before);
    expect(preview.effects.map((e) => e.title)).toEqual([
      "Create invoice", "Update stock: Treatment bottle", "Treatment bottle is running low", "Close booking",
    ]);
    expect(preview.effects[1]!.detail).toBe("4 goes to 2");

    const done = unwrap(await s.workflows.completeBooking(cmd));
    expect(s.store.commits).toBe(before + 1);
    const d = s.store.data(s.biz.id);
    expect(d.bookings.get(s.booking.id)?.status).toBe("completed");
    expect(d.bookings.get(s.booking.id)?.invoiceId).toBe(done.invoice?.id);
    expect(d.invoices.get(done.invoice!.id)?.totalCents).toBe(60000);
    expect(d.stock.get(s.item.id)?.quantity).toBe(2);
    expect(d.movements.at(-1)).toMatchObject({ delta: -2, reason: "used", refType: "booking" });
  });

  it("counts a paid deposit and adds VAT for registered businesses", async () => {
    const s = await scenario(undefined, true);
    const d = s.store.data(s.biz.id);
    d.bookings.set(s.booking.id, { ...s.booking, depositPaid: true });
    s.clock.t = at(MONDAY, "10:00");
    const done = unwrap(await s.workflows.completeBooking({ bizId: s.biz.id, actor: OWNER, role: "owner", bookingId: s.booking.id }));
    expect(done.invoice).toMatchObject({ subtotalCents: 60000, vatCents: 9000, totalCents: 69000, paidCents: 10000, status: "partially_paid" });
  });

  it("only uses the modules that are switched on", async () => {
    const s = await scenario(["bookings"]);
    s.clock.t = at(MONDAY, "10:00");
    const p = unwrap(await s.workflows.previewCompleteBooking({ bizId: s.biz.id, actor: OWNER, role: "owner", bookingId: s.booking.id }));
    expect(p.effects.map((e) => e.title)).toEqual(["Close booking"]);
    expect(p.draft.invoice).toBeNull();
  });

  it("cannot complete a booking that has not started", async () => {
    const s = await scenario();
    const r = await s.workflows.completeBooking({ bizId: s.biz.id, actor: OWNER, role: "owner", bookingId: s.booking.id });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_state" } });
    s.clock.advance(5 * HOUR);
  });
});

describe("create invoice", () => {
  it("creates an invoice and reduces stock for linked lines", async () => {
    const s = await scenario();
    const cmd = {
      bizId: s.biz.id, actor: OWNER, role: "owner" as const, customerId: s.cus.id,
      lines: [
        { description: "Treatment bottle", quantity: 3, unitPriceCents: 5000, stockItemId: s.item.id },
        { description: "Call-out", quantity: 1, unitPriceCents: 25050, stockItemId: null },
      ],
    };
    const p = unwrap(await s.workflows.previewCreateInvoice(cmd));
    expect(p.effects[0]!.detail).toContain("R 400.50");
    const inv = unwrap(await s.workflows.createInvoice(cmd));
    expect(inv.status).toBe("draft");
    expect(inv.number).toBeNull(); // the server assigns numbers
    expect(s.store.data(s.biz.id).stock.get(s.item.id)?.quantity).toBe(1);
  });

  it("explains what is missing", async () => {
    const s = await scenario();
    const r = await s.workflows.createInvoice({ bizId: s.biz.id, actor: OWNER, role: "owner", customerId: s.cus.id, lines: [{ description: "", quantity: 1, unitPriceCents: 0, stockItemId: null }] });
    expect(r).toMatchObject({ ok: false, error: { field: "lines" } });
  });
});
