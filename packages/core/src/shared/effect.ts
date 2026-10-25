/**
 * An Effect is one plain-language line in a preview: something THUSO is about to do.
 * Every state-changing use case can produce its effects before anything is written,
 * which powers the "preview, then confirm" screen.
 */
export type EffectKind =
  | "send"
  | "money"
  | "stock"
  | "booking"
  | "customer"
  | "settings"
  | "warning";

export interface Effect {
  readonly kind: EffectKind;
  readonly title: string;
  readonly detail: string;
}

export interface Preview<T = undefined> {
  readonly effects: readonly Effect[];
  /** Anything the UI might want to show beside the effects, e.g. the invoice that would be created. */
  readonly draft: T;
}

export const effect = (kind: EffectKind, title: string, detail: string): Effect => ({ kind, title, detail });
