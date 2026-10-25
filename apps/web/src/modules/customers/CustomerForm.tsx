import { useState } from "react";
import type { Channel, Customer, CustomerInput } from "@thuso/core";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useAction } from "../../ui/feedback";
import { Alert, Button, Checkbox, Dialog, Field, Input, Select, Textarea } from "../../ui/kit";

/** Add or edit a customer. On a duplicate it offers to use the existing customer instead. */
export function CustomerDialog({ open, onClose, existing, onSaved }: {
  open: boolean; onClose: () => void; existing?: Customer | null; onSaved?: (id: string) => void;
}) {
  const { bizId, actor } = useWorkspace();
  const a = useAction();
  const [f, setF] = useState<Required<Omit<CustomerInput, "consent">> & { consent: boolean }>(() => ({
    name: existing?.name ?? "", phone: existing?.phone ? existing.phone.replace(/^\+27/, "0") : "", email: existing?.email ?? "",
    preferredChannel: existing?.preferredChannel ?? "whatsapp", notes: existing?.notes ?? "",
    consent: existing ? existing.consent.whatsapp || existing.consent.sms || existing.consent.email : false,
  }));

  async function save() {
    const input: CustomerInput = {
      name: f.name, phone: f.phone, email: f.email, preferredChannel: f.preferredChannel, notes: f.notes,
      consent: { whatsapp: f.consent, sms: f.consent, email: f.consent },
    };
    const saved = await a.run(() => (existing ? uc.customers.update(bizId, actor, existing.id, input) : uc.customers.add(bizId, actor, input)));
    if (saved) { onSaved?.(saved.id); onClose(); }
  }

  const dupId = a.error?.code === "duplicate" ? (a.error.details?.customerId as string | undefined) : undefined;

  return (
    <Dialog open={open} onClose={onClose} title={existing ? "Edit customer" : "Add a customer"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={a.busy}>{existing ? "Save changes" : "Add customer"}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="cu-name" error={a.fieldError("name")}>
          <Input id="cu-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="cu-phone" error={a.fieldError("phone")}>
            <Input id="cu-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="082 123 4567" />
          </Field>
          <Field label="Email" htmlFor="cu-email" optional error={a.fieldError("email")}>
            <Input id="cu-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" />
          </Field>
        </div>
        <Field label="Prefers messages on" htmlFor="cu-chan" error={a.fieldError("preferredChannel")}>
          <Select id="cu-chan" value={f.preferredChannel} onChange={(e) => setF({ ...f, preferredChannel: e.target.value as Channel })}>
            <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option>
          </Select>
        </Field>
        <Checkbox checked={f.consent} onChange={(v) => setF({ ...f, consent: v })} label="The customer agreed to receive reminders and invoices from us"
          detail="Required by POPIA before sending reminders." />
        <Field label="Notes" htmlFor="cu-notes" optional>
          <Textarea id="cu-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Anything worth remembering" className="min-h-[72px]" />
        </Field>
        {dupId ? (
          <Alert tone="amber">
            {a.error!.message}{" "}
            {onSaved && <button type="button" className="font-extrabold underline" onClick={() => { onSaved(dupId); onClose(); }}>Use that customer</button>}
          </Alert>
        ) : a.formError(["name", "phone", "email", "preferredChannel"]) && <Alert>{a.formError(["name", "phone", "email", "preferredChannel"])}</Alert>}
      </div>
    </Dialog>
  );
}

/** Customer picker with an inline "add new" for forms (bookings, invoices). */
export function CustomerPicker({ customers, value, onChange, error }: {
  customers: readonly Customer[]; value: string; onChange: (id: string) => void; error?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const active = customers.filter((c) => !c.archived);
  return (
    <>
      <Field label="Customer" htmlFor="pick-customer" error={error}>
        <div className="flex gap-2">
          <Select id="pick-customer" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1">
            <option value="">Choose a customer…</option>
            {[...active].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone.replace(/^\+27/, "0")}` : ""}</option>)}
          </Select>
          <Button variant="secondary" icon="plus" onClick={() => setAdding(true)}>New</Button>
        </div>
      </Field>
      {adding && <CustomerDialog open onClose={() => setAdding(false)} onSaved={onChange} />}
    </>
  );
}
