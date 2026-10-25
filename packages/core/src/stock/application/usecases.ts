import { audit } from "../../shared/audit";
import { effect, type Effect, type Preview } from "../../shared/effect";
import type { Actor, Clock, IdGenerator, Writer } from "../../shared/ports";
import { err, ok, type Result } from "../../shared/result";
import { canWrite, type Role } from "../../workspace";
import { buildStockItem, MOVEMENT_REASONS, validateDelta, type MovementReason, type StockItem, type StockItemInput, type StockMovement } from "../domain/stock";
import type { StockOp, StockReader } from "./ports";

export interface StockDeps {
  readonly stock: StockReader;
  readonly writer: Writer<StockOp>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const fmtQty = (n: number, unit: string) => `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit === "each" ? "" : unit}`.trim();

/** Plan reducing stock for things sold or used. Shared by invoicing and bookings workflows. */
export function planStockUse(args: {
  items: ReadonlyMap<string, StockItem>; uses: readonly { itemId: string; quantity: number }[];
  reason: "sold" | "used"; refType: StockMovement["refType"]; refId: string; actor: Actor; now: number; nextId: () => string;
}): { ops: StockOp[]; effects: Effect[] } {
  const ops: StockOp[] = [];
  const effects: Effect[] = [];
  const merged = new Map<string, number>();
  for (const u of args.uses) merged.set(u.itemId, (merged.get(u.itemId) ?? 0) + u.quantity);
  for (const [itemId, qty] of merged) {
    const item = args.items.get(itemId);
    if (!item || item.archived || qty <= 0) continue;
    const after = item.quantity - qty;
    ops.push({ kind: "stock.move", movement: { id: args.nextId(), itemId, itemName: item.name, delta: -qty, reason: args.reason, refType: args.refType, refId: args.refId, note: "", at: args.now, by: args.actor.uid } });
    effects.push(effect("stock", `Update stock: ${item.name}`, `${fmtQty(item.quantity, item.unit)} goes to ${fmtQty(after, item.unit)}`));
    if (after < 0) effects.push(effect("warning", `${item.name} would go below zero`, "Your count may be off. You can correct it later in Stock."));
    else if (after <= item.reorderLevel) effects.push(effect("warning", `${item.name} is running low`, `At or below your reorder level of ${fmtQty(item.reorderLevel, item.unit)}.`));
  }
  return { ops, effects };
}

export function makeStockUseCases(d: StockDeps) {
  async function planAdjust(bizId: string, actor: Actor, role: Role, itemId: string, reason: MovementReason, quantity: number, note: string) {
    if (!canWrite(role)) return err("forbidden", "Your role cannot change stock.");
    const item = await d.stock.get(bizId, itemId);
    if (!item) return err("not_found", "We could not find this item.");
    const r = MOVEMENT_REASONS.find((m) => m.id === reason);
    if (!r) return err("validation", "Choose a reason.", { field: "reason" });
    // Count corrections take the new total; everything else takes an amount.
    const delta = r.sign === 0 ? quantity - item.quantity : r.sign * Math.abs(quantity);
    const v = validateDelta(delta);
    if (!v.ok) return r.sign === 0 ? err("validation", "That is already the current count.", { field: "quantity" }) : v;
    const after = item.quantity + delta;
    const movement: StockMovement = { id: d.ids.next(), itemId, itemName: item.name, delta, reason, refType: "manual", refId: "", note: note.trim().slice(0, 200), at: d.clock.now(), by: actor.uid };
    const effects: Effect[] = [effect("stock", `${r.label}: ${item.name}`, `${fmtQty(item.quantity, item.unit)} goes to ${fmtQty(after, item.unit)}`)];
    if (after < 0) effects.push(effect("warning", "Below zero", "The count will be negative. Check your numbers."));
    else if (after <= item.reorderLevel) effects.push(effect("warning", "Running low", `At or below your reorder level of ${fmtQty(item.reorderLevel, item.unit)}.`));
    const ops: StockOp[] = [{ kind: "stock.move", movement }, audit(d.ids.next(), d.clock.now(), actor, "stock.adjusted", `${r.label}: ${item.name} ${delta > 0 ? "+" : ""}${delta}`, { itemId })];
    return ok({ preview: { effects, draft: { ...item, quantity: after } } as Preview<StockItem>, ops });
  }

  return {
    async saveItem(bizId: string, actor: Actor, role: Role, id: string | null, input: StockItemInput, openingQuantity = 0): Promise<Result<StockItem>> {
      if (!canWrite(role)) return err("forbidden", "Your role cannot change stock.");
      const existing = id ? await d.stock.get(bizId, id) : null;
      if (id && !existing) return err("not_found", "We could not find this item.");
      const built = buildStockItem(id ?? d.ids.next(), input, d.clock.now(), existing ?? undefined);
      if (!built.ok) return built;
      const ops: StockOp[] = [{ kind: "stock.saveItem", item: built.value }];
      if (!id && openingQuantity !== 0) {
        const v = validateDelta(openingQuantity);
        if (!v.ok) return v;
        ops.push({ kind: "stock.move", movement: { id: d.ids.next(), itemId: built.value.id, itemName: built.value.name, delta: openingQuantity, reason: "opening", refType: "manual", refId: "", note: "", at: d.clock.now(), by: actor.uid } });
      }
      ops.push(audit(d.ids.next(), d.clock.now(), actor, id ? "stock.item_updated" : "stock.item_added", `${id ? "Updated" : "Added"} ${built.value.name}`, { itemId: built.value.id }));
      await d.writer.commit(bizId, ops);
      return ok({ ...built.value, quantity: built.value.quantity + (id ? 0 : openingQuantity) });
    },

    async previewAdjust(bizId: string, actor: Actor, role: Role, itemId: string, reason: MovementReason, quantity: number, note = ""): Promise<Result<Preview<StockItem>>> {
      const p = await planAdjust(bizId, actor, role, itemId, reason, quantity, note);
      return p.ok ? ok(p.value.preview) : p;
    },

    async adjust(bizId: string, actor: Actor, role: Role, itemId: string, reason: MovementReason, quantity: number, note = ""): Promise<Result<StockItem>> {
      const p = await planAdjust(bizId, actor, role, itemId, reason, quantity, note);
      if (!p.ok) return p;
      await d.writer.commit(bizId, p.value.ops);
      return ok(p.value.preview.draft);
    },

    async setArchived(bizId: string, actor: Actor, role: Role, itemId: string, archived: boolean): Promise<Result<StockItem>> {
      if (!canWrite(role)) return err("forbidden", "Your role cannot change stock.");
      const item = await d.stock.get(bizId, itemId);
      if (!item) return err("not_found", "We could not find this item.");
      const next = { ...item, archived };
      await d.writer.commit(bizId, [{ kind: "stock.saveItem", item: next }, audit(d.ids.next(), d.clock.now(), actor, archived ? "stock.archived" : "stock.restored", `${archived ? "Archived" : "Restored"} ${item.name}`, { itemId })]);
      return ok(next);
    },
  };
}
