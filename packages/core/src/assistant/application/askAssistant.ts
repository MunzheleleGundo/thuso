import { instantToLocalDate } from "../../shared/time";
import { err, ok, type Result } from "../../shared/result";
import { MODULES } from "../../workspace";
import type { AssistantMode, AssistantReply, ChatMessage, ToolCall, ToolDeclaration, ToolResult } from "../domain/conversation";
import { declarations, toolsFor, type AssistantContext } from "../domain/tools";

/** The model behind the assistants. Implemented by the Gemini adapter in Cloud Functions. */
export interface AiGateway {
  generate(req: {
    system: string;
    messages: readonly ChatMessage[];
    tools: readonly ToolDeclaration[];
  }): Promise<{ text: string; calls: readonly ToolCall[] }>;
}

export const MAX_TOOL_ROUNDS = 5;

export function businessSystemPrompt(ctx: Pick<AssistantContext, "business" | "now">): string {
  const b = ctx.business;
  return [
    `You are THUSO's business assistant for ${b.name}, a business in ${b.town}, ${b.province}, South Africa.`,
    `Today is ${instantToLocalDate(ctx.now, b.utcOffsetMinutes)} (South African time). Money is in rand; write amounts like R 1,250.00.`,
    `Tools switched on: ${b.enabledModules.map((m) => MODULES[m].name).join(", ")}.`,
    "Rules:",
    "1. Answer only from what the tools return. Never guess or invent customers, amounts, dates or bookings.",
    "2. If the tools cannot answer, say plainly that you cannot find it, and say which THUSO screen might help.",
    "3. You cannot change anything. When a next step would help, call propose_action so the user gets a button; they review and confirm there.",
    "4. Be brief and warm. Use short sentences and plain words. Use a short list only when listing several items.",
    "5. If asked something general (not about this business's data), answer briefly and suggest switching to the General assistant.",
  ].join("\n");
}

export function generalSystemPrompt(): string {
  return [
    "You are THUSO's general assistant. You help owners of small and growing businesses in South Africa with everyday business questions:",
    "pricing, quotes and invoices, wording messages to customers, registering a business, VAT and tax basics, staff basics, marketing and planning.",
    "You cannot see this business's data. If the question needs their bookings, invoices, stock or customers, suggest switching to the Business assistant.",
    "Explain in plain language with practical next steps. Never make the user feel silly for asking.",
    "For tax, legal or labour questions, give general guidance, mention the official body (SARS, CIPC, Department of Employment and Labour) and suggest a professional for their specific case. Do not present guidance as legal or tax advice.",
    "Keep answers short unless asked for detail.",
  ].join("\n");
}

export async function askAssistant(args: {
  mode: AssistantMode;
  history: readonly ChatMessage[];
  gateway: AiGateway;
  ctx: AssistantContext;
}): Promise<Result<AssistantReply>> {
  const last = args.history[args.history.length - 1];
  if (!last || last.role !== "user") return err("validation", "Ask a question first.");
  if (last.text.length > 2000) return err("validation", "Please keep your question under 2,000 characters.");

  if (args.mode === "general") {
    const out = await args.gateway.generate({ system: generalSystemPrompt(), messages: args.history, tools: [] });
    return ok({ text: out.text.trim() || "Sorry, I could not come up with an answer. Try asking another way.", actions: [], toolsUsed: [] });
  }

  const tools = toolsFor(args.ctx.business);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages: ChatMessage[] = [...args.history];
  const used: string[] = [];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const out = await args.gateway.generate({
      system: businessSystemPrompt(args.ctx),
      messages,
      tools: round < MAX_TOOL_ROUNDS ? declarations(tools) : [],
    });
    if (out.calls.length === 0) {
      return ok({ text: out.text.trim() || "I could not find an answer in your data.", actions: args.ctx.actions, toolsUsed: used });
    }
    messages.push({ role: "tool_calls", calls: out.calls });
    const results: ToolResult[] = [];
    for (const call of out.calls.slice(0, 8)) {
      const tool = byName.get(call.name);
      used.push(call.name);
      try {
        results.push({ id: call.id, name: call.name, result: tool ? await tool.run(call.args ?? {}, args.ctx) : { error: `Unknown tool ${call.name}` } });
      } catch {
        results.push({ id: call.id, name: call.name, result: { error: "That information could not be loaded right now." } });
      }
    }
    messages.push({ role: "tool_results", results });
  }
  return ok({ text: "That needed more steps than I can take at once. Try asking a narrower question.", actions: args.ctx.actions, toolsUsed: used });
}
