import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isLow, MOVEMENT_REASONS, parseRand, stockValue, type MovementReason, type StockItem } from "@thuso/core";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useMovementsFor, useStockItems } from "../../data/hooks";
import { dateTime, rand } from "../../lib/format";
import { useAction, useFeedback } from "../../ui/feedback";
import { Icon } from "../../ui/icons";
import { Alert, Button, Card, cn, Dialog, EmptyState, Field, Input, PageHeader, PageSpinner, Pill, Select, Stat, Tabs } from "../../ui/kit";

function ItemDialog({ existing, onClose }: { existing: StockItem | null; onClose: () => void }) {
  const { bizId, actor, role } = useWorkspace();
  const { toast } = useFeedback();
  const a = useAction();
  const [f, setF] = useState({
    name: existing?.name ?? "", sku: existing?.sku ?? "", unit: existing?.unit === "each" ? "" : existing?.unit ?? "",
    price: existing ? (existing.priceCents / 100).toFixed(2) : "", cost: existing ? (existing.costCents / 100).toFixed(2) : "",
    reorder: String(existing?.reorderLevel ?? 5), opening: "0",
  });
  async function save() {
    const priceCents = parseRand(f.price || "0");
    const costCents = parseRand(f.cost || "0");
    if (priceCents === null) return a.setError({ code: "validation", message: "Enter a selling price like 25 or 25.50.", field: "priceCents" });
    if (costCents === null) return a.setError({ code: "validation", message: "Enter a cost price like 18 or 18.50.", field: "costCents" });
    const ok = await a.run(() => uc.stock.saveItem(bizId, actor, role, existing?.id ?? null,
      { name: f.name, sku: f.sku, unit: f.unit, priceCents, costCents, reorderLevel: Number(f.reorder) || 0 }, existing ? 0 : Number(f.opening) || 0));
    if (ok) onClose();
  }
  return (
    <Dialog open onClose={onClose} title={existing ? "Edit item" : "Add a stock item"}
      footer={<>
        {existing && !existing.archived && (
          <Button variant="ghost" className="mr-auto text-danger-600 hover:bg-danger-50"
            onClick={() => uc.stock.setArchived(bizId, actor, role, existing.id, true).then((r) => { toast(r.ok ? "Item archived" : r.error.message, r.ok ? "ok" : "error"); if (r.ok) onClose(); })}>Archive</Button>
        )}
        <Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={a.busy}>Save item</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="si-name" error={a.fieldError("name")}><Input id="si-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. White bread" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Selling price (R)" htmlFor="si-price" error={a.fieldError("priceCents")}><Input id="si-price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Cost price (R)" htmlFor="si-cost" optional error={a.fieldError("costCents")}><Input id="si-cost" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          <Field label="Warn me at" htmlFor="si-reorder" hint="Reorder level" error={a.fieldError("reorderLevel")}><Input id="si-reorder" inputMode="decimal" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} /></Field>
          {!existing && <Field label="How many do you have now?" htmlFor="si-open"><Input id="si-open" inputMode="decimal" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} /></Field>}
          <Field label="Unit" htmlFor="si-unit" optional hint="e.g. loaf, kg, bottle"><Input id="si-unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
          <Field label="SKU or code" htmlFor="si-sku" optional><Input id="si-sku" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
        </div>
        {a.formError(["name", "priceCents", "costCents", "reorderLevel"]) && <Alert>{a.formError(["name", "priceCents", "costCents", "reorderLevel"])}</Alert>}
      </div>
    </Dialog>
  );
}

