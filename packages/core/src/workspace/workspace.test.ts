import { describe, expect, it } from "vitest";
import { unwrap } from "../shared/result";
import { MemoryStore, FixedClock, SeqIds } from "../testing";
import { OWNER, setup } from "../testing/fixtures";
import {
  deriveChecklist, makeWorkspaceUseCases, normalizeModules, requiredOnboardingDone, suggestModules, validateSchedule, DEFAULT_SCHEDULE,
} from "./index";

const profile = { name: "Ndou Studio", industry: "beauty", size: "2-10", province: "Limpopo", town: "Thohoyandou", ownerRole: "Owner or founder" } as const;

describe("modules", () => {
  it("always includes core modules and drops unknown or unavailable ones", () => {
    expect(normalizeModules([])).toEqual(["customers", "assistant"]);
    expect(normalizeModules(["stock", "nope", "compliance", "bookings", "stock"])).toEqual(["customers", "assistant", "bookings", "stock"]);
  });
  it("suggests modules from goals", () => {
    expect(suggestModules(["get_paid", "bookings", "customers"]).sort()).toEqual(["bookings", "invoicing"]);
  });
});

describe("onboarding", () => {
  function fresh() {
    const store = new MemoryStore();
    const uc = makeWorkspaceUseCases({ businesses: store, slugs: store, writer: store, ids: new SeqIds("w"), clock: new FixedClock(1_000) });
    return { store, uc };
  }

  it("creates a business with an owner and a unique web address", async () => {
    const { store, uc } = fresh();
    const a = unwrap(await uc.createBusiness({ actor: OWNER, email: "o@x.co", profile }));
    const b = unwrap(await uc.createBusiness({ actor: OWNER, email: "o@x.co", profile }));
    expect(a.slug).toBe("ndou-studio");
    expect(b.slug).toBe("ndou-studio-2");
    expect(store.data(a.id).members.get(OWNER.uid)?.role).toBe("owner");
    expect(a.onboarding.next).toBe("goals");
  });

  it("rejects an incomplete profile with a plain message", async () => {
    const { uc } = fresh();
    const r = await uc.createBusiness({ actor: OWNER, email: "o@x.co", profile: { ...profile, name: " " } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("name");
  });

  it("walks the wizard, lets optional steps be skipped and never moves backwards", async () => {
    const { uc } = fresh();
    const biz = unwrap(await uc.createBusiness({ actor: OWNER, email: "o@x.co", profile }));
    let b = unwrap(await uc.saveGoals(biz.id, OWNER, ["get_paid", "bookings"], ""));
    expect(b.onboarding.next).toBe("modules");
    expect(requiredOnboardingDone(b)).toBe(false);
    b = unwrap(await uc.chooseModules(biz.id, OWNER, "owner", ["invoicing", "bookings"], true));
    expect(b.onboarding.next).toBe("professionals");
    expect(requiredOnboardingDone(b)).toBe(true);
    unwrap(await uc.skip(biz.id, OWNER, "professionals"));
    b = unwrap(await uc.skip(biz.id, OWNER, "hours"));
    expect(b.onboarding.next).toBe("done");
    expect(b.onboarding.skipped).toEqual(["professionals", "hours"]);
    // Editing goals later does not reopen the wizard.
    b = unwrap(await uc.saveGoals(biz.id, OWNER, ["stock"], ""));
    expect(b.onboarding.next).toBe("done");
    // Doing a skipped step later clears it from the skipped list.
    b = unwrap(await uc.saveSchedule(biz.id, OWNER, "owner", DEFAULT_SCHEDULE));
    expect(b.onboarding.skipped).toEqual(["professionals"]);
    expect(await uc.skip(biz.id, OWNER, "goals")).toMatchObject({ ok: false });
  });

  it("only lets owners and admins switch tools", async () => {
    const { uc } = fresh();
    const biz = unwrap(await uc.createBusiness({ actor: OWNER, email: "o@x.co", profile }));
    expect(await uc.chooseModules(biz.id, OWNER, "staff", ["stock"], false)).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("previews switching tools off without losing data", () => {
    const { biz, workspace } = setup(["bookings", "stock"]);
    const p = workspace.previewModules(biz, ["bookings", "invoicing"]);
    expect(p.draft).toEqual(["customers", "assistant", "bookings", "invoicing"]);
    expect(p.effects.map((e) => e.title)).toEqual(["Switch on Invoices and payments", "Switch off Stock"]);
    expect(p.effects[1]!.detail).toMatch(/data is kept/);
  });

  it("validates working hours", () => {
    expect(validateSchedule(DEFAULT_SCHEDULE).ok).toBe(true);
    const bad = { ...DEFAULT_SCHEDULE, days: { ...DEFAULT_SCHEDULE.days, mon: { open: true, from: "17:00", to: "08:00" } } };
    expect(validateSchedule(bad)).toMatchObject({ ok: false, error: { field: "mon" } });
  });

  it("validates VAT numbers in settings", async () => {
    const { workspace, biz } = setup();
    expect(await workspace.updateProfile(biz.id, OWNER, "owner", { vatRegistered: true, vatNumber: "123" })).toMatchObject({ ok: false, error: { field: "vatNumber" } });
    expect((await workspace.updateProfile(biz.id, OWNER, "owner", { vatRegistered: true, vatNumber: "4123456789" })).ok).toBe(true);
  });
});

describe("setup checklist", () => {
  it("shows only items for enabled tools and reflects skipped steps", () => {
    const { biz } = setup(["invoicing"], (b) => ({ ...b, schedule: null, onboarding: { next: "done", skipped: ["professionals", "hours"], checklistDismissed: false } }));
    const items = deriveChecklist(biz, { serviceCount: 0, stockItemCount: 0, customerCount: 0, invoiceCount: 0 });
    const ids = items.map((i) => i.id);
    expect(ids).toContain("invoice-details");
    expect(ids).not.toContain("hours");
    expect(ids).not.toContain("stock");
    expect(ids).toContain("professionals");
  });
  it("asks for working hours when bookings are on and hours were skipped", () => {
    const { biz } = setup(["bookings"], (b) => ({ ...b, schedule: null }));
    const hours = deriveChecklist(biz, { serviceCount: 1, stockItemCount: 0, customerCount: 1, invoiceCount: 0 }).find((i) => i.id === "hours");
    expect(hours?.done).toBe(false);
  });
});
