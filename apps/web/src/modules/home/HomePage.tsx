import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  balanceDue, C, checklistProgress, DAY, deriveChecklist, displayStatus, instantToLocalDate, isEnabled, isLow, isOpen, isOverdue,
  label as bookingLabel, startOfLocalDay, type ChecklistAction,
} from "@thuso/core";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { useBookingsBetween, useHasAny, useInvoices, useStockItems } from "../../data/hooks";
import { firstName, greeting, rand, time } from "../../lib/format";
import { useFeedback } from "../../ui/feedback";
import { Icon } from "../../ui/icons";
import { Button, ButtonLink, Card, cn, Pill, Stat } from "../../ui/kit";
import { openAsk } from "../shell/AppShell";

const ACTION_PATH: Record<ChecklistAction, { to: string; label: string }> = {
  profile: { to: "/app/settings?tab=business", label: "Edit" },
  goals: { to: "/onboarding/goals", label: "Add" },
  modules: { to: "/app/settings?tab=tools", label: "Choose" },
  hours: { to: "/app/settings?tab=hours", label: "Add hours" },
  "invoice-details": { to: "/app/settings?tab=invoices", label: "Add details" },
  services: { to: "/app/bookings/services", label: "Add services" },
  "booking-page": { to: "/app/settings?tab=booking-page", label: "Share" },
  "first-invoice": { to: "/app/invoices/new", label: "Create" },
  stock: { to: "/app/stock", label: "Add items" },
  customers: { to: "/app/customers?new=1", label: "Add" },
  professionals: { to: "/onboarding/professionals", label: "Choose" },
};

