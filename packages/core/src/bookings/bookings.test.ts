import { describe, expect, it } from "vitest";
import { unwrap } from "../shared/result";
import { instantToLocalTime, MINUTE } from "../shared/time";
import { ConflictError } from "../testing";
import { at, MONDAY, OFFSET, OWNER, setup } from "../testing/fixtures";
import { availableStarts, lockBlocks, planPublicBooking } from "./index";
import { DEFAULT_SCHEDULE } from "../workspace";

async function withServiceAndCustomer(modules?: string[]) {
  const s = setup(modules);
  const svc = unwrap(await s.bookings.saveService(s.biz.id, OWNER, "owner", null, { name: "Consultation", durationMinutes: 45, priceCents: 60000, depositCents: 10000 }));
  const cus = unwrap(await s.customers.add(s.biz.id, OWNER, { name: "Sipho M", phone: "082 123 4567" }));
  return { ...s, svc, cus };
}

describe("availability", () => {
  it("lists free starts inside hours, skipping busy time and respecting notice", () => {
    const now = at(MONDAY, "08:10");
    const starts = availableStarts({
      schedule: DEFAULT_SCHEDULE, utcOffsetMinutes: OFFSET, localDate: MONDAY, durationMinutes: 30, now,
      busy: [{ startAt: at(MONDAY, "10:00"), endAt: at(MONDAY, "11:00") }],
    });
    const times = starts.map((t) => instantToLocalTime(t, OFFSET));
    expect(times[0]).toBe("09:30"); // 60 min notice from 08:10, then the next 30-minute step
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:00");
    expect(times.at(-1)).toBe("16:30"); // must finish by 17:00
  });
  it("returns nothing on a closed day", () => {
    expect(availableStarts({ schedule: DEFAULT_SCHEDULE, utcOffsetMinutes: OFFSET, localDate: "2026-11-08", durationMinutes: 30, busy: [], now: 0 })).toEqual([]);
  });
});

describe("slot locks", () => {
  it("cover every 15 minute block a booking touches", () => {
    const start = at(MONDAY, "09:00");
    expect(lockBlocks(start, start + 45 * MINUTE)).toHaveLength(3);
    expect(lockBlocks(start + 10 * MINUTE, start + 20 * MINUTE)).toHaveLength(2);
  });
});

