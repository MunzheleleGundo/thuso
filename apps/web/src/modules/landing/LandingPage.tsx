import { Link } from "react-router-dom";
import { useSession } from "../../app/session";
import { Icon, type IconName } from "../../ui/icons";
import { ButtonLink, Card, Logo, Pill } from "../../ui/kit";

const TOOLS: { icon: IconName; title: string; body: string }[] = [
  { icon: "calendar", title: "Bookings", body: "A booking page your customers can use, only free slots shown, deposits and reminders that cut no-shows." },
  { icon: "invoice", title: "Invoices and payments", body: "Send an invoice with a payment link on WhatsApp in seconds and see the moment it is paid." },
  { icon: "box", title: "Stock", body: "Know what is on the shelf, get warned before you run out, and keep working when the signal drops." },
  { icon: "users", title: "Customers", body: "One timeline per customer: what they booked, bought and still owe, and how they like to be contacted." },
  { icon: "spark", title: "Ask THUSO", body: "One assistant that knows your business data, and one for everything else you are unsure about." },
  { icon: "shield", title: "Compliance and experts", body: "Deadlines as a plain to-do list, and verified accountants and lawyers when you need them. Coming soon." },
];

function PreviewCard() {
  const rows: [IconName, string, string][] = [
    ["invoice", "Send invoice", "R 1,200.00 on WhatsApp, with a payment link"],
    ["box", "Update stock", "Item A goes from 4 to 2"],
    ["calendar", "Close booking", "Marked as completed"],
  ];
  return (
    <Card className="w-full max-w-[440px] p-6 text-ink">
      <div className="mb-1.5 flex items-center justify-between"><div className="text-[17px] font-extrabold">Before we do this</div><Pill tone="green">Preview</Pill></div>
      <div className="text-[14px] text-muted">A booking is complete. THUSO will:</div>
      <ul>{rows.map(([icon, t, d]) => (
        <li key={t} className="flex gap-3 border-b border-subtle py-3.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon name={icon} size={16} strokeWidth={2} /></span>
          <span><span className="block text-[15px] font-bold">{t}</span><span className="block text-[13px] text-muted">{d}</span></span>
        </li>
      ))}</ul>
      <div className="mt-4 flex gap-2.5">
        <span className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-brand-600 text-[15px] font-bold text-white">Confirm</span>
        <span className="flex h-12 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-line-strong text-[15px] font-bold">Edit first</span>
      </div>
    </Card>
  );
}

