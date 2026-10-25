import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { AssistantMode, SuggestedAction } from "@thuso/core";
import { api, callableMessage } from "../../adapters/functions";
import { useOnline } from "../../adapters/live";
import { useWorkspace } from "../../app/session";
import { Icon } from "../../ui/icons";
import { Button, cn } from "../../ui/kit";

interface Msg { role: "user" | "assistant"; text: string; actions?: readonly SuggestedAction[]; error?: boolean }

const STARTERS: Record<AssistantMode, string[]> = {
  business: ["Who still owes me money?", "What is booked for today?", "What is running low?", "How much did I invoice this month?"],
  general: ["How do I price a new service?", "Do I need to register for VAT?", "Write a polite payment reminder", "How do I register a company?"],
};

const actionPath = (a: SuggestedAction) => ({
  open_invoice: `/app/invoices/${a.targetId}`,
  open_booking: `/app/bookings?booking=${a.targetId}`,
  open_customer: `/app/customers/${a.targetId}`,
  new_invoice: `/app/invoices/new?customer=${a.targetId}`,
  open_stock: `/app/stock?item=${a.targetId}`,
}[a.type]);

/** Renders the small amount of markdown the model uses: paragraphs, "- " lists and **bold**. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const bold = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${k}-${i}`}>{part.slice(2, -2)}</strong> : <span key={`${k}-${i}`}>{part}</span>);
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="ml-5 list-disc space-y-1">{list.map((l, i) => <li key={i}>{bold(l, `li${i}`)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) { list.push(m[1]); continue; }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{bold(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bizId, business } = useWorkspace();
  const online = useOnline();
  const nav = useNavigate();
  const [mode, setMode] = useState<AssistantMode>("business");
  const [threads, setThreads] = useState<Record<AssistantMode, Msg[]>>({ business: [], general: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const msgs = threads[mode];

  useEffect(() => { scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, [msgs.length, busy]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open, mode]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: "user" as const, text: question }];
    setThreads((t) => ({ ...t, [mode]: [...t[mode], { role: "user", text: question }] }));
    setText(""); setBusy(true);
    try {
      const reply = await api.askThuso({ bizId, mode, history: history.map(({ role, text }) => ({ role, text })) });
      setThreads((t) => ({ ...t, [mode]: [...t[mode], { role: "assistant", text: reply.text, actions: reply.actions }] }));
    } catch (e) {
      setThreads((t) => ({ ...t, [mode]: [...t[mode], { role: "assistant", text: callableMessage(e, "Ask THUSO is not available right now."), error: true }] }));
    }
    setBusy(false);
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-[#14201c]/30 lg:hidden" onClick={onClose} />}
      <aside aria-label="Ask THUSO" aria-hidden={!open}
        className={cn("no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l border-line bg-surface shadow-2xl transition-transform", open ? "translate-x-0" : "pointer-events-none translate-x-full")}>
        <div className="border-b border-line px-5 pb-3.5 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[17px] font-extrabold"><Icon name="spark" size={18} />Ask THUSO</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-[10px] hover:bg-subtle"><Icon name="x" /></button>
          </div>
          <div role="tablist" className="flex rounded-[10px] bg-subtle p-[3px]">
            {(["business", "general"] as const).map((m) => (
              <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)}
                className={cn("h-9 flex-1 rounded-lg text-[13px] font-bold", mode === m ? "bg-brand-600 text-white" : "text-ink-soft")}>
                {m === "business" ? "My business" : "General help"}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
            {mode === "business" ? `Answers only from ${business.name}'s own data. It cannot change anything.` : "General guidance for running a business. It cannot see your data."}
          </p>
        </div>
        <div ref={scroller} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-5">
          {msgs.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-muted">Not sure about something? Ask. For example:</p>
              {STARTERS[mode].map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} disabled={!online}
                  className="min-h-11 rounded-xl border border-line px-3.5 py-2.5 text-left text-[14px] font-semibold hover:border-brand-600 disabled:opacity-50">{s}</button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className="max-w-[85%] self-end rounded-[14px] rounded-br-[4px] bg-brand-600 px-3.5 py-2.5 text-[14px] leading-relaxed text-white">{m.text}</div>
          ) : (
            <div key={i} className={cn("max-w-[92%] self-start rounded-[14px] rounded-bl-[4px] px-3.5 py-3 text-[14px] leading-relaxed", m.error ? "bg-danger-50 text-danger-600" : "bg-canvas")}>
              <Rich text={m.text} />
              {m.actions && m.actions.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {m.actions.map((a, j) => (
                    <Button key={j} size="sm" variant="secondary" icon="arrowRight" onClick={() => { onClose(); nav(actionPath(a)); }}>{a.label}</Button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="self-start rounded-[14px] bg-canvas px-4 py-3 text-[14px] text-muted">Thinking…</div>}
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-line px-5 py-4">
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} disabled={!online} maxLength={2000}
            aria-label="Your question" placeholder={online ? "Not sure? Ask" : "Ask THUSO needs a connection"}
            className="h-11 flex-1 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[14px] disabled:bg-subtle" />
          <button type="submit" aria-label="Send" disabled={!text.trim() || busy || !online}
            className="grid h-11 w-11 place-items-center rounded-[10px] bg-brand-600 text-white disabled:opacity-50"><Icon name="arrowRight" size={18} strokeWidth={2} /></button>
        </form>
      </aside>
    </>
  );
}
