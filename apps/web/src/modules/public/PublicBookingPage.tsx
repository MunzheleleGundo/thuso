import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { addDaysLocal, formatLocalDateTime, instantToLocalDate, instantToLocalTime, isEmail, normalizePhone, weekdayOf } from "@thuso/core";
import { api, callableMessage, type PublicBookingResult, type PublicBusiness, type PublicService } from "../../adapters/functions";
import { rand } from "../../lib/format";
import { Icon } from "../../ui/icons";
import { Alert, Button, Card, Checkbox, cn, Field, Input, Logo, PageSpinner, Textarea } from "../../ui/kit";

type Step = "service" | "time" | "details" | "done";

export default function PublicBookingPage() {
  const { slug = "" } = useParams();
  const [page, setPage] = useState<{ business: PublicBusiness; services: PublicService[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<PublicService | null>(null);
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<number[] | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", consent: true, website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingResult | null>(null);

  useEffect(() => {
    api.publicBookingPage({ slug }).then(setPage).catch((e) => setLoadError(callableMessage(e, "We could not load this booking page.")));
  }, [slug]);

  const off = page?.business.utcOffsetMinutes ?? 120;
  const today = instantToLocalDate(Date.now(), off);
  const days = page ? Array.from({ length: Math.min(page.business.maxAdvanceDays || 14, 21) }, (_, i) => addDaysLocal(today, i))
    .filter((d) => page.business.openDays.includes(weekdayOf(d))) : [];

  useEffect(() => {
    if (!service || !date) return;
    setTimes(null); setStartAt(null);
    let live = true;
    api.publicAvailability({ slug, serviceId: service.id, date }).then((r) => live && setTimes(r.times)).catch(() => live && setTimes([]));
    return () => { live = false; };
  }, [slug, service, date]);

  if (loadError) return <Shell><Card className="p-8 text-center"><h1 className="text-[22px] font-extrabold">Booking page not found</h1><p className="mt-2 text-muted">{loadError}</p></Card></Shell>;
  if (!page) return <Shell><PageSpinner /></Shell>;
  const b = page.business;

  if (!b.bookable || page.services.length === 0) {
    return <Shell business={b}><Card className="p-8 text-center"><h1 className="text-[22px] font-extrabold">{b.name}</h1><p className="mt-2 text-muted">is not taking online bookings right now.{b.phone && <> Please call or WhatsApp {b.phone}.</>}</p></Card></Shell>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError("Please enter your name.");
    if (!normalizePhone(form.phone) && !isEmail(form.email)) return setError("Please enter a phone number or an email address so we can reach you.");
    if (form.email && !isEmail(form.email)) return setError("That email address does not look right.");
    setBusy(true); setError(null);
    try {
      const r = await api.createPublicBooking({
        slug, serviceId: service!.id, startAt: startAt!, name: form.name, phone: form.phone, email: form.email, notes: form.notes, website: form.website,
        consent: { whatsapp: form.consent && !!form.phone, sms: form.consent && !!form.phone, email: form.consent && !!form.email },
      });
      setResult(r); setStep("done");
    } catch (err) {
      const msg = callableMessage(err, "We could not make the booking. Please try again.");
      setError(msg);
      if (/taken|choose another/i.test(msg)) { setStep("time"); setTimes(null); setDate((d) => d); }
    }
    setBusy(false);
  }

  return (
    <Shell business={b}>
      {step !== "done" && <Steps step={step} />}
      {step === "service" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[20px] font-extrabold">Choose a service</h2>
          {page.services.map((s) => (
            <button key={s.id} type="button" onClick={() => { setService(s); setDate(days[0] ?? today); setStep("time"); }}
              className="flex items-center gap-4 rounded-[14px] border-[1.5px] border-line bg-surface p-4 text-left hover:border-brand-600">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold">{s.name}</span>
                <span className="block text-[13px] text-muted">{s.durationMinutes} min{s.depositCents ? ` · ${rand(s.depositCents)} deposit` : ""}</span>
                {s.description && <span className="mt-1 block text-[13px] text-muted">{s.description}</span>}
              </span>
              <span className="tabular text-[16px] font-extrabold">{rand(s.priceCents)}</span>
              <Icon name="chevronRight" className="text-muted" />
            </button>
          ))}
        </div>
      )}
      {step === "time" && service && (
        <div className="flex flex-col gap-4">
          <button type="button" onClick={() => setStep("service")} className="self-start text-[13px] font-bold text-brand-600">← {service.name}</button>
          <h2 className="text-[20px] font-extrabold">Pick a day and time</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={d === date}
                className={cn("min-h-14 min-w-[64px] rounded-xl border-[1.5px] px-2 text-[12px] font-bold", d === date ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface")}>
                <span className="block">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" })}</span>
                <span className="block text-[16px]">{Number(d.slice(8))}</span>
                <span className="block font-semibold opacity-80">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-ZA", { month: "short", timeZone: "UTC" })}</span>
              </button>
            ))}
          </div>
          {error && <Alert tone="amber">{error}</Alert>}
          {times === null ? <p className="text-muted">Finding free times…</p> : times.length === 0 ? <p className="text-muted">No free times on this day. Try another day.</p> : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {times.map((t) => (
                <button key={t} type="button" aria-pressed={startAt === t} onClick={() => setStartAt(t)}
                  className={cn("min-h-12 rounded-[10px] border-[1.5px] text-[15px] font-bold", startAt === t ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface hover:border-brand-600")}>
                  {instantToLocalTime(t, off)}
                </button>
              ))}
            </div>
          )}
          <Button disabled={startAt === null} onClick={() => { setError(null); setStep("details"); }}>Continue</Button>
        </div>
      )}
      {step === "details" && service && startAt !== null && (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <button type="button" onClick={() => setStep("time")} className="self-start text-[13px] font-bold text-brand-600">← Change time</button>
          <Card className="p-4 text-[14px]">
            <div className="font-extrabold">{service.name}</div>
            <div className="text-muted">{formatLocalDateTime(startAt, off)} · {service.durationMinutes} min · {rand(service.priceCents)}</div>
          </Card>
          <Field label="Your name" htmlFor="pb-name"><Input id="pb-name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone (WhatsApp)" htmlFor="pb-phone"><Input id="pb-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="082 123 4567" /></Field>
          <Field label="Email" htmlFor="pb-email" optional><Input id="pb-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Anything we should know?" htmlFor="pb-notes" optional><Textarea id="pb-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-[64px]" /></Field>
          {/* Hidden from people; bots fill it in. */}
          <input tabIndex={-1} aria-hidden="true" autoComplete="off" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} name="website" />
          <Checkbox checked={form.consent} onChange={(v) => setForm({ ...form, consent: v })} label={`${b.name} may send me booking reminders and invoices`} />
          <p className="text-[12px] leading-relaxed text-muted">Your details go to {b.name} only, to manage this booking. Booking runs on THUSO.</p>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}>Book {service.depositCents ? "and see deposit details" : "now"}</Button>
        </form>
      )}
      {step === "done" && result && (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name="check" size={30} strokeWidth={2.4} /></div>
          <h2 className="text-[24px] font-extrabold">{result.status === "confirmed" ? "You are booked!" : "Booking received"}</h2>
          <p className="text-[15px] text-muted">{result.serviceName} with {result.businessName}<br /><strong className="text-ink">{formatLocalDateTime(result.startAt, off)}</strong></p>
          {result.status === "requested" && result.depositCents > 0 && (
            <Alert tone="amber">A deposit of {rand(result.depositCents)} secures your booking. {result.businessName} will send you payment details{result.businessPhone ? `, or contact them on ${result.businessPhone}` : ""}.</Alert>
          )}
          <Button variant="secondary" onClick={() => { setStep("service"); setService(null); setStartAt(null); setResult(null); }}>Make another booking</Button>
        </Card>
      )}
    </Shell>
  );
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["service", "time", "details"];
  const labels = { service: "Service", time: "Time", details: "Your details", done: "" };
  return (
    <ol className="mb-5 flex gap-2 text-[12px] font-bold">
      {order.map((s, i) => (
        <li key={s} className={cn("flex-1 border-t-4 pt-1.5", order.indexOf(step) >= i ? "border-brand-600 text-brand-700" : "border-line text-muted")}>{labels[s]}</li>
      ))}
    </ol>
  );
}

function Shell({ business, children }: { business?: PublicBusiness; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-brand-600 px-5 pb-8 pt-6 text-white">
        <div className="mx-auto max-w-xl">
          {business ? (
            <>
              <h1 className="text-[26px] font-extrabold">{business.name}</h1>
              <p className="mt-1 text-[14px] text-[#d7ebe4]">{business.town}, {business.province}{business.phone ? ` · ${business.phone}` : ""}</p>
            </>
          ) : <Logo inverted />}
        </div>
      </header>
      <main className="mx-auto -mt-4 max-w-xl px-4 pb-16">
        <div className="rounded-2xl bg-canvas pt-4">{children}</div>
        <p className="mt-10 text-center text-[12px] text-muted">Bookings by <a href="/" className="font-bold text-brand-600">THUSO</a></p>
      </main>
    </div>
  );
}
