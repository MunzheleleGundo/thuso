import { useState } from "react";
import { isEnabled, parseRand, type Service, type StockUsage } from "@thuso/core";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useServices, useStockItems } from "../../data/hooks";
import { rand } from "../../lib/format";
import { useAction } from "../../ui/feedback";
import { Alert, Button, Card, Checkbox, Dialog, EmptyState, Field, IconButton, Input, PageHeader, PageSpinner, Pill, Select, Textarea } from "../../ui/kit";

const centsText = (c: number) => (c ? (c / 100).toFixed(2) : "");

function ServiceDialog({ existing, onClose }: { existing: Service | null; onClose: () => void }) {
  const { bizId, business: b, actor, role } = useWorkspace();
  const stockOn = isEnabled(b.enabledModules, "stock");
  const stock = useStockItems(bizId).data.filter((i) => !i.archived);
  const a = useAction();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 60);
  const [price, setPrice] = useState(centsText(existing?.priceCents ?? 0));
  const [deposit, setDeposit] = useState(centsText(existing?.depositCents ?? 0));
  const [active, setActive] = useState(existing?.active ?? true);
  const [usage, setUsage] = useState<StockUsage[]>([...(existing?.stockUsage ?? [])]);

  async function save() {
    const priceCents = parseRand(price || "0");
    const depositCents = parseRand(deposit || "0");
    if (priceCents === null) return a.setError({ code: "validation", message: "Enter a price like 350 or 350.50.", field: "priceCents" });
    if (depositCents === null) return a.setError({ code: "validation", message: "Enter a deposit like 100.", field: "depositCents" });
    const ok = await a.run(() => uc.bookings.saveService(bizId, actor, role, existing?.id ?? null, { name, description, durationMinutes: duration, priceCents, depositCents, active, stockUsage: usage }));
    if (ok) onClose();
  }

  return (
    <Dialog open onClose={onClose} title={existing ? "Edit service" : "Add a service"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={a.busy}>Save service</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="sv-name" error={a.fieldError("name")}><Input id="sv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Consultation" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Duration" htmlFor="sv-dur" error={a.fieldError("durationMinutes")}>
            <Select id="sv-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`}</option>)}
            </Select>
          </Field>
          <Field label="Price (R)" htmlFor="sv-price" error={a.fieldError("priceCents")}><Input id="sv-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></Field>
          <Field label="Deposit (R)" htmlFor="sv-dep" optional error={a.fieldError("depositCents")}><Input id="sv-dep" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" /></Field>
        </div>
        <Field label="Description" htmlFor="sv-desc" optional hint="Shown on your booking page."><Textarea id="sv-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[64px]" /></Field>
        {stockOn && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-bold">Stock used each time <span className="font-medium text-muted">(optional)</span></legend>
            {usage.map((u, i) => (
              <div key={i} className="flex gap-2">
                <Select aria-label="Stock item" value={u.itemId} onChange={(e) => setUsage(usage.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))} className="flex-1">
                  <option value="">Choose an item…</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Input aria-label="Quantity" type="number" min={0} step="any" value={u.quantity} onChange={(e) => setUsage(usage.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} className="w-24" />
                <IconButton icon="x" label="Remove" onClick={() => setUsage(usage.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button variant="ghost" size="sm" icon="plus" className="self-start" onClick={() => setUsage([...usage, { itemId: "", quantity: 1 }])} disabled={stock.length === 0}>
              {stock.length === 0 ? "Add stock items first" : "Add stock used"}
            </Button>
          </fieldset>
        )}
        <Checkbox checked={active} onChange={setActive} label="Offer this service" detail="Untick to hide it from your booking page without deleting it." />
        {a.formError(["name", "durationMinutes", "priceCents", "depositCents"]) && <Alert>{a.formError(["name", "durationMinutes", "priceCents", "depositCents"])}</Alert>}
      </div>
    </Dialog>
  );
}

export default function ServicesPage() {
  const { bizId } = useWorkspace();
  const services = useServices(bizId);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  return (
    <>
      <PageHeader back="/app/bookings" title="Services" subtitle="What customers can book, how long it takes and what it costs."
        actions={<Button icon="plus" onClick={() => setEditing("new")}>Add service</Button>} />
      {services.loading ? <PageSpinner /> : services.data.length === 0 ? (
        <Card><EmptyState icon="calendar" title="No services yet" body="Add each service you offer with its duration and price. Customers choose from these on your booking page."
          action={<Button icon="plus" onClick={() => setEditing("new")}>Add service</Button>} /></Card>
      ) : (
        <Card>
          <ul>
            {services.data.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="flex w-full items-center gap-4 border-b border-subtle px-5 py-3.5 text-left last:border-0 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{s.name}</span>
                    <span className="block text-[13px] text-muted">{s.durationMinutes} min{s.depositCents ? ` · deposit ${rand(s.depositCents)}` : ""}{s.stockUsage.length ? ` · uses ${s.stockUsage.length} stock item${s.stockUsage.length === 1 ? "" : "s"}` : ""}</span>
                  </span>
                  {!s.active && <Pill>Hidden</Pill>}
                  <span className="tabular text-[15px] font-bold">{rand(s.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing && <ServiceDialog existing={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
