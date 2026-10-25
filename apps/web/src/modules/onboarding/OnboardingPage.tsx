import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_SCHEDULE, GOALS, INDUSTRIES, MODULES, ONBOARDING_STEPS, OPTIONAL_MODULES, OPTIONAL_STEPS, PROFESSIONAL_CATEGORIES,
  PROVINCES, ROLES_AT_BUSINESS, SIZES, suggestModules, CORE_MODULES,
  type BusinessProfile, type GoalId, type ModuleId, type OnboardingStep, type ProfessionalCategoryId,
} from "@thuso/core";
import { uc } from "../../app/container";
import { useSession } from "../../app/session";
import { useAction } from "../../ui/feedback";
import { Icon, type IconName } from "../../ui/icons";
import { Alert, Button, ButtonLink, Card, Chip, cn, Field, Input, Logo, PageSpinner, Pill, Select, Textarea } from "../../ui/kit";
import { ScheduleEditor } from "../settings/ScheduleEditor";

const STEP_LABEL: Record<OnboardingStep, string> = {
  profile: "Business profile", goals: "Your goals", modules: "Choose tools", professionals: "Professionals", hours: "Working hours",
};
const GOAL_ICON: Record<GoalId, IconName> = {
  get_paid: "cash", bookings: "calendar", stock: "box", compliance: "shield", professionals: "briefcase", customers: "users", team: "team", exploring: "eye",
};
const MODULE_ICON: Record<ModuleId, IconName> = {
  customers: "users", assistant: "spark", bookings: "calendar", invoicing: "invoice", stock: "box", compliance: "shield", professionals: "briefcase",
};
const PRO_ICON: Record<ProfessionalCategoryId, IconName> = { accounting: "invoice", legal: "shield", consulting: "spark", marketing: "chat", it: "settings", hr: "users" };

export default function OnboardingPage() {
  const { step: raw } = useParams();
  const s = useSession();
  const step = (ONBOARDING_STEPS as readonly string[]).includes(raw ?? "") ? (raw as OnboardingStep) : null;
  if (!s.businessReady) return <PageSpinner />;
  if (!step) return <Navigate to="/onboarding/profile" replace />;
  const b = s.business;
  // Without a business only the first step exists. With one, do not skip ahead of the wizard.
  if (!b && step !== "profile") return <Navigate to="/onboarding/profile" replace />;
  if (b && b.onboarding.next !== "done" && ONBOARDING_STEPS.indexOf(step) > ONBOARDING_STEPS.indexOf(b.onboarding.next)) {
    return <Navigate to={`/onboarding/${b.onboarding.next}`} replace />;
  }
  return <StepScreen key={step} step={step} />;
}

