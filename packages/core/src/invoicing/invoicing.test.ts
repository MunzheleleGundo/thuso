import { describe, expect, it } from "vitest";
import { unwrap } from "../shared/result";
import { DAY } from "../shared/time";
import { OWNER, setup } from "../testing/fixtures";
import {
  buildInvoice, displayStatus, formatInvoiceNumber, parsePaymentReference, planProviderPayment, requestPaymentLink, type PaymentLinkGateway,
} from "./index";

const customer = { id: "c1", name: "Sipho", email: "", phone: "+27821234567" };
const line = (cents: number, qty = 1) => ({ description: "Work", quantity: qty, unitPriceCents: cents, stockItemId: null });

describe("invoice rules", () => {
  it("totals lines, VAT and due date", () => {
    const i = unwrap(buildInvoice("i1", { customer, lines: [line(10000, 2), line(333)], vatRegistered: true, paymentTermsDays: 7 }, 0));
    expect(i).toMatchObject({ subtotalCents: 20333, vatCents: 3050, totalCents: 23383, dueDate: 7 * DAY, status: "draft" });
  });
  it("shows overdue only for sent invoices past their due date", () => {
    const i = unwrap(buildInvoice("i1", { customer, lines: [line(10000)], vatRegistered: false, paymentTermsDays: 7 }, 0));
    expect(displayStatus(i, 8 * DAY)).toBe("Draft");
    expect(displayStatus({ ...i, status: "sent" }, 8 * DAY)).toBe("Overdue");
    expect(displayStatus({ ...i, status: "sent" }, 6 * DAY)).toBe("Sent");
  });
  it("numbers invoices", () => expect(formatInvoiceNumber(7)).toBe("INV-0007"));
  it("round-trips payment references", () => expect(parsePaymentReference("biz1.inv9.abc")).toEqual({ bizId: "biz1", invoiceId: "inv9" }));
});

async function withInvoice() {
  const s = setup(["invoicing"]);
  const cus = unwrap(await s.customers.add(s.biz.id, OWNER, { name: "Sipho M", phone: "0821234567" }));
  const inv = unwrap(await s.workflows.createInvoice({ bizId: s.biz.id, actor: OWNER, role: "owner", customerId: cus.id, lines: [line(100000)] }));
  return { ...s, inv };
}

describe("payments", () => {
  it("records manual payments and updates the status", async () => {
    const s = await withInvoice();
    const p = unwrap(await s.invoices.previewManualPayment(s.biz.id, s.inv.id, 40000, "cash"));
    expect(p.effects[1]!.detail).toBe("R 600.00");
    let i = unwrap(await s.invoices.recordManualPayment(s.biz.id, OWNER, "owner", s.inv.id, 40000, "cash"));
    expect(i.status).toBe("partially_paid");
    i = unwrap(await s.invoices.recordManualPayment(s.biz.id, OWNER, "owner", s.inv.id, 60000, "eft"));
    expect(i.status).toBe("paid");
    expect(s.store.data(s.biz.id).payments.size).toBe(2);
  });

  it("only lets owners and admins record payments", async () => {
    const s = await withInvoice();
    expect(await s.invoices.recordManualPayment(s.biz.id, OWNER, "staff", s.inv.id, 100, "cash")).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("records a provider payment once, however often the webhook repeats", async () => {
    const s = await withInvoice();
    const first = unwrap(planProviderPayment({ invoice: s.inv, alreadyRecorded: false, reference: "biz1.x.1", amountCents: 100000, now: 5 }));
    expect(first.invoice.status).toBe("paid");
    expect(first.ops.map((o) => o.kind)).toEqual(["payment.save", "invoice.save", "audit.append"]);
    const again = unwrap(planProviderPayment({ invoice: first.invoice, alreadyRecorded: true, reference: "biz1.x.1", amountCents: 100000, now: 6 }));
    expect(again.ops).toHaveLength(0);
  });

  it("cannot cancel an invoice that has payments", async () => {
    const s = await withInvoice();
    unwrap(await s.invoices.recordManualPayment(s.biz.id, OWNER, "owner", s.inv.id, 100, "cash"));
    expect(await s.invoices.cancel(s.biz.id, OWNER, "owner", s.inv.id)).toMatchObject({ ok: false, error: { code: "invalid_state" } });
  });

  it("asks the gateway for a link for the outstanding balance and marks the invoice sent", async () => {
    const s = await withInvoice();
    const calls: unknown[] = [];
    const gateway: PaymentLinkGateway = { createLink: async (req) => { calls.push(req); return { url: "https://pay.example/abc" }; } };
    const r = unwrap(await requestPaymentLink({
      bizId: s.biz.id, invoice: { ...s.inv, number: "INV-0001", paidCents: 25000, status: "partially_paid" }, businessName: "Ndou Studio",
      fallbackEmail: "pay@thuso.app", gateway, callbackUrl: "https://app/pay", nonce: "n1", now: 9, actor: OWNER, auditId: "a1",
    }));
    expect(calls[0]).toMatchObject({ amountCents: 75000, email: "pay@thuso.app", reference: "biz1.id5.n1".replace("id5", s.inv.id) });
    expect(r.invoice.paymentLink?.url).toBe("https://pay.example/abc");
    expect(r.invoice.status).toBe("partially_paid");
  });
});