function AdjustDialog({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { bizId, actor, role, business } = useWorkspace();
  const { confirm } = useFeedback();
  const moves = useMovementsFor(bizId, item.id);
  const [reason, setReason] = useState<MovementReason>("received");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isCount = reason === "adjusted";

  async function next() {
    const n = Number(qty.replace(",", "."));
    if (!qty || !Number.isFinite(n)) return setError(isCount ? "Enter the number you counted." : "Enter how many.");
    setError(null);
    const r = await confirm({
      title: "Update stock", confirmLabel: "Update stock", done: "Stock updated",
      preview: () => uc.stock.previewAdjust(bizId, actor, role, item.id, reason, n, note),
      execute: () => uc.stock.adjust(bizId, actor, role, item.id, reason, n, note),
    });
    if (r) onClose();
  }

  return (
    <Dialog open onClose={onClose} title={item.name}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={next}>Review</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="text-[14px] text-muted">In stock now: <strong className="text-ink">{item.quantity} {item.unit === "each" ? "" : item.unit}</strong></div>
        <Field label="What happened?" htmlFor="adj-reason">
          <Select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value as MovementReason)}>
            {MOVEMENT_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label={isCount ? "How many did you count?" : "How many?"} htmlFor="adj-qty"><Input id="adj-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note" htmlFor="adj-note" optional><Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <div>
          <h3 className="mb-2 text-[13px] font-bold">Recent changes</h3>
          {moves.data.length === 0 ? <p className="text-[13px] text-muted">No changes yet.</p> : (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {[...moves.data].sort((a, b) => b.at - a.at).slice(0, 8).map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span className="text-muted">{MOVEMENT_REASONS.find((r) => r.id === m.reason)?.label ?? (m.reason === "opening" ? "Opening count" : m.reason)} · {dateTime(m.at, business.utcOffsetMinutes)}</span>
                  <span className={cn("tabular font-bold", m.delta < 0 ? "text-danger-600" : "text-brand-700")}>{m.delta > 0 ? "+" : ""}{m.delta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default function StockPage() {
  const { bizId, actor, role } = useWorkspace();
  const { toast } = useFeedback();
  const items = useStockItems(bizId);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"all" | "low" | "archived">("all");
  const [editing, setEditing] = useState<StockItem | "new" | null>(null);
  const adjusting = items.data.find((i) => i.id === params.get("item")) ?? null;
  const active = items.data.filter((i) => !i.archived);
  const low = active.filter(isLow);
  const list = view === "low" ? low : view === "archived" ? items.data.filter((i) => i.archived) : active;

  return (
    <>
      <PageHeader title="Stock" subtitle="Works offline: changes sync when you reconnect." actions={<Button icon="plus" onClick={() => setEditing("new")}>Add item</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Items" value={active.length} />
        <Stat label="Running low" value={low.length} />
        <Stat label="Stock value at cost" value={rand(active.reduce((s, i) => s + stockValue(i), 0))} />
      </div>
      <Tabs value={view} onChange={setView} items={[{ id: "all", label: "All items" }, { id: "low", label: `Running low${low.length ? ` (${low.length})` : ""}` }, { id: "archived", label: "Archived" }]} />
      {items.loading ? <PageSpinner /> : list.length === 0 ? (
        <Card><EmptyState icon="box" title={view === "all" ? "No stock items yet" : "Nothing here"} body={view === "all" ? "Add what you sell or use, how many you have and when THUSO should warn you." : view === "low" ? "Nothing is running low." : "No archived items."}
          action={view === "all" ? <Button icon="plus" onClick={() => setEditing("new")}>Add item</Button> : undefined} /></Card>
      ) : (
        <Card>
          <ul>
            {list.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-0 sm:px-5">
                <button type="button" onClick={() => setParams({ item: i.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{i.name}</span>
                    <span className="block text-[13px] text-muted">{rand(i.priceCents)}{i.sku ? ` · ${i.sku}` : ""} · warn at {i.reorderLevel}</span>
                  </span>
                  {isLow(i) && <Pill tone={i.quantity <= 0 ? "red" : "amber"}>{i.quantity <= 0 ? "Out" : "Low"}</Pill>}
                  <span className="tabular w-[80px] text-right text-[16px] font-extrabold">{i.quantity}<span className="ml-1 text-[12px] font-semibold text-muted">{i.unit === "each" ? "" : i.unit}</span></span>
                </button>
                <button type="button" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)} className="grid h-11 w-11 place-items-center rounded-[10px] text-ink-soft hover:bg-subtle"><Icon name="settings" size={18} /></button>
                {view === "archived" && <Button size="sm" variant="secondary" onClick={() => uc.stock.setArchived(bizId, actor, role, i.id, false).then((r) => toast(r.ok ? "Item restored" : r.error.message, r.ok ? "ok" : "error"))}>Restore</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing && <ItemDialog existing={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {adjusting && <AdjustDialog item={adjusting} onClose={() => setParams({}, { replace: true })} />}
    </>
  );
}
