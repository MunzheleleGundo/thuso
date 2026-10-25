import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DAY, instantToLocalDate, isEnabled, label as bookingLabel, localToInstant, minutesOfDay, type Booking,
} from "@thuso/core";
import { readers, uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useCustomers, useServices } from "../../data/hooks";
import { dateTime, rand, time, whatsappLink } from "../../lib/format";
import { useFeedback } from "../../ui/feedback";
import { Alert, Button, ButtonLink, Checkbox, Dialog, Field, Input, Pill, Select, Textarea } from "../../ui/kit";
import { CustomerPicker } from "../customers/CustomerForm";

export function statusTone(b: Booking): "green" | "amber" | "grey" | "red" | "blue" {
  if (b.status === "requested") return "amber";
  if (b.status === "confirmed") return "green";
  if (b.status === "completed") return "blue";
  return "grey";
}
export const statusText = (b: Booking) => (b.status === "requested" && b.depositCents > 0 && !b.depositPaid ? "Deposit due" : bookingLabel(b.status));

export function NewBookingDialog({ open, onClose, initialDate }: { open: boolean; onClose: () => void; initialDate: string }) {
  const { bizId, business: b, actor, role } = useWorkspace();
  const { confirm } = useFeedback();
  const customers = useCustomers(bizId);
  const services = useServices(bizId).data.filter((s) => s.active);
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [outside, setOutside] = useState(false);
  const [freeTime, setFreeTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [times, setTimes] = useState<number[] | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const off = b.utcOffsetMinutes;

  useEffect(() => { if (!serviceId && services[0]) setServiceId(services[0].id); }, [services, serviceId]);
  useEffect(() => {
    setStartAt(null); setTimes(null);
    if (!serviceId || !date || outside) return;
    let live = true;
    uc.bookings.availability(bizId, serviceId, date, true).then((r) => live && setTimes(r.ok ? r.value : []));
    return () => { live = false; };
  }, [bizId, serviceId, date, outside]);

  async function submit() {
    const at = outside ? localToInstant(date, minutesOfDay(freeTime), off) : startAt;
    if (!customerId) return setMissing("Choose a customer.");
    if (!serviceId) return setMissing("Choose a service.");
    if (at === null) return setMissing("Choose a time.");
    setMissing(null);
    const cmd = { bizId, actor, role, customerId, serviceId, startAt: at, notes, outsideHours: outside };
    const done = await confirm({
      title: "Confirm booking", confirmLabel: "Book it", done: "Booking saved",
      preview: () => uc.bookings.previewCreate(cmd), execute: () => uc.bookings.create(cmd),
    });
    if (done) onClose();
  }

  if (services.length === 0) {
    return (
      <Dialog open={open} onClose={onClose} title="New booking">
        <div className="flex flex-col items-start gap-4">
          <p className="text-[15px] text-muted">Add the services you offer first, with their duration and price.</p>
          <ButtonLink to="/app/bookings/services">Add services</ButtonLink>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="New booking"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Review booking</Button></>}>
      <div className="flex flex-col gap-4">
        <CustomerPicker customers={customers.data} value={customerId} onChange={setCustomerId} />
        <Field label="Service" htmlFor="nb-svc">
          <Select id="nb-svc" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} min · {rand(s.priceCents)}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="nb-date">
          <Input id="nb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {!outside && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">Time</legend>
            {!b.schedule ? <Alert tone="amber">Add your working hours in Settings to see free times, or tick "Book outside working hours".</Alert>
              : times === null ? <p className="text-[14px] text-muted">Finding free times…</p>
                : times.length === 0 ? <p className="text-[14px] text-muted">No free times on this day.</p> : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {times.map((t) => (
                      <button key={t} type="button" aria-pressed={startAt === t} onClick={() => setStartAt(t)}
                        className={`min-h-11 rounded-[10px] border-[1.5px] text-[14px] font-bold ${startAt === t ? "border-brand-600 bg-brand-600 text-white" : "border-line hover:border-brand-600"}`}>
                        {time(t, off)}
                      </button>
                    ))}
                  </div>
                )}
          </fieldset>
        )}
        <Checkbox checked={outside} onChange={setOutside} label="Book outside working hours" detail="Choose any time, for example to squeeze someone in." />
        {outside && (
          <Field label="Start time" htmlFor="nb-free"><Input id="nb-free" type="time" value={freeTime} onChange={(e) => setFreeTime(e.target.value)} /></Field>
        )}
        <Field label="Notes" htmlFor="nb-notes" optional><Textarea id="nb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[64px]" /></Field>
        {missing && <Alert>{missing}</Alert>}
      </div>
    </Dialog>
  );
}

