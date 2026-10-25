import type { AuditOp } from "../../shared/audit";
import type { StockItem, StockMovement } from "../domain/stock";

export interface StockReader {
  get(bizId: string, id: string): Promise<StockItem | null>;
  list(bizId: string): Promise<StockItem[]>;
}

export type StockOp =
  | { readonly kind: "stock.saveItem"; readonly item: StockItem }
  /** Records the movement and atomically increments the item's quantity by `delta`. */
  | { readonly kind: "stock.move"; readonly movement: StockMovement }
  | AuditOp;
