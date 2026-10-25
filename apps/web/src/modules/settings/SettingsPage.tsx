import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  DEFAULT_SCHEDULE, INDUSTRIES, isEnabled, MODULES, OPTIONAL_MODULES, PROVINCES, ROLES_AT_BUSINESS, SIZES, ok,
  type BusinessProfile, type ModuleId,
} from "@thuso/core";
import { logOut } from "../../adapters/auth";
import { uc } from "../../app/container";
import { useWorkspace } from "../../app/session";
import { whatsappLink } from "../../lib/format";
import { useAction, useFeedback } from "../../ui/feedback";
import { Alert, Button, Card, Checkbox, cn, Field, Input, PageHeader, Pill, Select, Tabs, Textarea } from "../../ui/kit";
import { ScheduleEditor } from "./ScheduleEditor";

type Tab = "business" | "invoices" | "hours" | "tools" | "booking-page" | "account";

export default function SettingsPage() {
  const { role } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "business";
  const canManage = role === "owner" || role === "admin";
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[
        { id: "business", label: "Business" }, { id: "invoices", label: "Invoices" }, { id: "hours", label: "Working hours" },
        { id: "tools", label: "Tools" }, { id: "booking-page", label: "Booking page" }, { id: "account", label: "Account" },
      ]} />
      {!canManage && tab !== "account" && tab !== "booking-page" && <div className="mb-4"><Alert tone="blue">Only the owner or an admin can change these settings.</Alert></div>}
      {tab === "business" && <BusinessTab />}
      {tab === "invoices" && <InvoiceTab />}
      {tab === "hours" && <HoursTab />}
      {tab === "tools" && <ToolsTab />}
      {tab === "booking-page" && <BookingPageTab />}
      {tab === "account" && <AccountTab />}
    </>
  );
}

function SaveBar({ busy, onSave, error }: { busy: boolean; onSave: () => void; error: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      <div><Button onClick={onSave} loading={busy}>Save changes</Button></div>
    </div>
  );
}

