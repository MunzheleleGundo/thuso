import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isEnabled, lineTotal, parseRand, totals, VAT_RATE_BPS, type InvoiceLine } from "@thuso/core";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useCustomers, useStockItems } from "../../data/hooks";
import { rand } from "../../lib/format";
import { useFeedback } from "../../ui/feedback";
import { Alert, Button, Card, Field, IconButton, Input, PageHeader, Select, Textarea } from "../../ui/kit";
import { CustomerPicker } from "../customers/CustomerForm";

interface DraftLine { description: string; quantity: string; price: string; stockItemId: string }
const blank = (): DraftLine => ({ description: "", quantity: "1", price: "", stockItemId: "" });

export default function NewInvoicePage() {
  const { bizId, business: b, actor, role } = useWorkspace();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { confirm } = useFeedback();
  const customers = useCustomers(bizId);
  const stockOn = isEnabled(b.enabledModules, "stock");
  const stock = useStockItems(bizId).data.filter((i) => !i.archived);
  const [customerId, setCustomerId] = useState(params.get("customer") ?? "");
  const [lines, setLines] = useState<DraftLine[]>([blank()]);
  const [notes, setNotes] = useState(b.invoiceTerms);
  const [problem, setProblem] = useState<string | null>(null);

  const parsed: InvoiceLine[] = lines.map((l) => ({
    description: l.description, quantity: Number(l.quantity.replace(",", ".")) || 0,
    unitPriceCents: parseRand(l.price || "0") ?? -1, stockItemId: l.stockItemId || null,
  }));
  const t = totals(parsed.filter((l) => l.unitPriceCents >= 0), b.vatRegistered ? VAT_RATE_BPS : 0);
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function pickStock(i: number, itemId: string) {
    const item = stock.find((s) => s.id === itemId);
    setLine(i, item ? { stockItemId: itemId, description: lines[i].description || item.name, price: lines[i].price || (item.priceCents / 100).toFixed(2) } : { stockItemId: "" });
  }

  async function review() {
    if (parsed.some((l) => l.unitPriceCents < 0)) return setProblem("Check the prices: use numbers like 350 or 350.50.");
    setProblem(null);
    const cmd = { bizId, actor, role, customerId, lines: parsed, notes };
    const inv = await confirm({
      title: "Create invoice", confirmLabel: "Create invoice", done: "Invoice created",
      preview: () => uc.workflows.previewCreateInvoice(cmd), execute: () => uc.workflows.createInvoice(cmd),
    });
    if (inv) nav(`/app/invoices/${inv.id}`, { replace: true });
  }

  return (
    <>
      <PageHeader back="/app/invoices" title="New invoice" subtitle={b.vatRegistered ? "VAT of 15% is added to the lines." : "Your business is not VAT registered, so no VAT is added."} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="flex flex-col gap-5 p-5">
          <CustomerPicker customers={customers.data} value={customerId} onChange={setCustomerId} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-bold">Lines</legend>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_80px_120px_auto] sm:border-0 sm:p-0">
                <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
                  <Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="What was it for?" />
                  {stockOn && stock.length > 0 && (
                    <Select aria-label={`Line ${i + 1} stock item`} value={l.stockItemId} onChange={(e) => pickStock(i, e.target.value)} className="h-10 text-[13px]">
                      <option value="">Not from stock</option>
                      {stock.map((s) => <option key={s.id} value={s.id}>From stock: {s.name} ({s.quantity} left)</option>)}
                    </Select>
                  )}
                </div>
                <Input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Input aria-label={`Line ${i + 1} price in rand`} inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} placeholder="Price" />
                <IconButton icon="x" label={`Remove line ${i + 1}`} onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [blank()])} />
              </div>
            ))}
            <Button variant="ghost" size="sm" icon="plus" className="self-start" onClick={() => setLines([...lines, blank()])}>Add line</Button>
          </fieldset>
          <Field label="Notes on the invoice" htmlFor="ni-notes" optional hint="Payment terms, thank-you note or reference.">
            <Textarea id="ni-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[72px]" />
          </Field>
          {problem && <Alert>{problem}</Alert>}
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2.5 p-5 text-[14px]">
            {parsed.filter((l) => l.description && l.unitPriceCents >= 0).map((l, i) => (
              <div key={i} className="flex justify-between gap-3"><span className="truncate text-muted">{l.quantity} × {l.description}</span><span className="tabular font-semibold">{rand(lineTotal(l))}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t border-line pt-2.5"><span>Subtotal</span><span className="tabular font-bold">{rand(t.subtotalCents)}</span></div>
            {b.vatRegistered && <div className="flex justify-between"><span>VAT 15%</span><span className="tabular font-bold">{rand(t.vatCents)}</span></div>}
            <div className="flex justify-between text-[17px]"><span className="font-extrabold">Total</span><span className="tabular font-extrabold">{rand(t.totalCents)}</span></div>
            <div className="text-[12px] text-muted">Due in {b.paymentTermsDays} day{b.paymentTermsDays === 1 ? "" : "s"}. Change this in Settings.</div>
          </Card>
          <Button full onClick={review}>Review invoice</Button>
        </div>
      </div>
    </>
  );
}