export default function LandingPage() {
  const { user } = useSession();
  return (
    <div className="bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-6 px-6 py-4">
          <Logo />
          <nav aria-label="Main" className="hidden flex-1 gap-7 text-[15px] font-semibold text-ink-soft md:flex">
            <a href="#tools">Tools</a><a href="#how">How it works</a><a href="#pricing">Pricing</a>
          </nav>
          <div className="ml-auto flex gap-2.5">
            {user ? <ButtonLink to="/app">Open THUSO</ButtonLink> : <><ButtonLink to="/signin" variant="ghost">Sign in</ButtonLink><ButtonLink to="/signup">Get started</ButtonLink></>}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 py-20 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col gap-6">
          <span className="self-start"><Pill tone="amber">Thuso means help</Pill></span>
          <h1 className="text-[44px] font-extrabold leading-[1.06] tracking-[-1px] sm:text-[56px]">Run your business with confidence.</h1>
          <p className="max-w-[520px] text-[18px] leading-relaxed text-muted sm:text-[19px]">Bookings, invoices, stock and expert help in one place. THUSO shows you every step before it happens, so you never have to guess.</p>
          <div className="flex flex-wrap gap-3"><ButtonLink to="/signup" size="lg">Get started free</ButtonLink><a href="#how" className="inline-flex h-[54px] items-center rounded-[10px] border-[1.5px] border-line-strong bg-surface px-7 text-base font-bold">See how it works</a></div>
          <p className="text-[14px] text-muted">Free plan available. No card needed. Works on any phone.</p>
        </div>
        <div className="flex justify-center"><PreviewCard /></div>
      </section>

      <section id="tools" className="border-y border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-20">
          <div className="max-w-[640px]"><h2 className="text-[34px] font-extrabold tracking-[-0.6px] sm:text-[38px]">Switch on only what you need</h2><p className="mt-3 text-[17px] leading-relaxed text-muted">Every business is different. Pick your tools during sign-up and change them any time.</p></div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => (
              <Card key={t.title} className="flex flex-col gap-3 p-6">
                <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-brand-50 text-brand-600"><Icon name={t.icon} /></span>
                <h3 className="text-[18px] font-extrabold">{t.title}</h3><p className="text-[15px] leading-relaxed text-muted">{t.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-20">
        <h2 className="text-[34px] font-extrabold tracking-[-0.6px] sm:text-[38px]">Set up in three minutes</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[["Tell us about your business", "What you do, how big you are, and why you are here."], ["Switch on your tools", "We suggest the right ones. You decide."], ["Get help at every step", "Previews before anything is sent, and answers whenever you ask."]].map(([t, d], i) => (
            <Card key={t} className="flex flex-col gap-2.5 p-6"><div className="text-[15px] font-extrabold text-brand-600">Step {i + 1}</div><h3 className="text-[20px] font-extrabold">{t}</h3><p className="text-[15px] leading-relaxed text-muted">{d}</p></Card>
          ))}
        </div>
      </section>

      <section className="bg-brand-600 text-white">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 py-20 lg:grid-cols-2">
          <div className="flex flex-col gap-4"><h2 className="text-[34px] font-extrabold tracking-[-0.6px] sm:text-[38px]">See it before it happens</h2>
            <p className="text-[17px] leading-relaxed text-[#d7ebe4]">Before THUSO sends a message, moves money or changes your stock, it tells you exactly what will happen in plain words. Confirm, or change it first. Beginners feel safe, experts stay in control.</p></div>
          <div className="flex justify-center"><PreviewCard /></div>
        </div>
      </section>

      <section id="pricing" className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-20">
        <div><h2 className="text-[34px] font-extrabold tracking-[-0.6px] sm:text-[38px]">Simple pricing</h2><p className="mt-3 text-[17px] text-muted">Start free. Paid plans for growing teams are coming soon.</p></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[["Free", "Trying THUSO", "R0", ["Core tools", "Bookings, invoices and stock", "Ask THUSO, daily limit"]],
            ["Starter", "Solo and small", "Soon", ["Up to 3 members", "Payment links and reminders", "More Ask THUSO"]],
            ["Growth", "Established teams", "Soon", ["Up to 15 members and roles", "Compliance", "Priority messaging"]],
            ["Enterprise", "Corporates", "Talk to us", ["Unlimited members", "Approvals and audit exports", "Onboarding support"]]].map(([n, who, price, feats], i) => (
            <Card key={n as string} className={i === 0 ? "flex flex-col gap-3.5 border-2 border-brand-600 p-6" : "flex flex-col gap-3.5 p-6"}>
              <div className="text-[20px] font-extrabold">{n}</div><div className="text-[14px] text-muted">{who}</div><div className="text-[28px] font-extrabold">{price}</div>
              <ul className="flex flex-col gap-2">{(feats as string[]).map((f) => <li key={f} className="flex gap-2 text-[14px]"><span className="text-brand-600"><Icon name="check" size={16} strokeWidth={2.2} /></span>{f}</li>)}</ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto flex max-w-[1200px] flex-col items-center gap-5 px-6 py-20 text-center">
        <h2 className="max-w-[700px] text-[34px] font-extrabold tracking-[-0.6px] sm:text-[40px]">Help for your business, whenever you need it.</h2>
        <ButtonLink to="/signup" size="lg">Get started free</ButtonLink>
      </section>

      <footer className="bg-ink text-[#c9d3ce]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-8 px-6 py-12">
          <Logo inverted />
          <nav aria-label="Footer" className="flex flex-wrap gap-6 text-[14px]"><Link to="/legal/privacy">Privacy</Link><Link to="/legal/terms">Terms</Link><a href="mailto:hello@codingwizards.co.za">Contact</a></nav>
          <div className="text-[14px]">A Coding Wizards product</div>
        </div>
      </footer>
    </div>
  );
}
