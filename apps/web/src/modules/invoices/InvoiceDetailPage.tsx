import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  balanceDue, displayStatus, effect, lineTotal, ok, parseRand, type Invoice, type Preview,
} from "@thuso/core";
import { api, callableMessage } from "../../adapters/functions";
import { useOnline } from "../../adapters/live";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useInvoice, usePaymentsFor } from "../../data/hooks";
import { dateTime, rand, shortDate, whatsappLink } from "../../lib/format";
import { useFeedback } from "../../ui/feedback";
import { Icon } from "../../ui/icons";
import { Alert, Button, ButtonLink, Card, Dialog, EmptyState, Field, Input, PageHeader, PageSpinner, Pill, Select } from "../../ui/kit";
import { invoiceTone } from "./InvoicesPage";

function messageFor(inv: Invoice, businessName: string, link: string | null): string {
  const first = inv.customerName.split(" ")[0];
  const owed = rand(balanceDue(inv));
  return `Hi ${first}, here is ${inv.number ?? "your invoice"} from ${businessName} for ${owed}.` +
    (link ? ` You can pay securely here: ${link}` : "") + " Thank you!";
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const { bizId, business: b, actor, role } = useWorkspace();
  const { confirm, toast } = useFeedback();
  const online = useOnline();
  const inv = useInvoice(bizId, id);
  const payments = usePaymentsFor(bizId, id ?? "");
  const [linkBusy, setLinkBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const canManage = role === "owner" || role === "admin";
  const now = Date.now();
  const off = b.utcOffsetMinutes;

  if (inv.loading) return <PageSpinner />;
  const i = inv.data;
  if (!i) return <EmptyState icon="invoice" title="Invoice not found" body="It may still be syncing, or it was never created." action={<ButtonLink to="/app/invoices">All invoices</ButtonLink>} />;

  const due = balanceDue(i);
  const closed = i.status === "cancelled" || i.status === "paid";
  const link = i.paymentLink?.url ?? null;

  async function getLink(): Promise<string | null> {
    if (link) return link;
    setLinkBusy(true);
    try {
      const r = await api.createPaymentLink({ bizId, invoiceId: i!.id });
      toast("Payment link ready");
      return r.url;
    } catch (e) {
      toast(callableMessage(e, "Could not create a payment link."), "error");
      return null;
    } finally { setLinkBusy(false); }
  }

  /** Sending happens in WhatsApp or the mail app; THUSO previews it, opens it and records the invoice as sent. */
  async function send(channel: "whatsapp" | "email") {
    const contact = channel === "whatsapp" ? i!.customerPhone : i!.customerEmail;
    if (!contact) { toast(channel === "whatsapp" ? "Add a phone number to this customer first." : "Add an email address to this customer first.", "error"); return; }
    const payLink = online && due > 0 ? await getLink() : link;
    const text = messageFor(i!, b.name, payLink);
    const preview = async () => ok<Preview<null>>({
      effects: [
        effect("send", channel === "whatsapp" ? "Open WhatsApp with this message" : "Open your email app with this message", `To ${i!.customerName}: “${text}”`),
        ...(i!.status === "draft" ? [effect("money", "Mark invoice as sent", "It moves from Draft to Sent, so overdue tracking starts.")] : []),
        ...(!payLink && due > 0 ? [effect("warning", "No payment link", online ? "Online payments are not set up, so the message has no link." : "You are offline, so the message has no payment link.")] : []),
      ],
      draft: null,
    });
    const url = channel === "whatsapp" ? whatsappLink(contact, text) : `mailto:${contact}?subject=${encodeURIComponent(`${i!.number ?? "Invoice"} from ${b.name}`)}&body=${encodeURIComponent(text)}`;
    await confirm({
      title: channel === "whatsapp" ? "Send on WhatsApp" : "Send by email", confirmLabel: "Open and send",
      preview, execute: async () => {
        window.open(url, "_blank", "noopener");
        return i!.status === "draft" ? uc.invoices.markSent(bizId, actor, role, i!.id, channel) : ok(i!);
      },
    });
  }

  const cancel = () => confirm({
    title: "Cancel invoice", confirmLabel: "Cancel invoice", danger: true, done: "Invoice cancelled",
    preview: () => uc.invoices.previewCancel(bizId, i.id), execute: () => uc.invoices.cancel(bizId, actor, role, i.id),
  });

  return (
    <>
      <PageHeader back="/app/invoices" title={i.number ?? "New invoice"}
        subtitle={<span className="inline-flex items-center gap-2"><Pill tone={invoiceTone(i, now)}>{displayStatus(i, now)}</Pill>{!i.number && <span>{online ? "Number is being assigned…" : "Number is assigned when you are back online."}</span>}</span>}
        actions={<Button variant="secondary" icon="print" onClick={() => window.print()}>Print or PDF</Button>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="print-sheet p-6 sm:p-8">
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <div className="text-[20px] font-extrabold">{b.name}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-muted">
                {b.town}, {b.province}<br />{[b.contactPhone, b.contactEmail].filter(Boolean).join(" · ")}
                {b.vatRegistered && <><br />VAT no. {b.vatNumber}</>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-extrabold tracking-wide text-brand-600">{b.vatRegistered ? "TAX INVOICE" : "INVOICE"}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-muted">{i.number ?? "Pending number"}<br />Issued {shortDate(i.issueDate, off)}<br />Due {shortDate(i.dueDate, off)}</div>
            </div>
          </div>
          <div className="mt-6 text-[13px]"><div className="font-bold text-muted">Bill to</div><div className="text-[15px] font-bold">{i.customerName}</div><div className="text-muted">{[i.customerPhone.replace(/^\+27/, "0"), i.customerEmail].filter(Boolean).join(" · ")}</div></div>
          <table className="mt-6 w-full text-[14px]">
            <thead><tr className="border-b border-line text-left text-[12px] text-muted"><th className="py-2 font-bold">Description</th><th className="py-2 text-right font-bold">Qty</th><th className="py-2 text-right font-bold">Price</th><th className="py-2 text-right font-bold">Amount</th></tr></thead>
            <tbody>
              {i.lines.map((l, k) => (
                <tr key={k} className="border-b border-subtle"><td className="py-2.5 pr-3">{l.description}</td><td className="tabular py-2.5 text-right">{l.quantity}</td><td className="tabular py-2.5 text-right">{rand(l.unitPriceCents)}</td><td className="tabular py-2.5 text-right font-semibold">{rand(lineTotal(l))}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto mt-4 flex max-w-[280px] flex-col gap-1.5 text-[14px]">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{rand(i.subtotalCents)}</span></div>
            {i.vatRateBps > 0 && <div className="flex justify-between"><span>VAT 15%</span><span className="tabular">{rand(i.vatCents)}</span></div>}
            <div className="flex justify-between border-t border-line pt-1.5 text-[16px] font-extrabold"><span>Total</span><span className="tabular">{rand(i.totalCents)}</span></div>
            {i.paidCents > 0 && <div className="flex justify-between text-muted"><span>Paid</span><span className="tabular">-{rand(i.paidCents)}</span></div>}
            {i.status !== "cancelled" && <div className="flex justify-between font-extrabold"><span>Balance due</span><span className="tabular">{rand(due)}</span></div>}
          </div>
          {(i.notes || b.bankDetails) && (
            <div className="mt-6 grid gap-4 border-t border-line pt-4 text-[13px] sm:grid-cols-2">
              {i.notes && <div><div className="font-bold text-muted">Notes</div><p className="whitespace-pre-wrap">{i.notes}</p></div>}
              {b.bankDetails && <div><div className="font-bold text-muted">Pay by EFT</div><p className="whitespace-pre-wrap">{b.bankDetails}</p><p className="mt-1 text-muted">Reference: {i.number ?? i.customerName}</p></div>}
            </div>
          )}
        </Card>
        <div className="no-print flex flex-col gap-3">
          {!closed && (
            <Card className="flex flex-col gap-2.5 p-4">
              <Button icon="whatsapp" loading={linkBusy} onClick={() => send("whatsapp")}>Send on WhatsApp</Button>
              <Button variant="secondary" icon="mail" onClick={() => send("email")}>Send by email</Button>
              {due > 0 && (link ? (
                <Button variant="secondary" icon="copy" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Payment link copied"))}>Copy payment link</Button>
              ) : (
                <Button variant="secondary" icon="link" loading={linkBusy} disabled={!online} onClick={() => void getLink()}>{online ? "Create payment link" : "Payment link needs a connection"}</Button>
              ))}
              {canManage && due > 0 && <Button variant="secondary" icon="cash" onClick={() => setPaying(true)}>Record a payment</Button>}
            </Card>
          )}
          <Card className="p-4">
            <h2 className="mb-2 text-[14px] font-extrabold">Payments</h2>
            {payments.data.length === 0 ? <p className="text-[13px] text-muted">No payments yet.</p> : (
              <ul className="flex flex-col gap-2 text-[13px]">
                {[...payments.data].sort((a, c) => c.receivedAt - a.receivedAt).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2"><span>{p.method === "card" ? "Card (online)" : p.method === "eft" ? "EFT" : "Cash"} · {dateTime(p.receivedAt, off)}</span><span className="tabular font-bold">{rand(p.amountCents)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          {i.bookingId && <Link to={`/app/bookings?booking=${i.bookingId}`} className="text-[13px] font-bold text-brand-600"><Icon name="calendar" size={14} className="mr-1 inline" />From a booking</Link>}
          {canManage && i.status !== "cancelled" && i.paidCents === 0 && <Button variant="ghost" className="text-danger-600 hover:bg-danger-50" onClick={cancel}>Cancel invoice</Button>}
        </div>
      </div>
      {paying && <PaymentDialog invoice={i} onClose={() => setPaying(false)} />}
    </>
  );
}

function PaymentDialog({ invoice: i, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { bizId, actor, role } = useWorkspace();
  const { confirm } = useFeedback();
  const [amount, setAmount] = useState((balanceDue(i) / 100).toFixed(2));
  const [method, setMethod] = useState<"cash" | "eft">("eft");
  const [error, setError] = useState<string | null>(null);

  async function next() {
    const cents = parseRand(amount);
    if (!cents) return setError("Enter the amount received, like 350 or 350.50.");
    setError(null);
    const r = await confirm({
      title: "Record payment", confirmLabel: "Record payment", done: "Payment recorded",
      preview: () => uc.invoices.previewManualPayment(bizId, i.id, cents, method),
      execute: () => uc.invoices.recordManualPayment(bizId, actor, role, i.id, cents, method),
    });
    if (r) onClose();
  }

  return (
    <Dialog open onClose={onClose} title="Record a payment"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={next}>Review</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted">For money you received yourself. Online card payments are recorded automatically.</p>
        <Field label="Amount received (R)" htmlFor="pay-amt"><Input id="pay-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="How was it paid?" htmlFor="pay-method">
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as "cash" | "eft")}><option value="eft">EFT or bank transfer</option><option value="cash">Cash</option></Select>
        </Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Dialog>
  );
}