export function BookingDetailDialog({ booking: x, onClose }: { booking: Booking; onClose: () => void }) {
  const { bizId, business: b, actor, role } = useWorkspace();
  const { confirm } = useFeedback();
  const nav = useNavigate();
  const off = b.utcOffsetMinutes;
  const now = Date.now();
  const canManage = role === "owner" || role === "admin";
  const active = x.status === "requested" || x.status === "confirmed";

  const status = (to: "confirmed" | "cancelled" | "no_show", title: string, label: string, danger = false) => () => confirm({
    title, confirmLabel: label, danger, done: "Booking updated",
    preview: () => uc.bookings.previewStatus(bizId, actor, role, x.id, to), execute: () => uc.bookings.setStatus(bizId, actor, role, x.id, to),
  }).then((r) => r && onClose());

  const complete = async () => {
    const cmd = { bizId, actor, role, bookingId: x.id };
    const r = await confirm({
      title: "Complete booking", confirmLabel: "Complete", done: "Booking completed",
      preview: () => uc.workflows.previewCompleteBooking(cmd), execute: () => uc.workflows.completeBooking(cmd),
    });
    if (r) { onClose(); if (r.invoice) nav(`/app/invoices/${r.invoice.id}`); }
  };

  const deposit = () => confirm({
    title: "Deposit received", confirmLabel: "Record deposit", done: "Deposit recorded",
    preview: () => uc.bookings.previewDepositPaid(bizId, role, x.id), execute: () => uc.bookings.setDepositPaid(bizId, actor, role, x.id),
  }).then((r) => r && onClose());

  const reminder = `Hi ${x.customerName.split(" ")[0]}, this is a reminder of your ${x.serviceName} with ${b.name} on ${dateTime(x.startAt, off)}.` +
    (x.depositCents > 0 && !x.depositPaid ? ` A deposit of ${rand(x.depositCents)} secures your booking.` : "") + " See you then!";
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    readers.customers.get(bizId, x.customerId).then((c) => live && setPhone(c?.phone || null)).catch(() => undefined);
    return () => { live = false; };
  }, [bizId, x.customerId]);

  return (
    <Dialog open onClose={onClose} title={x.serviceName}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone={statusTone(x)}>{statusText(x)}</Pill>{x.source === "public" && <Pill tone="blue">Booked online</Pill>}</div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 text-[14px]">
          <dt className="text-muted">Customer</dt><dd className="font-bold"><Link to={`/app/customers/${x.customerId}`} className="text-brand-600">{x.customerName}</Link></dd>
          <dt className="text-muted">When</dt><dd className="font-bold">{dateTime(x.startAt, off)} to {time(x.endAt, off)}</dd>
          <dt className="text-muted">Price</dt><dd className="font-bold">{rand(x.priceCents)}</dd>
          {x.depositCents > 0 && <><dt className="text-muted">Deposit</dt><dd className="font-bold">{rand(x.depositCents)} {x.depositPaid ? "· received" : "· not received yet"}</dd></>}
          {x.notes && <><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{x.notes}</dd></>}
          {x.invoiceId && <><dt className="text-muted">Invoice</dt><dd><Link to={`/app/invoices/${x.invoiceId}`} className="font-bold text-brand-600">Open invoice</Link></dd></>}
        </dl>
        {active && (
          <div className="flex flex-col gap-2.5 border-t border-line pt-4">
            {x.status === "confirmed" && x.startAt <= now && <Button icon="check" onClick={complete}>Complete{isEnabled(b.enabledModules, "invoicing") && !x.invoiceId ? " and invoice" : ""}</Button>}
            {x.status === "requested" && <Button icon="check" onClick={status("confirmed", "Confirm booking", "Confirm")}>Confirm booking</Button>}
            {canManage && x.depositCents > 0 && !x.depositPaid && <Button variant="secondary" icon="cash" onClick={deposit}>Deposit received</Button>}
            {phone && <a href={whatsappLink(phone, reminder)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-line-strong bg-surface text-[15px] font-bold">Send reminder on WhatsApp</a>}
            <div className="flex gap-2.5">
              {x.status === "confirmed" && x.startAt <= now && <Button variant="secondary" className="flex-1" onClick={status("no_show", "Mark as no-show", "Mark no-show")}>No-show</Button>}
              <Button variant="ghost" className="flex-1 text-danger-600 hover:bg-danger-50" onClick={status("cancelled", "Cancel booking", "Cancel booking", true)}>Cancel booking</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export const dayRange = (localDate: string, offset: number) => {
  const start = localToInstant(localDate, 0, offset);
  return { start, end: start + DAY };
};
export const todayLocal = (offset: number) => instantToLocalDate(Date.now(), offset);