function Layout({ step, title, subtitle, children, footer }: { step: OnboardingStep; title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const s = useSession();
  const n = ONBOARDING_STEPS.indexOf(step);
  const doneUpTo = s.business ? (s.business.onboarding.next === "done" ? 5 : ONBOARDING_STEPS.indexOf(s.business.onboarding.next)) : 0;
  const optional = OPTIONAL_STEPS.includes(step);
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface px-6 py-5 lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
        <div className="flex items-center justify-between lg:block"><Logo />
          <span className="text-[13px] font-bold text-muted lg:hidden">Step {n + 1} of 5</span>
        </div>
        <div className="mt-9 hidden lg:block">
          <div className="mb-4 text-[13px] font-bold text-muted">Step {n + 1} of 5</div>
          <ol className="flex flex-col gap-[18px]">
            {ONBOARDING_STEPS.map((st, i) => {
              const state = i < doneUpTo && i !== n ? "done" : i === n ? "current" : "todo";
              return (
                <li key={st} className={cn("flex items-center gap-3 text-[15px]", state === "current" ? "font-extrabold text-brand-600" : state === "done" ? "font-semibold text-ink" : "font-semibold text-muted")}>
                  <span className={cn("grid h-7 w-7 place-items-center rounded-full text-[13px] font-extrabold",
                    state === "done" ? "bg-brand-600 text-white" : state === "current" ? "border-2 border-brand-600" : "border-[1.5px] border-line-strong")}>
                    {state === "done" ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}
                  </span>
                  {STEP_LABEL[st]}
                  {OPTIONAL_STEPS.includes(st) && <Pill tone="amber">Optional</Pill>}
                </li>
              );
            })}
          </ol>
          <p className="mt-10 text-[13px] leading-relaxed text-muted">You can change any of this later in Settings.</p>
        </div>
      </aside>
      <main className="flex flex-1 flex-col px-5 py-8 sm:px-10 lg:px-14 lg:py-12">
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-7">
          <div className="flex flex-col gap-2">
            {optional && <span className="self-start"><Pill tone="amber">Optional</Pill></span>}
            <h1 className="text-[30px] font-extrabold tracking-[-0.4px] sm:text-[32px]">{title}</h1>
            <p className="text-[16px] leading-relaxed text-muted">{subtitle}</p>
          </div>
          <div className="flex flex-col gap-6">{children}</div>
          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-5">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function StepScreen({ step }: { step: OnboardingStep }) {
  switch (step) {
    case "profile": return <ProfileStep />;
    case "goals": return <GoalsStep />;
    case "modules": return <ModulesStep />;
    case "professionals": return <ProfessionalsStep />;
    case "hours": return <HoursStep />;
  }
}

function useGo() {
  const nav = useNavigate();
  return (to: OnboardingStep | "app") => nav(to === "app" ? "/app" : `/onboarding/${to}`);
}

function BackButton({ to }: { to: OnboardingStep }) {
  return <ButtonLink to={`/onboarding/${to}`} variant="secondary">Back</ButtonLink>;
}

// ---------------------------------------------------------------- 1. profile

function ProfileStep() {
  const s = useSession();
  const go = useGo();
  const a = useAction();
  const b = s.business;
  const [p, setP] = useState<BusinessProfile>(() => b
    ? { name: b.name, industry: b.industry, size: b.size, province: b.province, town: b.town, ownerRole: b.ownerRole }
    : { name: "", industry: "" as BusinessProfile["industry"], size: "" as BusinessProfile["size"], province: "Limpopo", town: "", ownerRole: ROLES_AT_BUSINESS[0] });

  async function next() {
    const ok = b
      ? await a.run(() => uc.workspace.updateProfile(b.id, s.actor, s.role, { profile: p }))
      : await a.run(() => uc.workspace.createBusiness({ actor: s.actor, email: s.user?.email ?? "", profile: p }));
    if (ok) go(b && b.onboarding.next !== "goals" ? (b.onboarding.next === "done" ? "app" : b.onboarding.next) : "goals");
  }

  return (
    <Layout step="profile" title="Tell us about your business" subtitle="This helps THUSO show the right tools and reminders. It takes about a minute."
      footer={<><div className="flex-1" /><Button onClick={next} loading={a.busy}>Continue</Button></>}>
      <Field label="Business name" htmlFor="ob-name" error={a.fieldError("name")}>
        <Input id="ob-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Ndou Hair Studio" autoFocus />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-bold">What does your business do?</legend>
        <div className="flex flex-wrap gap-2.5">
          {INDUSTRIES.map((i) => <Chip key={i.id} selected={p.industry === i.id} onClick={() => setP({ ...p, industry: i.id })}>{i.label}</Chip>)}
        </div>
        {a.fieldError("industry") && <p className="text-[13px] font-semibold text-danger-600">{a.fieldError("industry")}</p>}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-bold">How many people work in the business?</legend>
        <div className="flex flex-wrap gap-2.5">
          {SIZES.map((i) => <Chip key={i.id} selected={p.size === i.id} onClick={() => setP({ ...p, size: i.id })}>{i.label}</Chip>)}
        </div>
        {a.fieldError("size") && <p className="text-[13px] font-semibold text-danger-600">{a.fieldError("size")}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Province" htmlFor="ob-prov" error={a.fieldError("province")}>
          <Select id="ob-prov" value={p.province} onChange={(e) => setP({ ...p, province: e.target.value as BusinessProfile["province"] })}>
            {PROVINCES.map((x) => <option key={x}>{x}</option>)}
          </Select>
        </Field>
        <Field label="Town or city" htmlFor="ob-town" error={a.fieldError("town")}>
          <Input id="ob-town" value={p.town} onChange={(e) => setP({ ...p, town: e.target.value })} placeholder="e.g. Thohoyandou" />
        </Field>
        <Field label="Your role" htmlFor="ob-role">
          <Select id="ob-role" value={p.ownerRole} onChange={(e) => setP({ ...p, ownerRole: e.target.value })}>
            {ROLES_AT_BUSINESS.map((x) => <option key={x}>{x}</option>)}
          </Select>
        </Field>
      </div>
      {a.formError(["name", "industry", "size", "province", "town"]) && <Alert>{a.formError(["name", "industry", "size", "province", "town"])}</Alert>}
    </Layout>
  );
}

// ---------------------------------------------------------------- 2. goals

function GoalsStep() {
  const s = useSession();
  const go = useGo();
  const a = useAction();
  const b = s.business!;
  const [goals, setGoals] = useState<GoalId[]>([...b.goals]);
  const [note, setNote] = useState(b.goalNote);
  const toggle = (g: GoalId) => setGoals((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]));

  async function next() {
    if (await a.run(() => uc.workspace.saveGoals(b.id, s.actor, goals, note))) go(b.onboarding.next === "done" ? "app" : "modules");
  }

  return (
    <Layout step="goals" title="What brings you to THUSO?" subtitle="Choose all that apply. We will switch on the tools that match."
      footer={<><BackButton to="profile" /><div className="flex-1" /><Button onClick={next} loading={a.busy}>Continue</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {GOALS.map((g) => {
          const on = goals.includes(g.id);
          return (
            <label key={g.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] bg-surface p-4", on ? "border-brand-600 bg-brand-50" : "border-line hover:border-line-strong")}>
              <input type="checkbox" checked={on} onChange={() => toggle(g.id)} className="mt-1 h-[18px] w-[18px] shrink-0 accent-brand-600" />
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-600"><Icon name={GOAL_ICON[g.id]} size={18} /></span>
              <span><span className="block text-[15px] font-extrabold">{g.label}</span><span className="mt-0.5 block text-[13px] leading-snug text-muted">{g.detail}</span></span>
            </label>
          );
        })}
      </div>
      <Field label="Anything else?" htmlFor="ob-note" optional error={a.fieldError("goals")}>
        <Textarea id="ob-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us in your own words" className="min-h-[72px]" />
      </Field>
    </Layout>
  );
}

// ---------------------------------------------------------------- 3. modules

function ModulesStep() {
  const s = useSession();
  const go = useGo();
  const a = useAction();
  const b = s.business!;
  const firstTime = b.onboarding.next === "modules";
  const suggested = suggestModules(b.goals);
  const [on, setOn] = useState<ModuleId[]>(() => (firstTime ? suggested : b.enabledModules.filter((m) => !CORE_MODULES.includes(m as never))));

  async function next() {
    if (await a.run(() => uc.workspace.chooseModules(b.id, s.actor, s.role, on, true))) go(b.onboarding.next === "done" ? "app" : "professionals");
  }

  return (
    <Layout step="modules" title="Choose your tools" subtitle="We switched on tools that match your goals. Change anything now or later in Settings."
      footer={<><BackButton to="goals" /><div className="flex-1" /><Button onClick={next} loading={a.busy}>Continue</Button></>}>
      <div className="flex flex-col gap-3">
        {OPTIONAL_MODULES.map((id) => {
          const m = MODULES[id];
          const checked = on.includes(id);
          return (
            <Card key={id} className={cn("flex items-center gap-4 p-4", checked && "border-brand-600", !m.available && "opacity-70")}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-600"><Icon name={MODULE_ICON[id]} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-extrabold">{m.name}</span>
                  {m.available && suggested.includes(id) && <Pill tone="green">Matches your goals</Pill>}
                  {!m.available && <Pill tone="blue">Coming soon</Pill>}
                </div>
                <p className="mt-1 text-[14px] leading-snug text-muted">{m.summary}</p>
              </div>
              {m.available ? (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px] font-bold">
                  <input type="checkbox" checked={checked} onChange={() => setOn((x) => (checked ? x.filter((y) => y !== id) : [...x, id]))} className="h-5 w-5 accent-brand-600" />
                  {checked ? "On" : "Off"}
                </label>
              ) : <span className="text-[13px] font-semibold text-muted">Soon</span>}
            </Card>
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="text-[13px] font-bold">Always included</div>
        <div className="flex flex-wrap gap-2">{["Home", ...CORE_MODULES.map((c) => MODULES[c].name)].map((x) => <Pill key={x}>{x}</Pill>)}</div>
      </div>
      {a.formError() && <Alert>{a.formError()}</Alert>}
    </Layout>
  );
}

// ---------------------------------------------------------------- 4. professionals (optional)

function ProfessionalsStep() {
  const s = useSession();
  const go = useGo();
  const a = useAction();
  const b = s.business!;
  const [cats, setCats] = useState<ProfessionalCategoryId[]>([...b.professionalInterests]);
  const after = b.onboarding.next === "done" ? "app" : "hours";

  return (
    <Layout step="professionals" title="Would you like help from a professional?" subtitle="Pick the kinds of help you might need. Nothing is booked or shared yet."
      footer={<>
        <BackButton to="modules" /><div className="flex-1" />
        <Button variant="ghost" loading={a.busy} onClick={async () => { if (await a.run(() => uc.workspace.skip(b.id, s.actor, "professionals"))) go(after); }}>Skip for now</Button>
        <Button loading={a.busy} onClick={async () => { if (await a.run(() => uc.workspace.saveProfessionalInterests(b.id, s.actor, cats))) go(after); }}>Continue</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROFESSIONAL_CATEGORIES.map((c) => {
          const on = cats.includes(c.id);
          return (
            <label key={c.id} className={cn("flex cursor-pointer flex-col gap-2.5 rounded-xl border-[1.5px] bg-surface p-4", on ? "border-brand-600 bg-brand-50" : "border-line hover:border-line-strong")}>
              <span className="flex justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-brand-50 text-brand-600"><Icon name={PRO_ICON[c.id]} /></span>
                <input type="checkbox" checked={on} onChange={() => setCats((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))} className="h-[18px] w-[18px] accent-brand-600" />
              </span>
              <span className="text-[16px] font-extrabold">{c.label}</span>
              <span className="text-[13px] leading-snug text-muted">{c.detail}</span>
            </label>
          );
        })}
      </div>
      <Card className="flex items-start gap-3 p-4">
        <span className="text-brand-600"><Icon name="lock" /></span>
        <p className="text-[14px] leading-relaxed text-muted">The professionals network is coming soon. We will suggest verified people near you, and they only see what you choose to share.</p>
      </Card>
      {a.formError() && <Alert>{a.formError()}</Alert>}
    </Layout>
  );
}

// ---------------------------------------------------------------- 5. working hours (optional)

function HoursStep() {
  const s = useSession();
  const go = useGo();
  const a = useAction();
  const b = s.business!;
  const [schedule, setSchedule] = useState(b.schedule ?? DEFAULT_SCHEDULE);
  useEffect(() => { if (b.schedule) setSchedule(b.schedule); }, [b.schedule]);

  return (
    <Layout step="hours" title="When are you open?" subtitle="Customers can only book inside these hours. You can add this later if you prefer."
      footer={<>
        <BackButton to="professionals" /><div className="flex-1" />
        <Button variant="ghost" loading={a.busy} onClick={async () => { if (await a.run(() => uc.workspace.skip(b.id, s.actor, "hours"))) go("app"); }}>Skip for now</Button>
        <Button loading={a.busy} onClick={async () => { if (await a.run(() => uc.workspace.saveSchedule(b.id, s.actor, s.role, schedule))) go("app"); }}>Finish setup</Button>
      </>}>
      <ScheduleEditor value={schedule} onChange={setSchedule} error={a.error?.message} />
    </Layout>
  );
}
