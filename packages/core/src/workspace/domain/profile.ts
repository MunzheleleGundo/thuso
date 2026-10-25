import type { ModuleId } from "./modules";

export const INDUSTRIES = [
  { id: "beauty", label: "Beauty and wellness" },
  { id: "food", label: "Food and catering" },
  { id: "retail", label: "Shop or retail" },
  { id: "trades", label: "Trades and repairs" },
  { id: "education", label: "Education and tutoring" },
  { id: "professional", label: "Professional services" },
  { id: "health", label: "Health" },
  { id: "other", label: "Other" },
] as const;
export type IndustryId = (typeof INDUSTRIES)[number]["id"];

export const SIZES = [
  { id: "solo", label: "Just me" },
  { id: "2-10", label: "2 to 10" },
  { id: "11-50", label: "11 to 50" },
  { id: "51-200", label: "51 to 200" },
  { id: "200+", label: "More than 200" },
] as const;
export type SizeId = (typeof SIZES)[number]["id"];

export const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "North West", "Northern Cape", "Western Cape",
] as const;
export type Province = (typeof PROVINCES)[number];

export const ROLES_AT_BUSINESS = ["Owner or founder", "Manager", "Employee", "Accountant or advisor"] as const;

export const GOALS = [
  { id: "get_paid", label: "Get paid faster", detail: "Invoices with payment links and reminders", modules: ["invoicing"] },
  { id: "bookings", label: "Manage bookings", detail: "Appointments, deposits and fewer no-shows", modules: ["bookings"] },
  { id: "stock", label: "Keep track of stock", detail: "Know what you have and when to reorder", modules: ["stock"] },
  { id: "compliance", label: "Stay compliant", detail: "Registration, tax and labour deadlines", modules: ["compliance"] },
  { id: "professionals", label: "Get help from professionals", detail: "Accountants, lawyers and consultants", modules: ["professionals"] },
  { id: "customers", label: "Organise my customers", detail: "One place for every client and their history", modules: [] },
  { id: "team", label: "Run my team", detail: "Give staff the right access", modules: [] },
  { id: "exploring", label: "Just exploring", detail: "Show me around first", modules: ["invoicing"] },
] as const satisfies readonly { id: string; label: string; detail: string; modules: readonly ModuleId[] }[];
export type GoalId = (typeof GOALS)[number]["id"];

export const isGoalId = (v: unknown): v is GoalId => GOALS.some((g) => g.id === v);
export const isIndustryId = (v: unknown): v is IndustryId => INDUSTRIES.some((i) => i.id === v);
export const isSizeId = (v: unknown): v is SizeId => SIZES.some((s) => s.id === v);

/** Modules THUSO suggests for a set of goals. A suggestion only: the user's choice always wins. */
export function suggestModules(goals: readonly GoalId[]): ModuleId[] {
  const out = new Set<ModuleId>();
  for (const g of goals) for (const m of GOALS.find((x) => x.id === g)?.modules ?? []) out.add(m);
  return [...out];
}

export const PROFESSIONAL_CATEGORIES = [
  { id: "accounting", label: "Accountant or bookkeeper", detail: "Tax, VAT, annual returns, books" },
  { id: "legal", label: "Lawyer", detail: "Contracts, registration, disputes" },
  { id: "consulting", label: "Business consultant", detail: "Growth, pricing, planning" },
  { id: "marketing", label: "Marketing", detail: "Social media, branding, ads" },
  { id: "it", label: "IT and website", detail: "Websites, devices, systems" },
  { id: "hr", label: "HR and labour", detail: "Hiring, contracts, UIF" },
] as const;
export type ProfessionalCategoryId = (typeof PROFESSIONAL_CATEGORIES)[number]["id"];
