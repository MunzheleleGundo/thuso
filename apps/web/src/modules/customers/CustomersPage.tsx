import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { initials, matchesQuery } from "@thuso/core";
import { useWorkspace } from "../../app/session";
import { useCustomers } from "../../data/hooks";
import { Icon } from "../../ui/icons";
import { Button, Card, EmptyState, Input, PageHeader, PageSpinner, Pill } from "../../ui/kit";
import { CustomerDialog } from "./CustomerForm";

export default function CustomersPage() {
  const { bizId } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const customers = useCustomers(bizId);
  const adding = params.get("new") === "1";
  const setAdding = (v: boolean) => setParams(v ? { new: "1" } : {}, { replace: true });

  const list = customers.data.filter((c) => c.archived === showArchived && matchesQuery(c, q));

  return (
    <>
      <PageHeader title="Customers" subtitle={`${customers.data.filter((c) => !c.archived).length} customers`}
        actions={<Button icon="plus" onClick={() => setAdding(true)}>Add customer</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={18} /></span>
          <Input aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email" className="pl-10" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[14px] font-semibold text-ink-soft">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-[18px] w-[18px] accent-brand-600" />Show archived
        </label>
      </div>
      {customers.loading ? <PageSpinner /> : list.length === 0 ? (
        <Card><EmptyState icon="users" title={q ? "No matches" : "No customers yet"}
          body={q ? "Try a different name or number." : "Add your customers here, or let them add themselves when they book online."}
          action={!q ? <Button icon="plus" onClick={() => setAdding(true)}>Add customer</Button> : undefined} /></Card>
      ) : (
        <Card>
          <ul>
            {list.map((c) => (
              <li key={c.id}>
                <Link to={`/app/customers/${c.id}`} className="flex items-center gap-3.5 border-b border-subtle px-4 py-3 last:border-0 hover:bg-canvas sm:px-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-[13px] font-extrabold text-brand-700">{initials(c.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{c.name}</span>
                    <span className="block truncate text-[13px] text-muted">{[c.phone.replace(/^\+27/, "0"), c.email].filter(Boolean).join(" · ")}</span>
                  </span>
                  {c.source === "public" && <Pill tone="blue">Booked online</Pill>}
                  <Icon name="chevronRight" size={18} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {adding && <CustomerDialog open onClose={() => setAdding(false)} />}
    </>
  );
}
