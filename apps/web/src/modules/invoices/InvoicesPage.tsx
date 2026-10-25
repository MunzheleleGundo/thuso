import { useState } from "react";
import { Link } from "react-router-dom";
import { balanceDue, displayStatus, isOpen, isOverdue, type Invoice } from "@thuso/core";
import { useWorkspace } from "../../app/session";
import { useInvoices } from "../../data/hooks";
import { rand, shortDate } from "../../lib/format";
import { ButtonLink, Card, EmptyState, PageHeader, PageSpinner, Pill, Stat, Tabs } from "../../ui/kit";

type Filter = "all" | "unpaid" | "overdue" | "paid" | "draft";

export function invoiceTone(i: Invoice, now: number): "green" | "red" | "amber" | "grey" | "blue" {
  const s = displayStatus(i, now);
  return s === "Paid" ? "green" : s === "Overdue" ? "red" : s === "Draft" || s === "Cancelled" ? "grey" : s === "Partly paid" ? "blue" : "amber";
}

export default function InvoicesPage() {
  const { bizId, business: b } = useWorkspace();
  const invoices = useInvoices(bizId);
  const [filter, setFilter] = useState<Filter>("all");
  const now = Date.now();
  const open = invoices.data.filter((i) => isOpen(i) && balanceDue(i) > 0);
  const overdue = open.filter((i) => isOverdue(i, now));
  const thisMonth = new Date(now).toISOString().slice(0, 7);
  const paidThisMonth = invoices.data.filter((i) => i.status === "paid" && new Date(i.updatedAt).toISOString().slice(0, 7) === thisMonth).reduce((s, i) => s + i.totalCents, 0);

  const list = invoices.data.filter((i) => ({
    all: true, unpaid: isOpen(i) && i.status !== "draft" && balanceDue(i) > 0, overdue: isOverdue(i, now), paid: i.status === "paid", draft: i.status === "draft",
  })[filter]);

  return (
    <>
      <PageHeader title="Invoices" actions={<ButtonLink to="/app/invoices/new" icon="plus">New invoice</ButtonLink>} />
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Still owed" value={rand(open.reduce((s, i) => s + balanceDue(i), 0))} hint={`${open.length} open`} />
        <Stat label="Overdue" value={rand(overdue.reduce((s, i) => s + balanceDue(i), 0))} hint={overdue.length ? <span className="font-bold text-danger-600">{overdue.length} invoice{overdue.length === 1 ? "" : "s"}</span> : "None"} />
        <Stat label="Paid this month" value={rand(paidThisMonth)} />
      </div>
      <Tabs value={filter} onChange={setFilter} items={[
        { id: "all", label: "All" }, { id: "unpaid", label: "Unpaid" }, { id: "overdue", label: `Overdue${overdue.length ? ` (${overdue.length})` : ""}` },
        { id: "paid", label: "Paid" }, { id: "draft", label: "Drafts" },
      ]} />
      {invoices.loading ? <PageSpinner /> : list.length === 0 ? (
        <Card><EmptyState icon="invoice" title={filter === "all" ? "No invoices yet" : "Nothing here"}
          body={filter === "all" ? "Create an invoice and send it with a payment link. You can also invoice straight from a completed booking." : "No invoices match this filter."}
          action={filter === "all" ? <ButtonLink to="/app/invoices/new" icon="plus">New invoice</ButtonLink> : undefined} /></Card>
      ) : (
        <Card>
          <ul>
            {list.map((i) => (
              <li key={i.id}>
                <Link to={`/app/invoices/${i.id}`} className="flex items-center gap-4 border-b border-subtle px-5 py-3.5 last:border-0 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{i.customerName}</span>
                    <span className="block text-[13px] text-muted">{i.number ?? "Numbering…"} · {shortDate(i.issueDate, b.utcOffsetMinutes)}</span>
                  </span>
                  <Pill tone={invoiceTone(i, now)}>{displayStatus(i, now)}</Pill>
                  <span className="tabular w-[100px] text-right text-[15px] font-bold">{rand(i.totalCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