function BusinessTab() {
  const { business: b, bizId, actor, role } = useWorkspace();
  const { toast } = useFeedback();
  const a = useAction();
  const [p, setP] = useState<BusinessProfile>({ name: b.name, industry: b.industry, size: b.size, province: b.province, town: b.town, ownerRole: b.ownerRole });
  const save = async () => { if (await a.run(() => uc.workspace.updateProfile(bizId, actor, role, { profile: p }))) toast("Saved"); };
  return (
    <Card className="flex max-w-2xl flex-col gap-4 p-5">
      <Field label="Business name" htmlFor="st-name" error={a.fieldError("name")}><Input id="st-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What the business does" htmlFor="st-ind"><Select id="st-ind" value={p.industry} onChange={(e) => setP({ ...p, industry: e.target.value as BusinessProfile["industry"] })}>{INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select></Field>
        <Field label="People in the business" htmlFor="st-size"><Select id="st-size" value={p.size} onChange={(e) => setP({ ...p, size: e.target.value as BusinessProfile["size"] })}>{SIZES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select></Field>
        <Field label="Province" htmlFor="st-prov"><Select id="st-prov" value={p.province} onChange={(e) => setP({ ...p, province: e.target.value as BusinessProfile["province"] })}>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Town or city" htmlFor="st-town" error={a.fieldError("town")}><Input id="st-town" value={p.town} onChange={(e) => setP({ ...p, town: e.target.value })} /></Field>
        <Field label="Your role" htmlFor="st-role"><Select id="st-role" value={p.ownerRole} onChange={(e) => setP({ ...p, ownerRole: e.target.value })}>{ROLES_AT_BUSINESS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
      </div>
      <SaveBar busy={a.busy} onSave={save} error={a.formError(["name", "town"])} />
    </Card>
  );
}

function InvoiceTab() {
  const { business: b, bizId, actor, role } = useWorkspace();
  const { toast } = useFeedback();
  const a = useAction();
  const [f, setF] = useState({
    contactPhone: b.contactPhone, contactEmail: b.contactEmail, bankDetails: b.bankDetails, invoiceTerms: b.invoiceTerms,
    paymentTermsDays: String(b.paymentTermsDays), vatRegistered: b.vatRegistered, vatNumber: b.vatNumber,
  });
  const save = async () => {
    if (await a.run(() => uc.workspace.updateProfile(bizId, actor, role, { ...f, paymentTermsDays: Number(f.paymentTermsDays) }))) toast("Saved");
  };
  return (
    <Card className="flex max-w-2xl flex-col gap-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone on invoices" htmlFor="iv-phone"><Input id="iv-phone" type="tel" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} placeholder="082 123 4567" /></Field>
        <Field label="Email on invoices" htmlFor="iv-email"><Input id="iv-email" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
      </div>
      <Field label="Banking details for EFT" htmlFor="iv-bank" hint="Bank, account name, account number and branch code. Shown on every invoice.">
        <Textarea id="iv-bank" value={f.bankDetails} onChange={(e) => setF({ ...f, bankDetails: e.target.value })} placeholder={"FNB\nNdou Studio\nAcc 123 456 7890\nBranch 250655"} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment due after" htmlFor="iv-terms" error={a.fieldError("paymentTermsDays")}>
          <Select id="iv-terms" value={f.paymentTermsDays} onChange={(e) => setF({ ...f, paymentTermsDays: e.target.value })}>
            {[0, 3, 7, 14, 30, 60].map((d) => <option key={d} value={d}>{d === 0 ? "On receipt" : `${d} days`}</option>)}
          </Select>
        </Field>
      </div>
      <Checkbox checked={f.vatRegistered} onChange={(v) => setF({ ...f, vatRegistered: v })} label="My business is registered for VAT" detail="THUSO adds 15% VAT to new invoices and calls them tax invoices." />
      {f.vatRegistered && <Field label="VAT number" htmlFor="iv-vat" error={a.fieldError("vatNumber")}><Input id="iv-vat" inputMode="numeric" value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} placeholder="4xxxxxxxxx" /></Field>}
      <Field label="Default note on invoices" htmlFor="iv-note" optional><Textarea id="iv-note" value={f.invoiceTerms} onChange={(e) => setF({ ...f, invoiceTerms: e.target.value })} placeholder="Thank you for your business!" className="min-h-[72px]" /></Field>
      <SaveBar busy={a.busy} onSave={save} error={a.formError(["paymentTermsDays", "vatNumber"])} />
    </Card>
  );
}

function HoursTab() {
  const { business: b, bizId, actor, role } = useWorkspace();
  const { toast } = useFeedback();
  const a = useAction();
  const [s, setS] = useState(b.schedule ?? DEFAULT_SCHEDULE);
  const save = async () => { if (await a.run(() => uc.workspace.saveSchedule(bizId, actor, role, s))) toast("Working hours saved"); };
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {!b.schedule && <Alert tone="amber">You have not set working hours yet, so customers cannot book online.</Alert>}
      <ScheduleEditor value={s} onChange={setS} error={a.error?.message} />
      <div><Button onClick={save} loading={a.busy}>Save working hours</Button></div>
    </div>
  );
}

