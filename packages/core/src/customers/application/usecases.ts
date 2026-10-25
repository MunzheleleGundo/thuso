import { audit } from "../../shared/audit";
import type { Actor, Clock, IdGenerator, Writer } from "../../shared/ports";
import { err, ok, type Result } from "../../shared/result";
import { buildCustomer, type Customer, type CustomerInput } from "../domain/customer";
import type { CustomerOp, CustomerReader } from "./ports";

export interface CustomerDeps {
  readonly customers: CustomerReader;
  readonly writer: Writer<CustomerOp>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export function makeCustomerUseCases(d: CustomerDeps) {
  return {
    /** Adds a customer. If the phone or email already belongs to someone, returns "duplicate" with that customer. */
    async add(bizId: string, actor: Actor, input: CustomerInput): Promise<Result<Customer>> {
      const built = buildCustomer(d.ids.next(), input, d.clock.now(), "owner");
      if (!built.ok) return built;
      const existing = await d.customers.findByContact(bizId, { phone: built.value.phone || undefined, email: built.value.email || undefined });
      if (existing && !existing.archived) {
        return err("duplicate", `${existing.name} already has this ${existing.phone === built.value.phone ? "phone number" : "email"}.`, { details: { customerId: existing.id } });
      }
      await d.writer.commit(bizId, [{ kind: "customer.save", customer: built.value }, audit(d.ids.next(), d.clock.now(), actor, "customer.added", `Added customer ${built.value.name}`, { customerId: built.value.id })]);
      return ok(built.value);
    },

    async update(bizId: string, actor: Actor, id: string, input: CustomerInput): Promise<Result<Customer>> {
      const existing = await d.customers.get(bizId, id);
      if (!existing) return err("not_found", "We could not find this customer.");
      const built = buildCustomer(id, input, d.clock.now(), existing.source, existing);
      if (!built.ok) return built;
      const clash = await d.customers.findByContact(bizId, { phone: built.value.phone || undefined, email: built.value.email || undefined });
      if (clash && clash.id !== id && !clash.archived) return err("duplicate", `${clash.name} already uses this contact detail.`, { details: { customerId: clash.id } });
      await d.writer.commit(bizId, [{ kind: "customer.save", customer: built.value }, audit(d.ids.next(), d.clock.now(), actor, "customer.updated", `Updated customer ${built.value.name}`, { customerId: id })]);
      return ok(built.value);
    },

    async setArchived(bizId: string, actor: Actor, id: string, archived: boolean): Promise<Result<Customer>> {
      const existing = await d.customers.get(bizId, id);
      if (!existing) return err("not_found", "We could not find this customer.");
      const next = { ...existing, archived };
      await d.writer.commit(bizId, [{ kind: "customer.save", customer: next }, audit(d.ids.next(), d.clock.now(), actor, archived ? "customer.archived" : "customer.restored", `${archived ? "Archived" : "Restored"} ${existing.name}`, { customerId: id })]);
      return ok(next);
    },
  };
}

/**
 * Used by the public booking page: find the customer by phone or email, or create them.
 * Pure planning step so the server can run it inside a transaction.
 */
export function upsertCustomerFromBooking(existing: Customer | null, id: string, input: CustomerInput, now: number): Result<Customer> {
  if (existing) {
    return buildCustomer(existing.id, {
      name: existing.name,
      phone: input.phone || existing.phone,
      email: input.email || existing.email,
      preferredChannel: existing.preferredChannel,
      consent: { whatsapp: existing.consent.whatsapp || !!input.consent?.whatsapp, sms: existing.consent.sms || !!input.consent?.sms, email: existing.consent.email || !!input.consent?.email },
    }, now, existing.source, { ...existing, archived: false });
  }
  return buildCustomer(id, input, now, "public");
}