describe("booking in the app", () => {
  it("previews then creates a confirmed booking and claims its slots", async () => {
    const s = await withServiceAndCustomer();
    const cmd = { bizId: s.biz.id, actor: OWNER, role: "owner" as const, customerId: s.cus.id, serviceId: s.svc.id, startAt: at(MONDAY, "09:00") };
    const preview = unwrap(await s.bookings.previewCreate(cmd));
    expect(preview.effects[0]!.title).toBe("Book Consultation");
    expect(s.store.commits).toBe(2); // service + customer only, the preview wrote nothing
    const b = unwrap(await s.bookings.create(cmd));
    expect(b.status).toBe("confirmed");
    expect(s.store.data(s.biz.id).locks.size).toBe(3);
  });

  it("refuses an overlapping booking with a plain message", async () => {
    const s = await withServiceAndCustomer();
    const base = { bizId: s.biz.id, actor: OWNER, role: "owner" as const, customerId: s.cus.id, serviceId: s.svc.id };
    unwrap(await s.bookings.create({ ...base, startAt: at(MONDAY, "09:00") }));
    const r = await s.bookings.create({ ...base, startAt: at(MONDAY, "09:30") });
    expect(r).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("needs an explicit override outside working hours", async () => {
    const s = await withServiceAndCustomer();
    const base = { bizId: s.biz.id, actor: OWNER, role: "owner" as const, customerId: s.cus.id, serviceId: s.svc.id, startAt: at(MONDAY, "18:00") };
    expect(await s.bookings.create(base)).toMatchObject({ ok: false, error: { field: "startAt" } });
    expect((await s.bookings.create({ ...base, outsideHours: true })).ok).toBe(true);
  });

  it("does not let viewers book", async () => {
    const s = await withServiceAndCustomer();
    const r = await s.bookings.create({ bizId: s.biz.id, actor: OWNER, role: "viewer", customerId: s.cus.id, serviceId: s.svc.id, startAt: at(MONDAY, "09:00") });
    expect(r).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("frees the slot when cancelled", async () => {
    const s = await withServiceAndCustomer();
    const base = { bizId: s.biz.id, actor: OWNER, role: "owner" as const, customerId: s.cus.id, serviceId: s.svc.id, startAt: at(MONDAY, "09:00") };
    const b = unwrap(await s.bookings.create(base));
    const p = unwrap(await s.bookings.previewStatus(s.biz.id, OWNER, "owner", b.id, "cancelled"));
    expect(p.effects.map((e) => e.title)).toContain("Free up the time slot");
    unwrap(await s.bookings.setStatus(s.biz.id, OWNER, "owner", b.id, "cancelled"));
    expect(s.store.data(s.biz.id).locks.size).toBe(0);
    expect((await s.bookings.create(base)).ok).toBe(true);
  });

  it("only allows valid status changes", async () => {
    const s = await withServiceAndCustomer();
    const b = unwrap(await s.bookings.create({ bizId: s.biz.id, actor: OWNER, role: "owner", customerId: s.cus.id, serviceId: s.svc.id, startAt: at(MONDAY, "09:00") }));
    unwrap(await s.bookings.setStatus(s.biz.id, OWNER, "owner", b.id, "cancelled"));
    expect(await s.bookings.setStatus(s.biz.id, OWNER, "owner", b.id, "confirmed")).toMatchObject({ ok: false, error: { code: "invalid_state" } });
  });

  it("is refused when bookings are switched off", async () => {
    const s = await withServiceAndCustomer(["invoicing"]);
    const r = await s.bookings.create({ bizId: s.biz.id, actor: OWNER, role: "owner", customerId: s.cus.id, serviceId: s.svc.id, startAt: at(MONDAY, "09:00") });
    expect(r).toMatchObject({ ok: false, error: { code: "module_disabled" } });
  });
});

describe("public booking", () => {
  it("creates the customer and a requested booking when a deposit is due", async () => {
    const s = await withServiceAndCustomer();
    const r = unwrap(planPublicBooking({
      bookingId: "pb1", newCustomerId: "pc1", business: s.biz, service: s.svc, existingCustomer: null,
      customerInput: { name: "Thandi N", phone: "0731112222", consent: { whatsapp: true } },
      startAt: at(MONDAY, "11:00"), now: s.clock.now(), bookingsThatDay: [], notes: "",
    }));
    expect(r.booking.status).toBe("requested");
    expect(r.customer.source).toBe("public");
    expect(r.customer.consent.whatsapp).toBe(true);
    await s.store.commit(s.biz.id, r.ops);
    expect(s.store.data(s.biz.id).customers.has("pc1")).toBe(true);
  });

  it("refuses times that are not offered", async () => {
    const s = await withServiceAndCustomer();
    const r = planPublicBooking({
      bookingId: "pb1", newCustomerId: "pc1", business: s.biz, service: s.svc, existingCustomer: null,
      customerInput: { name: "Thandi N", phone: "0731112222" }, startAt: at(MONDAY, "09:10"), now: s.clock.now(), bookingsThatDay: [], notes: "",
    });
    expect(r).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("lets only one of two simultaneous bookings for the same slot through", async () => {
    const s = await withServiceAndCustomer();
    const plan = (id: string) => unwrap(planPublicBooking({
      bookingId: id, newCustomerId: `c-${id}`, business: s.biz, service: s.svc, existingCustomer: null,
      customerInput: { name: `Person ${id}`, phone: id === "a" ? "0710000001" : "0710000002" }, startAt: at(MONDAY, "11:00"),
      now: s.clock.now(), bookingsThatDay: [], notes: "",
    }));
    const a = plan("a");
    const b = plan("b"); // planned before a was committed, so it saw a free slot
    await s.store.commit(s.biz.id, a.ops);
    await expect(s.store.commit(s.biz.id, b.ops)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("deposits", () => {
  it("records a deposit and confirms a requested booking", async () => {
    const s = await withServiceAndCustomer();
    const plan = unwrap(planPublicBooking({
      bookingId: "pb1", newCustomerId: "pc1", business: s.biz, service: s.svc, existingCustomer: null,
      customerInput: { name: "Thandi N", phone: "0731112222" }, startAt: at(MONDAY, "11:00"), now: s.clock.now(), bookingsThatDay: [], notes: "",
    }));
    await s.store.commit(s.biz.id, plan.ops);
    expect(await s.bookings.setDepositPaid(s.biz.id, OWNER, "staff", "pb1")).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const b = unwrap(await s.bookings.setDepositPaid(s.biz.id, OWNER, "owner", "pb1"));
    expect(b).toMatchObject({ depositPaid: true, status: "confirmed" });
    expect(await s.bookings.setDepositPaid(s.biz.id, OWNER, "owner", "pb1")).toMatchObject({ ok: false });
  });
});
