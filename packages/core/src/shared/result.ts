/** Errors the domain knows how to explain. `code` is stable for tests and UI; `message` is plain language. */
export type ErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "duplicate"
  | "invalid_state"
  | "module_disabled"
  | "forbidden"
  | "unavailable";

export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
}

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = (code: ErrorCode, message: string, extra: Omit<DomainError, "code" | "message"> = {}): Result<never> => ({
  ok: false,
  error: { code, message, ...extra },
});

/** Unwrap in tests or at trusted boundaries. Throws with the domain message. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
