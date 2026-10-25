import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { addDaysLocal, isLocalDate } from "@thuso/core";
import { useWorkspace } from "../../app/session";
import { useBookingsBetween } from "../../data/hooks";
import { longDate, rand, time } from "../../lib/format";
import { Icon } from "../../ui/icons";
import { Button, ButtonLink, Card, cn, EmptyState, IconButton, Input, PageHeader, PageSpinner, Pill } from "../../ui/kit";
import { BookingDetailDialog, dayRange, NewBookingDialog, statusText, statusTone, todayLocal } from "./BookingDialogs";

export default function BookingsPage() {
  const { bizId, business: b } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const off = b.utcOffsetMinutes;
  const today = todayLocal(off);
  const date = isLocalDate(params.get("date") ?? "") ? params.get("date")! : today;
  const { start, end } = useMemo(() => dayRange(date, off), [date, off]);
  const bookings = useBookingsBetween(bizId, start, end);
  const selected = bookings.data.find((x) => x.id === params.get("booking")) ?? null;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) if (v === null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const visible = bookings.data.filter((x) => x.status !== "cancelled");
  const cancelled = bookings.data.filter((x) => x.status === "cancelled");
  const expected = visible.filter((x) => x.status !== "no_show").reduce((s, x) => s + x.priceCents, 0);

  return (
    <>
      <PageHeader title="Bookings"
        actions={<>
          <ButtonLink to="/app/bookings/services" variant="secondary">Services</ButtonLink>
          <ButtonLink to="/app/settings?tab=booking-page" variant="secondary" icon="link">Booking page</ButtonLink>
          <Button icon="plus" onClick={() => set({ new: "1" })}>New booking</Button>
        </>} />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <IconButton icon="chevronLeft" label="Previous day" onClick={() => set({ date: addDaysLocal(date, -1), booking: null })} />
        <IconButton icon="chevronRight" label="Next day" onClick={() => set({ date: addDaysLocal(date, 1), booking: null })} />
        <h2 className="flex-1 px-1 text-[17px] font-extrabold">{date === today ? "Today, " : ""}{longDate(date)}</h2>
        {date !== today && <Button variant="ghost" size="sm" onClick={() => set({ date: null, booking: null })}>Today</Button>}
        <Input type="date" aria-label="Go to date" value={date} onChange={(e) => e.target.value && set({ date: e.target.value, booking: null })} className="h-11 w-auto" />
      </Card>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {Array.from({ length: 7 }, (_, i) => addDaysLocal(today, i)).map((d) => (
          <button key={d} type="button" onClick={() => set({ date: d, booking: null })}
            className={cn("min-h-12 min-w-[64px] rounded-xl border-[1.5px] px-2 text-center text-[12px] font-bold", d === date ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface")}>
            <span className="block">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" })}</span>
            <span className="block text-[15px]">{Number(d.slice(8))}</span>
          </button>
        ))}
      </div>
      {bookings.loading ? <PageSpinner /> : visible.length === 0 ? (
        <Card><EmptyState icon="calendar" title="Nothing booked" body={b.schedule ? "Share your booking page so customers can book themselves, or add a booking." : "Add your working hours so customers can book online, or add a booking yourself."}
          action={<Button icon="plus" onClick={() => set({ new: "1" })}>New booking</Button>} /></Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px] text-muted">
            <span>{visible.length} booking{visible.length === 1 ? "" : "s"}</span><span className="font-bold text-ink">{rand(expected)} expected</span>
          </div>
          <ul>
            {visible.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => set({ booking: x.id })} className="flex w-full items-center gap-4 border-b border-subtle px-5 py-3.5 text-left last:border-0 hover:bg-canvas">
                  <span className="tabular w-[52px] shrink-0 text-[15px] font-extrabold">{time(x.startAt, off)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{x.customerName}</span>
                    <span className="block truncate text-[13px] text-muted">{x.serviceName} · until {time(x.endAt, off)}</span>
                  </span>
                  <Pill tone={statusTone(x)}>{statusText(x)}</Pill>
                  <span className="tabular hidden w-[90px] text-right text-[14px] font-bold sm:block">{rand(x.priceCents)}</span>
                  <Icon name="chevronRight" size={18} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {cancelled.length > 0 && <p className="mt-3 text-[13px] text-muted">{cancelled.length} cancelled booking{cancelled.length === 1 ? "" : "s"} hidden.</p>}
      {params.get("new") === "1" && <NewBookingDialog open initialDate={date} onClose={() => set({ new: null })} />}
      {selected && <BookingDetailDialog booking={selected} onClose={() => set({ booking: null })} />}
    </>
  );
}