export default function HomePage() {
  const { business: b, bizId, actor, user } = useWorkspace();
  const nav = useNavigate();
  const { toast } = useFeedback();
  const now = Date.now();
  const off = b.utcOffsetMinutes;
  const dayStart = useMemo(() => startOfLocalDay(now, off), [off, Math.floor(now / DAY)]);

  const bookingsOn = isEnabled(b.enabledModules, "bookings");
  const invoicingOn = isEnabled(b.enabledModules, "invoicing");
  const stockOn = isEnabled(b.enabledModules, "stock");

  const today = useBookingsBetween(bizId, dayStart, dayStart + DAY);
  const invoices = useInvoices(bizId);
  const stock = useStockItems(bizId);
  const facts = {
    serviceCount: useHasAny(bizId, C.services).value ? 1 : 0,
    stockItemCount: stock.data.length,
    customerCount: useHasAny(bizId, C.customers).value ? 1 : 0,
    invoiceCount: invoices.data.length,
  };
  const checklist = deriveChecklist(b, facts);
  const progress = checklistProgress(checklist);
  const showChecklist = !b.onboarding.checklistDismissed && progress.done < progress.total;

  const activeToday = today.data.filter((x) => x.status !== "cancelled");
  const open = invoices.data.filter((i) => isOpen(i) && balanceDue(i) > 0);
  const owed = open.reduce((s, i) => s + balanceDue(i), 0);
  const overdue = open.filter((i) => isOverdue(i, now));
  const low = stock.data.filter(isLow);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold">{greeting(now, off)}, {firstName(actor.name || user.displayName || "")}</h1>
          <p className="mt-1 text-[14px] text-muted">Here is what needs you today.</p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" icon="spark" onClick={openAsk}>Ask THUSO</Button>
          {bookingsOn ? <ButtonLink to="/app/bookings?new=1" icon="plus">New booking</ButtonLink>
            : invoicingOn ? <ButtonLink to="/app/invoices/new" icon="plus">New invoice</ButtonLink>
              : <ButtonLink to="/app/customers?new=1" icon="plus">New customer</ButtonLink>}
        </div>
      </div>

      {showChecklist && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold">Finish setting up</h2>
              <p className="mt-1 text-[13px] text-muted">{progress.done} of {progress.total} done. Do the rest whenever you are ready.</p>
            </div>
            <button type="button" className="min-h-11 text-[13px] font-bold text-brand-600"
              onClick={() => uc.workspace.dismissChecklist(bizId, actor, true).then((r) => !r.ok && toast(r.error.message, "error"))}>Hide</button>
          </div>
          <div className="mb-1 mt-3.5 h-2 rounded-full bg-subtle" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total} aria-label="Setup progress">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <ul>
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-3.5 border-b border-subtle py-3 last:border-0">
                {item.done
                  ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Icon name="check" size={13} strokeWidth={2.6} /></span>
                  : <span className="h-6 w-6 shrink-0 rounded-full border-2 border-line-strong" />}
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[14px] font-bold", item.done && "text-muted line-through")}>{item.title}</div>
                  {item.detail && !item.done && <div className="mt-0.5 text-[12px] text-muted">{item.detail}</div>}
                </div>
                {!item.done && <ButtonLink to={ACTION_PATH[item.action].to} variant="secondary" size="sm">{ACTION_PATH[item.action].label}</ButtonLink>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {bookingsOn && <Stat label="Bookings today" value={activeToday.length} />}
        {invoicingOn && <Stat label="Still owed to you" value={rand(owed)} hint={overdue.length ? <span className="font-bold text-danger-600">{overdue.length} overdue</span> : `${open.length} open invoice${open.length === 1 ? "" : "s"}`} />}
        {stockOn && <Stat label="Low stock items" value={low.length} />}
        {!bookingsOn && !invoicingOn && !stockOn && <Stat label="Tools switched on" value={b.enabledModules.length} hint="Add more in Settings" />}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {bookingsOn && (
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-extrabold">Today's bookings</h2>
              <Link to="/app/bookings" className="text-[13px] font-bold text-brand-600">Open calendar</Link>
            </div>
            {activeToday.length === 0 ? <p className="px-5 py-6 text-[14px] text-muted">Nothing booked for today{b.schedule ? "." : ". Add your working hours so customers can book online."}</p> : (
              <ul>
                {activeToday.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => nav(`/app/bookings?date=${instantToLocalDate(x.startAt, off)}&booking=${x.id}`)}
                      className="flex w-full items-center gap-4 border-b border-subtle px-5 py-3 text-left last:border-0 hover:bg-canvas">
                      <span className="tabular w-[52px] text-[14px] font-bold">{time(x.startAt, off)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold">{x.customerName}</span><span className="block truncate text-[12px] text-muted">{x.serviceName}</span></span>
                      <Pill tone={x.status === "confirmed" ? "green" : x.status === "requested" ? "amber" : "grey"}>{x.status === "requested" && x.depositCents > 0 && !x.depositPaid ? "Deposit due" : bookingLabel(x.status)}</Pill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {invoicingOn && (
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-extrabold">Waiting for payment</h2>
              <Link to="/app/invoices" className="text-[13px] font-bold text-brand-600">All invoices</Link>
            </div>
            {open.length === 0 ? <p className="px-5 py-6 text-[14px] text-muted">Nobody owes you anything right now.</p> : (
              <ul>
                {[...open].sort((x, y) => x.dueDate - y.dueDate).slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <Link to={`/app/invoices/${i.id}`} className="flex items-center gap-4 border-b border-subtle px-5 py-3 last:border-0 hover:bg-canvas">
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold">{i.customerName}</span><span className="block text-[12px] text-muted">{i.number ?? "New invoice"}</span></span>
                      <Pill tone={isOverdue(i, now) ? "red" : i.status === "draft" ? "grey" : "amber"}>{displayStatus(i, now)}</Pill>
                      <span className="tabular w-[96px] text-right text-[14px] font-bold">{rand(balanceDue(i))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {stockOn && low.length > 0 && (
          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-extrabold">Running low</h2>
              <Link to="/app/stock" className="text-[13px] font-bold text-brand-600">Stock</Link>
            </div>
            <ul>
              {low.slice(0, 6).map((i) => (
                <li key={i.id} className="flex justify-between border-b border-subtle px-5 py-3 text-[14px] last:border-0">
                  <span className="font-semibold">{i.name}</span>
                  <span className={cn("font-bold", i.quantity <= 0 ? "text-danger-600" : "text-warn-700")}>{i.quantity} left</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
