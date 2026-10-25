import type { Actor } from "./ports";

export interface AuditEntry {
  readonly id: string;
  readonly at: number;
  readonly actorId: string;
  readonly actorName: string;
  readonly action: string;
  readonly summary: string;
  readonly refs: Readonly<Record<string, string>>;
}

export type AuditOp = { readonly kind: "audit.append"; readonly entry: AuditEntry };

export function audit(id: string, at: number, actor: Actor, action: string, summary: string, refs: Record<string, string> = {}): AuditOp {
  return { kind: "audit.append", entry: { id, at, actorId: actor.uid, actorName: actor.name, action, summary, refs } };
}
