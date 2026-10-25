import { audit } from "../../shared/audit";
import { effect, type Preview } from "../../shared/effect";
import type { Actor, Clock, IdGenerator, Writer } from "../../shared/ports";
import { err, ok, type Result } from "../../shared/result";
import {
  baseSlug, canManage, newBusiness, setGoals, setModules, setProfessionalInterests, setSchedule, skipStep,
  type Business, type BusinessProfile, type OnboardingStep, type Role,
} from "../domain/business";
import { isOptionalModule, MODULES, normalizeModules, type ModuleId } from "../domain/modules";
import { PROFESSIONAL_CATEGORIES, type ProfessionalCategoryId } from "../domain/profile";
import { validateSchedule, type WorkingSchedule } from "../domain/schedule";
import type { BusinessReader, SlugRegistry, WorkspaceOp } from "./ports";

export interface WorkspaceDeps {
  readonly businesses: BusinessReader;
  readonly slugs: SlugRegistry;
  readonly writer: Writer<WorkspaceOp>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface SettingsPatch {
  readonly profile?: Partial<BusinessProfile>;
  readonly vatRegistered?: boolean;
  readonly vatNumber?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly bankDetails?: string;
  readonly invoiceTerms?: string;
  readonly paymentTermsDays?: number;
}

export function makeWorkspaceUseCases(d: WorkspaceDeps) {
  async function load(bizId: string): Promise<Result<Business>> {
    const b = await d.businesses.get(bizId);
    return b ? ok(b) : err("not_found", "We could not find this business.");
  }

  async function save(b: Business, actor: Actor, action: string, summary: string): Promise<Result<Business>> {
    await d.writer.commit(b.id, [{ kind: "business.save", business: b }, audit(d.ids.next(), d.clock.now(), actor, action, summary)]);
    return ok(b);
  }

  async function findSlug(name: string): Promise<string> {
    const base = baseSlug(name);
    for (let i = 1; i <= 25; i++) {
      const candidate = i === 1 ? base : `${base}-${i}`;
      if (await d.slugs.isAvailable(candidate)) return candidate;
    }
    return `${base}-${d.ids.next().slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  }

  return {
    /** Onboarding step 1. Creates the business, the owner membership and claims the public web address. */
    async createBusiness(cmd: { actor: Actor; email: string; profile: BusinessProfile }): Promise<Result<Business>> {
      const slug = await findSlug(cmd.profile.name);
      const id = d.ids.next();
      const now = d.clock.now();
      const created = newBusiness({ id, slug, ownerId: cmd.actor.uid, profile: cmd.profile, now, contactEmail: cmd.email });
      if (!created.ok) return created;
      await d.writer.commit(id, [
        { kind: "business.create", business: created.value, owner: { uid: cmd.actor.uid, role: "owner", name: cmd.actor.name, email: cmd.email, joinedAt: now } },
        audit(d.ids.next(), now, cmd.actor, "business.created", `Created ${created.value.name}`),
      ]);
      return created;
    },

    async updateProfile(bizId: string, actor: Actor, role: Role, patch: SettingsPatch): Promise<Result<Business>> {
      if (!canManage(role)) return err("forbidden", "Only the owner or an admin can change business settings.");
      const b = await load(bizId);
      if (!b.ok) return b;
      const profile = { ...b.value, ...patch.profile };
      const terms = patch.paymentTermsDays ?? b.value.paymentTermsDays;
      if (!Number.isInteger(terms) || terms < 0 || terms > 120) return err("validation", "Payment terms must be between 0 and 120 days.", { field: "paymentTermsDays" });
      const next: Business = {
        ...b.value,
        name: profile.name.trim(), industry: profile.industry, size: profile.size, province: profile.province,
        town: profile.town.trim(), ownerRole: profile.ownerRole,
        vatRegistered: patch.vatRegistered ?? b.value.vatRegistered,
        vatNumber: (patch.vatNumber ?? b.value.vatNumber).trim(),
        contactEmail: (patch.contactEmail ?? b.value.contactEmail).trim(),
        contactPhone: (patch.contactPhone ?? b.value.contactPhone).trim(),
        bankDetails: (patch.bankDetails ?? b.value.bankDetails).trim().slice(0, 500),
        invoiceTerms: (patch.invoiceTerms ?? b.value.invoiceTerms).trim().slice(0, 500),
        paymentTermsDays: terms,
      };
      if (next.name.length < 2) return err("validation", "Enter your business name.", { field: "name" });
      if (next.vatRegistered && !/^4\d{9}$/.test(next.vatNumber)) return err("validation", "A South African VAT number has 10 digits and starts with 4.", { field: "vatNumber" });
      return save(next, actor, "business.updated", "Updated business settings");
    },

    async saveGoals(bizId: string, actor: Actor, goals: readonly string[], note: string): Promise<Result<Business>> {
      const b = await load(bizId);
      if (!b.ok) return b;
      const next = setGoals(b.value, goals, note);
      return next.ok ? save(next.value, actor, "onboarding.goals", "Saved goals") : next;
    },

    /** Preview what switching modules on or off will do. Data of disabled modules is kept. */
    previewModules(current: Business, wanted: readonly string[]): Preview<ModuleId[]> {
      const next = normalizeModules(wanted);
      const effects = [];
      for (const m of next) if (!current.enabledModules.includes(m)) effects.push(effect("settings", `Switch on ${MODULES[m].name}`, MODULES[m].summary));
      for (const m of current.enabledModules) {
        if (!next.includes(m) && isOptionalModule(m)) {
          effects.push(effect("settings", `Switch off ${MODULES[m].name}`, "It disappears from your menu. Your data is kept and comes back if you switch it on again."));
        }
      }
      return { effects, draft: next };
    },

    async chooseModules(bizId: string, actor: Actor, role: Role, modules: readonly string[], fromOnboarding: boolean): Promise<Result<Business>> {
      if (!canManage(role)) return err("forbidden", "Only the owner or an admin can switch tools on or off.");
      const b = await load(bizId);
      if (!b.ok) return b;
      const next = setModules(b.value, modules, fromOnboarding);
      return save(next, actor, "modules.updated", `Tools: ${next.enabledModules.map((m) => MODULES[m].name).join(", ")}`);
    },

    async saveProfessionalInterests(bizId: string, actor: Actor, cats: readonly string[]): Promise<Result<Business>> {
      const valid = cats.filter((c): c is ProfessionalCategoryId => PROFESSIONAL_CATEGORIES.some((p) => p.id === c));
      const b = await load(bizId);
      if (!b.ok) return b;
      const next = setProfessionalInterests(b.value, valid);
      return save({ ...next, onboarding: { ...next.onboarding, skipped: next.onboarding.skipped.filter((s) => s !== "professionals") } },
        actor, "onboarding.professionals", "Saved professional interests");
    },

    async saveSchedule(bizId: string, actor: Actor, role: Role, schedule: WorkingSchedule): Promise<Result<Business>> {
      if (!canManage(role)) return err("forbidden", "Only the owner or an admin can change working hours.");
      const v = validateSchedule(schedule);
      if (!v.ok) return v;
      const b = await load(bizId);
      if (!b.ok) return b;
      return save(setSchedule(b.value, v.value), actor, "schedule.updated", "Updated working hours");
    },

    async skip(bizId: string, actor: Actor, step: OnboardingStep): Promise<Result<Business>> {
      const b = await load(bizId);
      if (!b.ok) return b;
      const next = skipStep(b.value, step);
      return next.ok ? save(next.value, actor, "onboarding.skipped", `Skipped ${step}`) : next;
    },

    async dismissChecklist(bizId: string, actor: Actor, dismissed: boolean): Promise<Result<Business>> {
      const b = await load(bizId);
      if (!b.ok) return b;
      return save({ ...b.value, onboarding: { ...b.value.onboarding, checklistDismissed: dismissed } }, actor, "checklist.toggled", dismissed ? "Hid setup checklist" : "Showed setup checklist");
    },
  };
}

export type WorkspaceUseCases = ReturnType<typeof makeWorkspaceUseCases>;
