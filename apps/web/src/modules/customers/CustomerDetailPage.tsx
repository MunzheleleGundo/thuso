import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { balanceDue, displayStatus, isEnabled, label as bookingLabel } from "@thuso/core";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useBookingsForCustomer, useCustomer, useInvoicesForCustomer } from "../../data/hooks";
import { dateTime, rand, shortDate, whatsappLink } from "../../lib/format";
import { useFeedback } from "../../ui/feedback";
import { Icon } from "../../ui/icons";
import { Button, ButtonLink, Card, EmptyState, PageHeader, PageSpinner, Pill } from "../../ui/kit";
import { CustomerDialog } from "./CustomerForm";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { bizId, business: b, actor } = useWorkspace();
  const { toast } = useFeedback();
  const customer = useCustomer(bizId, id);
  const bookings = useBookingsForCustomer(bizId, id ?? "");
  const invoices = useInvoicesForCustomer(bizId, id ?? "");
  const [editing, setEditing] = useState(false);
  const now = Date.now();

  if (customer.loading) return <PageSpinner />;
  const c = customer.data;
  if (!c) return <EmptyState icon="users" title="Customer not found" body="It may have been removed." action={<ButtonLink to="/app/customers">All customers</ButtonLink>} />;

  const owed = invoices.data.filter((i) => i.status !== "cancelled").reduce((s, i) => s + balanceDue(i), 0);
  const timeline = [
    ...bookings.data.map((x) => ({ at: x.startAt, key: `b${x.id}`, kind: "booking" as const, x })),
    ...invoices.data.map((x) => ({ at: x.issueDate, key: `i${x.id}`, kind: "invoice" as const, x })),
  ].sort((p, q) => q.at - p.at);

  return (
    <>
      <PageHeader back="/app/customers" title={c.name}
        subtitle={<>{[c.phone.replace(/^\+27/, "0"), c.email].filter(Boolean).join(" · ")}{c.archived && <> · <Pill>Archived</Pill></>}</>}
        actions={<>
          {c.phone && <a className="inline-flex h-12 items-center gap-2 rounded-[10px] border-[1.5px] border-line-strong bg-surface px-5 text-[15px] font-bold" href={whatsappLink(c.phone, `Hi ${c.name.split(" ")[0]}, `)} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={18} />WhatsApp</a>}
          {isEnabled(b.enabledModules, "invoicing") && <ButtonLink to={`/app/invoices/new?customer=${c.id}`} icon="invoice" variant="secondary">New invoice</ButtonLink>}
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        </>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="text-[15px] font-extrabold">History</h2></div>
          {timeline.length === 0 ? <p className="px-5 py-6 text-[14px] text-muted">No bookings or invoices yet.</p> : (
            <ul>
              {timeline.map((t) => t.kind === "booking" ? (
                <li key={t.key} className="flex items-center gap-3 border-b border-subtle px-5 py-3 last:border-0">
                  <span className="text-brand-600"><Icon name="calendar" size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold">{t.x.serviceName}</span><span className="block text-[12px] text-muted">{dateTime(t.x.startAt, b.utcOffsetMinutes)}</span></span>
                  <Pill tone={t.x.status === "completed" ? "green" : t.x.status === "cancelled" || t.x.status === "no_show" ? "grey" : "amber"}>{bookingLabel(t.x.status)}</Pill>
                </li>
              ) : (
                <li key={t.key}>
                  <Link to={`/app/invoices/${t.x.id}`} className="flex items-center gap-3 border-b border-subtle px-5 py-3 last:border-0 hover:bg-canvas">
                    <span className="text-brand-600"><Icon name="invoice" size={18} /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold">{t.x.number ?? "New invoice"} · {rand(t.x.totalCents)}</span><span className="block text-[12px] text-muted">{shortDate(t.x.issueDate, b.utcOffsetMinutes)}</span></span>
                    <Pill tone={displayStatus(t.x, now) === "Paid" ? "green" : displayStatus(t.x, now) === "Overdue" ? "red" : "grey"}>{displayStatus(t.x, now)}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          {isEnabled(b.enabledModules, "invoicing") && <Card className="p-5"><div className="text-[12px] font-bold text-muted">Owes you</div><div className="tabular mt-1 text-[26px] font-extrabold">{rand(owed)}</div></Card>}
          <Card className="flex flex-col gap-2 p-5 text-[14px]">
            <div className="text-[12px] font-bold text-muted">Contact preference</div>
            <div className="font-bold capitalize">{c.preferredChannel === "sms" ? "SMS" : c.preferredChannel}</div>
            <div className="text-muted">{c.consent.whatsapp || c.consent.sms || c.consent.email ? "Agreed to reminders" : "Has not agreed to reminders yet"}</div>
            {c.notes && <><div className="mt-2 text-[12px] font-bold text-muted">Notes</div><p className="whitespace-pre-wrap">{c.notes}</p></>}
          </Card>
          <Button variant="ghost" onClick={async () => {
            const r = await uc.customers.setArchived(bizId, actor, c.id, !c.archived);
            toast(r.ok ? (c.archived ? "Customer restored" : "Customer archived") : r.error.message, r.ok ? "ok" : "error");
          }}>{c.archived ? "Restore customer" : "Archive customer"}</Button>
        </div>
      </div>
      {editing && <CustomerDialog open existing={c} onClose={() => setEditing(false)} />}
    </>
  );
}
