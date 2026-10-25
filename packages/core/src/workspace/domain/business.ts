import { err, ok, type Result } from "../../shared/result";
import { nonEmpty, slugify } from "../../shared/text";
import { normalizeModules, type ModuleId } from "./modules";
import {
  isGoalId, isIndustryId, isSizeId, PROVINCES,
  type GoalId, type IndustryId, type ProfessionalCategoryId, type Province, type SizeId,
} from "./profile";
import type { WorkingSchedule } from "./schedule";

export type Role = "owner" | "admin" | "staff" | "viewer";
export const ROLES: readonly Role[] = ["owner", "admin", "staff", "viewer"];
export const canWrite = (r: Role) => r !== "viewer";
export const canManage = (r: Role) => r === "owner" || r === "admin";

export const ONBOARDING_STEPS = ["profile", "goals", "modules", "professionals", "hours"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const OPTIONAL_STEPS: readonly OnboardingStep[] = ["professionals", "hours"];

export interface OnboardingState {
  /** The next step to show. "done" once the wizard is finished (optional steps may still be skipped). */
  readonly next: OnboardingStep | "done";
  readonly skipped: readonly OnboardingStep[];
  readonly checklistDismissed: boolean;
}

export interface BusinessProfile {
  readonly name: string;
  readonly industry: IndustryId;
  readonly size: SizeId;
  readonly province: Province;
  readonly town: string;
  readonly ownerRole: string;
}

export interface Business extends BusinessProfile {
  readonly id: string;
  readonly slug: string;
  readonly ownerId: string;
  readonly goals: readonly GoalId[];
  readonly goalNote: string;
  readonly enabledModules: readonly ModuleId[];
  readonly professionalInterests: readonly ProfessionalCategoryId[];
  readonly schedule: WorkingSchedule | null;
  readonly utcOffsetMinutes: number;
  readonly currency: "ZAR";
  readonly vatRegistered: boolean;
  readonly vatNumber: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly bankDetails: string;
  readonly invoiceTerms: string;
  readonly paymentTermsDays: number;
  readonly plan: "free" | "starter" | "growth" | "enterprise";
  readonly onboarding: OnboardingState;
  readonly createdAt: number;
}

export interface Member {
  readonly uid: string;
  readonly role: Role;
  readonly name: string;
  readonly email: string;
  readonly joinedAt: number;
}

export const SA_OFFSET_MINUTES = 120;

export function validateProfile(p: BusinessProfile): Result<BusinessProfile> {
  const name = p.name.trim();
  if (!nonEmpty(name) || name.length < 2) return err("validation", "Enter your business name.", { field: "name" });
  if (name.length > 80) return err("validation", "Keep the business name under 80 characters.", { field: "name" });
  if (!isIndustryId(p.industry)) return err("validation", "Choose what your business does.", { field: "industry" });
  if (!isSizeId(p.size)) return err("validation", "Choose how many people work in the business.", { field: "size" });
  if (!PROVINCES.includes(p.province)) return err("validation", "Choose your province.", { field: "province" });
  if (!nonEmpty(p.town)) return err("validation", "Enter your town or city.", { field: "town" });
  if (!nonEmpty(p.ownerRole)) return err("validation", "Choose your role.", { field: "ownerRole" });
  return ok({ ...p, name, town: p.town.trim() });
}

export function baseSlug(name: string): string {
  return slugify(name) || "business";
}

export function newBusiness(args: {
  id: string; slug: string; ownerId: string; profile: BusinessProfile; now: number; contactEmail: string;
}): Result<Business> {
  const v = validateProfile(args.profile);
  if (!v.ok) return v;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(args.slug)) return err("validation", "That web address is not valid.");
  return ok({
    ...v.value,
    id: args.id,
    slug: args.slug,
    ownerId: args.ownerId,
    goals: [],
    goalNote: "",
    enabledModules: normalizeModules([]),
    professionalInterests: [],
    schedule: null,
    utcOffsetMinutes: SA_OFFSET_MINUTES,
    currency: "ZAR",
    vatRegistered: false,
    vatNumber: "",
    contactEmail: args.contactEmail,
    contactPhone: "",
    bankDetails: "",
    invoiceTerms: "",
    paymentTermsDays: 7,
    plan: "free",
    onboarding: { next: "goals", skipped: [], checklistDismissed: false },
    createdAt: args.now,
  });
}

export function setGoals(b: Business, goals: readonly string[], note: string): Result<Business> {
  const valid = goals.filter(isGoalId);
  if (valid.length === 0 && !nonEmpty(note)) return err("validation", "Choose at least one reason, or tell us in your own words.", { field: "goals" });
  return ok({ ...b, goals: valid, goalNote: note.trim().slice(0, 300), onboarding: advance(b.onboarding, "goals") });
}

export function setModules(b: Business, modules: readonly string[], fromOnboarding: boolean): Business {
  return {
    ...b,
    enabledModules: normalizeModules(modules),
    onboarding: fromOnboarding ? advance(b.onboarding, "modules") : b.onboarding,
  };
}

export function setProfessionalInterests(b: Business, cats: readonly ProfessionalCategoryId[]): Business {
  return { ...b, professionalInterests: [...new Set(cats)], onboarding: advance(b.onboarding, "professionals") };
}

export function setSchedule(b: Business, schedule: WorkingSchedule): Business {
  return { ...b, schedule, onboarding: { ...advance(b.onboarding, "hours"), skipped: b.onboarding.skipped.filter((s) => s !== "hours") } };
}

export function skipStep(b: Business, step: OnboardingStep): Result<Business> {
  if (!OPTIONAL_STEPS.includes(step)) return err("validation", "This step is required.");
  const skipped = b.onboarding.skipped.includes(step) ? b.onboarding.skipped : [...b.onboarding.skipped, step];
  return ok({ ...b, onboarding: { ...advance(b.onboarding, step), skipped } });
}

function advance(state: OnboardingState, completed: OnboardingStep): OnboardingState {
  const idx = ONBOARDING_STEPS.indexOf(completed);
  const currentIdx = state.next === "done" ? ONBOARDING_STEPS.length : ONBOARDING_STEPS.indexOf(state.next);
  // Editing an earlier step never moves the wizard backwards.
  const nextIdx = Math.max(idx + 1, currentIdx);
  return { ...state, next: nextIdx >= ONBOARDING_STEPS.length ? "done" : ONBOARDING_STEPS[nextIdx]! };
}

export function requiredOnboardingDone(b: Business): boolean {
  const next = b.onboarding.next;
  return next === "done" || OPTIONAL_STEPS.includes(next);
}
