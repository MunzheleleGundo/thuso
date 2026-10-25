import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { AiGateway, ChatMessage } from "@thuso/core";

/** Gemini implementation of the AiGateway port. Swap this file to change model provider. */
export function geminiGateway(apiKey: string, model: string): AiGateway {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generate(req) {
      const response = await ai.models.generateContent({
        model,
        contents: toContents(req.messages),
        config: {
          systemInstruction: req.system,
          temperature: 0.3,
          maxOutputTokens: 1200,
          ...(req.tools.length
            ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] }
            : {}),
        },
      });
      const calls = (response.functionCalls ?? []).map((c, i) => ({
        id: c.id ?? `call-${i}`,
        name: c.name ?? "",
        args: (c.args ?? {}) as Record<string, unknown>,
      }));
      return { text: calls.length ? "" : (response.text ?? ""), calls };
    },
  };
}

function toContents(messages: readonly ChatMessage[]): Content[] {
  return messages.map((m): Content => {
    switch (m.role) {
      case "user": return { role: "user", parts: [{ text: m.text }] };
      case "assistant": return { role: "model", parts: [{ text: m.text }] };
      case "tool_calls":
        return { role: "model", parts: m.calls.map((c): Part => ({ functionCall: { id: c.id, name: c.name, args: c.args } })) };
      case "tool_results":
        return { role: "user", parts: m.results.map((r): Part => ({ functionResponse: { id: r.id, name: r.name, response: { result: r.result } } })) };
    }
  });
}
