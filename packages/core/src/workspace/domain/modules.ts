/**
 * The module registry. Core modules are always on. Optional modules are switched on per business.
 * `business.enabledModules` is the single source of truth, checked by the UI router,
 * by Firestore security rules and by Cloud Functions (the "module gate").
 */
export const CORE_MODULES = ["customers", "assistant"] as const;
export const OPTIONAL_MODULES = ["bookings", "invoicing", "stock", "compliance", "professionals"] as const;

export type CoreModuleId = (typeof CORE_MODULES)[number];
export type OptionalModuleId = (typeof OPTIONAL_MODULES)[number];
export type ModuleId = CoreModuleId | OptionalModuleId;

export interface ModuleInfo {
  readonly id: ModuleId;
  readonly name: string;
  readonly kind: "core" | "optional";
  /** False while a module is still being built. It can be shown but not switched on. */
  readonly available: boolean;
  readonly summary: string;
}

export const MODULES: Readonly<Record<ModuleId, ModuleInfo>> = {
  customers: { id: "customers", name: "Customers", kind: "core", available: true, summary: "One place for every client and their history." },
  assistant: { id: "assistant", name: "Ask THUSO", kind: "core", available: true, summary: "A business assistant that knows your data, and a general one for everything else." },
  bookings: { id: "bookings", name: "Bookings", kind: "optional", available: true, summary: "Services, a public booking page, deposits and fewer no-shows." },
  invoicing: { id: "invoicing", name: "Invoices and payments", kind: "optional", available: true, summary: "Quotes, invoices, payment links and payment tracking." },
  stock: { id: "stock", name: "Stock", kind: "optional", available: true, summary: "Items, quantities and low-stock alerts. Works offline." },
  compliance: { id: "compliance", name: "Compliance", kind: "optional", available: false, summary: "Registration, tax and labour deadlines as a plain to-do list." },
  professionals: { id: "professionals", name: "Professionals", kind: "optional", available: false, summary: "Find and work with verified accountants, lawyers and consultants." },
};

export const isModuleId = (v: unknown): v is ModuleId => typeof v === "string" && v in MODULES;
export const isOptionalModule = (id: ModuleId): id is OptionalModuleId => MODULES[id].kind === "optional";

/** Normalise any list into a valid module set: core modules always present, unavailable ones removed, no duplicates. */
export function normalizeModules(ids: readonly string[]): ModuleId[] {
  const set = new Set<ModuleId>(CORE_MODULES);
  for (const id of ids) if (isModuleId(id) && MODULES[id].available) set.add(id);
  return [...CORE_MODULES, ...OPTIONAL_MODULES].filter((m) => set.has(m));
}

export function isEnabled(enabled: readonly ModuleId[], id: ModuleId): boolean {
  return MODULES[id].kind === "core" || enabled.includes(id);
}
