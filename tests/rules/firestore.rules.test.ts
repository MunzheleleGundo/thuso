/**
 * Security rules tests. Run with the Firestore emulator:  npm run test:rules
 * (needs Java 11+; the Firebase CLI downloads the emulator on first run).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch, increment, type Firestore } from "firebase/firestore";

let env: RulesTestEnvironment;
const OWNER = "owner1";
const STAFF = "staff1";
const STRANGER = "stranger1";

const business = (id: string, owner: string, modules = ["customers", "assistant", "bookings", "invoicing"]) => ({
  id, ownerId: owner, slug: id, plan: "free", name: "Ndou Studio", currency: "ZAR", createdAt: 1,
  enabledModules: modules, paymentTermsDays: 7,
});
const invoice = (id: string) => ({
  id, customerId: "c1", customerName: "Sipho", lines: [{ description: "Work", quantity: 1, unitPriceCents: 1000, stockItemId: null }],
  subtotalCents: 1000, vatCents: 0, totalCents: 1000, paidCents: 0, status: "draft", createdAt: 1,
});

function db(uid: string, verified = true): Firestore {
  return env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: verified }).firestore() as unknown as Firestore;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-thuso-rules",
    firestore: { rules: readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8") },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, "businesses/b1"), business("b1", OWNER));
    await setDoc(doc(fs, "businesses/b1/members/" + OWNER), { uid: OWNER, role: "owner" });
    await setDoc(doc(fs, "businesses/b1/members/" + STAFF), { uid: STAFF, role: "staff" });
    await setDoc(doc(fs, "businesses/b1/customers/c1"), { id: "c1", name: "Sipho", phone: "", email: "s@x.co", preferredChannel: "email", archived: false });
    await setDoc(doc(fs, "businesses/b1/invoices/i1"), { ...invoice("i1"), number: "INV-0001" });
    await setDoc(doc(fs, "slugs/b1"), { bizId: "b1" });
  });
});

describe("creating a business", () => {
  it("lets a verified user create a business, owner membership and slug together", async () => {
    const fs = db("newuser");
    const batch = writeBatch(fs);
    batch.set(doc(fs, "businesses/b2"), business("b2", "newuser", ["customers", "assistant"]));
    batch.set(doc(fs, "businesses/b2/members/newuser"), { uid: "newuser", role: "owner" });
    batch.set(doc(fs, "slugs/b2"), { bizId: "b2" });
    await assertSucceeds(batch.commit());
  });

  it("blocks unverified email accounts", async () => {
    const fs = db("newuser", false);
    const batch = writeBatch(fs);
    batch.set(doc(fs, "businesses/b2"), business("b2", "newuser", ["customers", "assistant"]));
    batch.set(doc(fs, "businesses/b2/members/newuser"), { uid: "newuser", role: "owner" });
    batch.set(doc(fs, "slugs/b2"), { bizId: "b2" });
    await assertFails(batch.commit());
  });

  it("does not let anyone make themselves owner of an existing business", async () => {
    await assertFails(setDoc(doc(db(STRANGER), "businesses/b1/members/" + STRANGER), { uid: STRANGER, role: "owner" }));
  });

  it("does not let a slug be taken twice", async () => {
    const fs = db("newuser");
    const batch = writeBatch(fs);
    batch.set(doc(fs, "businesses/b2"), { ...business("b2", "newuser", ["customers", "assistant"]), slug: "b1" });
    batch.set(doc(fs, "businesses/b2/members/newuser"), { uid: "newuser", role: "owner" });
    batch.set(doc(fs, "slugs/b1"), { bizId: "b2" });
    await assertFails(batch.commit());
  });
});

describe("tenant isolation", () => {
  it("members read their business; strangers cannot", async () => {
    await assertSucceeds(getDoc(doc(db(STAFF), "businesses/b1")));
    await assertFails(getDoc(doc(db(STRANGER), "businesses/b1")));
    await assertFails(getDoc(doc(db(STRANGER), "businesses/b1/customers/c1")));
  });
  it("strangers cannot write into another business", async () => {
    await assertFails(setDoc(doc(db(STRANGER), "businesses/b1/customers/c2"), { id: "c2", name: "X", phone: "", email: "", preferredChannel: "email", archived: false }));
  });
});

describe("roles", () => {
  it("staff can add customers but cannot change settings or tools", async () => {
    await assertSucceeds(setDoc(doc(db(STAFF), "businesses/b1/customers/c2"), { id: "c2", name: "Thandi", phone: "+27731112222", email: "", preferredChannel: "whatsapp", archived: false }));
    await assertFails(updateDoc(doc(db(STAFF), "businesses/b1"), { enabledModules: ["customers", "assistant", "stock"] }));
  });
  it("owners cannot change immutable business fields or turn on unavailable tools", async () => {
    await assertFails(updateDoc(doc(db(OWNER), "businesses/b1"), { plan: "enterprise" }));
    await assertFails(updateDoc(doc(db(OWNER), "businesses/b1"), { enabledModules: ["customers", "assistant", "compliance"] }));
    await assertSucceeds(updateDoc(doc(db(OWNER), "businesses/b1"), { enabledModules: ["customers", "assistant", "stock"] }));
  });
});

describe("module gate", () => {
  it("rejects stock writes while Stock is switched off, and allows them once on", async () => {
    const item = { id: "s1", name: "Bread", priceCents: 1800, costCents: 1000, reorderLevel: 2, archived: false };
    await assertFails(setDoc(doc(db(OWNER), "businesses/b1/stockItems/s1"), item));
    await assertSucceeds(updateDoc(doc(db(OWNER), "businesses/b1"), { enabledModules: ["customers", "assistant", "stock"] }));
    await assertSucceeds(setDoc(doc(db(OWNER), "businesses/b1/stockItems/s1"), item));
  });
  it("still lets members read data of a switched-off module", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "businesses/b1/stockItems/s1"), { id: "s1", name: "Bread" }));
    await assertSucceeds(getDoc(doc(db(STAFF), "businesses/b1/stockItems/s1")));
  });
});

describe("double booking protection", () => {
  it("a slot lock can be created once and never overwritten", async () => {
    await assertSucceeds(setDoc(doc(db(STAFF), "businesses/b1/slotLocks/main_100"), { bookingId: "bk1", at: 100 }));
    await assertFails(setDoc(doc(db(OWNER), "businesses/b1/slotLocks/main_100"), { bookingId: "bk2", at: 100 }));
  });
});

describe("money", () => {
  it("clients cannot set invoice numbers or payment links", async () => {
    await assertFails(setDoc(doc(db(OWNER), "businesses/b1/invoices/i2"), { ...invoice("i2"), number: "INV-9999" }));
    await assertSucceeds(setDoc(doc(db(OWNER), "businesses/b1/invoices/i2"), invoice("i2")));
    await assertFails(updateDoc(doc(db(OWNER), "businesses/b1/invoices/i1"), { number: "INV-0002" }));
    await assertFails(updateDoc(doc(db(OWNER), "businesses/b1/invoices/i1"), { paymentLink: { url: "https://evil" } }));
  });
  it("staff can mark an invoice sent but cannot record money or cancel", async () => {
    await assertSucceeds(updateDoc(doc(db(STAFF), "businesses/b1/invoices/i1"), { status: "sent" }));
    await assertFails(updateDoc(doc(db(STAFF), "businesses/b1/invoices/i1"), { paidCents: 1000, status: "paid" }));
    await assertFails(updateDoc(doc(db(STAFF), "businesses/b1/invoices/i1"), { status: "cancelled" }));
  });
  it("only manual payments can be recorded from the app", async () => {
    const p = { id: "p1", invoiceId: "i1", amountCents: 500, method: "cash", provider: "manual", recordedBy: OWNER };
    await assertSucceeds(setDoc(doc(db(OWNER), "businesses/b1/payments/p1"), p));
    await assertFails(setDoc(doc(db(OWNER), "businesses/b1/payments/p2"), { ...p, id: "p2", method: "card", provider: "paystack" }));
    await assertFails(setDoc(doc(db(STAFF), "businesses/b1/payments/p3"), { ...p, id: "p3", recordedBy: STAFF }));
  });
  it("server-only collections are closed to clients", async () => {
    await assertFails(getDoc(doc(db(OWNER), "businesses/b1/counters/invoices")));
    await assertFails(setDoc(doc(db(OWNER), "businesses/b1/counters/invoices"), { next: 1 }));
  });
});

describe("stock movements", () => {
  it("apply quantity changes as increments together with the movement", async () => {
    await assertSucceeds(updateDoc(doc(db(OWNER), "businesses/b1"), { enabledModules: ["customers", "assistant", "stock"] }));
    const fs = db(STAFF);
    await assertSucceeds(setDoc(doc(fs, "businesses/b1/stockItems/s1"), { id: "s1", name: "Bread", priceCents: 1800, costCents: 1000, reorderLevel: 2, archived: false }));
    const batch = writeBatch(fs);
    batch.set(doc(fs, "businesses/b1/stockMovements/m1"), { id: "m1", itemId: "s1", delta: -2, reason: "sold", by: STAFF });
    batch.set(doc(fs, "businesses/b1/stockItems/s1"), { quantity: increment(-2) }, { merge: true });
    await assertSucceeds(batch.commit());
  });
});