function ToolsTab() {
  const { business: b, bizId, actor, role } = useWorkspace();
  const { confirm } = useFeedback();
  const [want, setWant] = useState<ModuleId[]>([...b.enabledModules]);
  useEffect(() => setWant([...b.enabledModules]), [b.enabledModules]);
  const changed = want.length !== b.enabledModules.length || want.some((m) => !b.enabledModules.includes(m));
  const apply = () => confirm({
    title: "Change your tools", confirmLabel: "Apply", done: "Tools updated",
    preview: async () => ok(uc.workspace.previewModules(b, want)),
    execute: () => uc.workspace.chooseModules(bizId, actor, role, want, false),
  });
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {OPTIONAL_MODULES.map((id) => {
        const m = MODULES[id];
        const on = want.includes(id);
        return (
          <Card key={id} className={cn("flex items-center gap-4 p-4", on && "border-brand-600", !m.available && "opacity-70")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[16px] font-extrabold">{m.name}</span>
                {!m.available && <Pill tone="blue">Coming soon</Pill>}
                {m.available && isEnabled(b.enabledModules, id) && <Pill tone="green">On</Pill>}</div>
              <p className="mt-1 text-[14px] text-muted">{m.summary}</p>
            </div>
            {m.available && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-bold">
                <input type="checkbox" checked={on} onChange={() => setWant(on ? want.filter((x) => x !== id) : [...want, id])} className="h-5 w-5 accent-brand-600" />{on ? "On" : "Off"}
              </label>
            )}
          </Card>
        );
      })}
      <p className="text-[13px] text-muted">Customers and Ask THUSO are always on. Switching a tool off keeps its data.</p>
      <div><Button onClick={apply} disabled={!changed}>Review changes</Button></div>
    </div>
  );
}

function BookingPageTab() {
  const { business: b } = useWorkspace();
  const { toast } = useFeedback();
  const url = `${location.origin}/b/${b.slug}`;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#14201C" } }).then(setQr).catch(() => setQr(null)); }, [url]);
  const bookingsOn = isEnabled(b.enabledModules, "bookings");
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {!bookingsOn && <Alert tone="amber">Bookings are switched off. Switch them on under Tools to take online bookings.</Alert>}
      {bookingsOn && !b.schedule && <Alert tone="amber">Add your working hours first. Until then the page tells customers you are not taking online bookings.</Alert>}
      <Card className="flex flex-col gap-5 p-5 sm:flex-row">
        {qr && <img src={qr} alt={`QR code for ${url}`} className="h-44 w-44 rounded-xl border border-line" />}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="text-[13px] font-bold text-muted">Your booking page</div>
          <div className="break-all text-[16px] font-extrabold">{url}</div>
          <p className="text-[14px] text-muted">Share it in your WhatsApp status, on social media, or print the QR code for your counter.</p>
          <div className="flex flex-wrap gap-2.5">
            <Button icon="copy" variant="secondary" onClick={() => navigator.clipboard.writeText(url).then(() => toast("Link copied"))}>Copy link</Button>
            <a className="inline-flex h-12 items-center gap-2 rounded-[10px] border-[1.5px] border-line-strong bg-surface px-5 text-[15px] font-bold" target="_blank" rel="noreferrer"
              href={whatsappLink("", `Book with ${b.name} online: ${url}`)}>Share on WhatsApp</a>
            <a className="inline-flex h-12 items-center gap-2 rounded-[10px] px-5 text-[15px] font-bold text-brand-600" href={url} target="_blank" rel="noreferrer">Open page</a>
            {qr && <a className="inline-flex h-12 items-center gap-2 rounded-[10px] px-5 text-[15px] font-bold text-brand-600" href={qr} download={`${b.slug}-booking-qr.png`}>Download QR</a>}
          </div>
        </div>
      </Card>
    </div>
  );
}

function AccountTab() {
  const { user, role, business } = useWorkspace();
  const nav = useNavigate();
  return (
    <Card className="flex max-w-2xl flex-col gap-3 p-5 text-[14px]">
      <div><span className="text-muted">Signed in as</span> <strong>{user.email}</strong></div>
      <div><span className="text-muted">Your role at {business.name}:</span> <strong className="capitalize">{role}</strong></div>
      <div><span className="text-muted">Plan:</span> <strong className="capitalize">{business.plan}</strong> <span className="text-muted">(paid plans arrive with billing)</span></div>
      <div className="pt-2"><Button variant="secondary" icon="logout" onClick={() => logOut().then(() => nav("/"))}>Sign out</Button></div>
    </Card>
  );
}
