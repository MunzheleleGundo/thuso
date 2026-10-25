/** Vendor-neutral chat types. The Gemini adapter maps these to and from its own SDK. */

export type AssistantMode = "business" | "general";

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
}

export interface ToolResult {
  readonly id: string;
  readonly name: string;
  readonly result: unknown;
}

export type ChatMessage =
  | { readonly role: "user"; readonly text: string }
  | { readonly role: "assistant"; readonly text: string }
  | { readonly role: "tool_calls"; readonly calls: readonly ToolCall[] }
  | { readonly role: "tool_results"; readonly results: readonly ToolResult[] };

/** JSON-schema subset that every major model API accepts for function parameters. */
export interface JsonSchema {
  readonly type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly enum?: readonly string[];
  readonly items?: JsonSchema;
}

export interface ToolDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
}

/** A navigation suggestion the assistant can offer. The user still previews and confirms any change. */
export interface SuggestedAction {
  readonly type: "open_invoice" | "open_booking" | "open_customer" | "new_invoice" | "open_stock";
  readonly targetId: string;
  readonly label: string;
}

export interface AssistantReply {
  readonly text: string;
  readonly actions: readonly SuggestedAction[];
  readonly toolsUsed: readonly string[];
}

/** Trim what the browser sends: only user and assistant text, recent turns, bounded length. */
export function sanitizeHistory(input: unknown, maxTurns = 12, maxChars = 2000): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const m of input.slice(-maxTurns)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const text = (m as { text?: unknown }).text;
    if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
      out.push({ role, text: text.slice(0, maxChars) });
    }
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}
