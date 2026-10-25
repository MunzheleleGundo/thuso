import { err, ok, type Result } from "../../shared/result";
import { isEmail, nonEmpty, normalizePhone } from "../../shared/text";

export type Channel = "whatsapp" | "sms" | "email";
export const CHANNELS: readonly Channel[] = ["whatsapp", "sms", "email"];

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly phone: string; // E.164 or ""
  readonly email: string; // lower-case or ""
  readonly preferredChannel: Channel;
  /** POPIA: what the customer agreed to be contacted on. */
  readonly consent: Readonly<Record<Channel, boolean>>;
  readonly notes: string;
  readonly archived: boolean;
  readonly createdAt: number;
  readonly source: "owner" | "public" | "import";
}

export interface CustomerInput {
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  readonly preferredChannel?: Channel;
  readonly consent?: Partial<Record<Channel, boolean>>;
  readonly notes?: string;
}

export function buildCustomer(id: string, input: CustomerInput, now: number, source: Customer["source"], existing?: Customer): Result<Customer> {
  const name = input.name.trim();
  if (name.length < 2) return err("validation", "Enter the customer's name.", { field: "name" });
  if (name.length > 80) return err("validation", "Keep the name under 80 characters.", { field: "name" });
  let phone = "";
  if (nonEmpty(input.phone)) {
    const p = normalizePhone(input.phone);
    if (!p) return err("validation", "That phone number does not look right. Try 082 123 4567.", { field: "phone" });
    phone = p;
  }
  let email = "";
  if (nonEmpty(input.email)) {
    if (!isEmail(input.email)) return err("validation", "That email address does not look right.", { field: "email" });
    email = input.email.trim().toLowerCase();
  }
  if (!phone && !email) return err("validation", "Add a phone number or an email so you can reach this customer.", { field: "phone" });
  const preferred = input.preferredChannel ?? existing?.preferredChannel ?? (phone ? "whatsapp" : "email");
  if ((preferred === "whatsapp" || preferred === "sms") && !phone) return err("validation", "Add a phone number to use WhatsApp or SMS.", { field: "preferredChannel" });
  if (preferred === "email" && !email) return err("validation", "Add an email address to use email.", { field: "preferredChannel" });
  return ok({
    id,
    name,
    phone,
    email,
    preferredChannel: preferred,
    consent: {
      whatsapp: input.consent?.whatsapp ?? existing?.consent.whatsapp ?? false,
      sms: input.consent?.sms ?? existing?.consent.sms ?? false,
      email: input.consent?.email ?? existing?.consent.email ?? false,
    },
    notes: (input.notes ?? existing?.notes ?? "").trim().slice(0, 1000),
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? now,
    source: existing?.source ?? source,
  });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function matchesQuery(c: Customer, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const digits = s.replace(/\D/g, "");
  return c.name.toLowerCase().includes(s) || c.email.includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits.replace(/^0/, "")));
}
