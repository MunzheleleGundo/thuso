/**
 * Toasts and the preview-then-confirm dialog: THUSO's safety net.
 * Any action that sends a message, moves money or changes stock goes through `confirm()`,
 * which shows the effects in plain language before anything is written.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DomainError, Effect, Preview, Result } from "@thuso/core";
import { onWrite } from "../app/container";
import { Icon, type IconName } from "./icons";
import { Alert, Button, cn, Dialog } from "./kit";

interface Toast { id: number; text: string; tone: "ok" | "info" | "error" }

interface ConfirmRequest<T> {
  title: string;
  intro?: string;
  confirmLabel?: string;
  danger?: boolean;
  preview: () => Promise<Result<Preview<unknown>>>;
  execute: () => Promise<Result<T>>;
  done?: string;
  onDone?: (value: T) => void;
}

interface FeedbackApi {
  toast: (text: string, tone?: Toast["tone"]) => void;
  /** Shows the preview, waits for the user, executes, reports. Resolves with the result value or null. */
  confirm: <T>(req: ConfirmRequest<T>) => Promise<T | null>;
}

const Ctx = createContext<FeedbackApi | null>(null);

const effectIcon: Record<Effect["kind"], IconName> = {
  send: "send", money: "cash", stock: "box", booking: "calendar", customer: "user", settings: "settings", warning: "warning",
};

export function friendlyError(e: DomainError | unknown): string {
  if (e && typeof e === "object" && "message" in e && "code" in e && typeof (e as DomainError).message === "string") {
    const de = e as { code: string; message: string };
    if (de.code === "permission-denied" || de.code === "firestore/permission-denied" || /insufficient permissions/i.test(de.message)) {
      return "You do not have permission to do that, or this tool is switched off.";
    }
    return de.message;
  }
  return "Something went wrong. Please try again.";
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const [req, setReq] = useState<ConfirmRequest<unknown> | null>(null);
  const [effects, setEffects] = useState<readonly Effect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((v: unknown) => void) | null>(null);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);

  useEffect(() => onWrite((e) => {
    if (e.kind === "queued") toast("Saved on this device. It will sync when you are back online.", "info");
    else toast(`A change could not be saved: ${friendlyError(e.error)}`, "error");
  }), [toast]);

  const close = (value: unknown) => {
    resolver.current?.(value);
    resolver.current = null;
    setReq(null); setEffects(null); setError(null); setBusy(false);
  };

  const confirm = useCallback(<T,>(r: ConfirmRequest<T>) => new Promise<T | null>((resolve) => {
    resolver.current = resolve as (v: unknown) => void;
    setReq(r as ConfirmRequest<unknown>);
    setEffects(null); setError(null); setBusy(true);
    r.preview().then((p) => {
      setBusy(false);
      if (p.ok) setEffects(p.value.effects); else setError(p.error.message);
    }).catch((e) => { setBusy(false); setError(friendlyError(e)); });
  }), []);

  const run = async () => {
    if (!req) return;
    setBusy(true); setError(null);
    try {
      const r = await req.execute();
      if (!r.ok) { setBusy(false); setError(r.error.message); return; }
      if (req.done) toast(req.done);
      req.onDone?.(r.value);
      close(r.value);
    } catch (e) {
      setBusy(false); setError(friendlyError(e));
    }
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <Dialog open={!!req} onClose={() => !busy && close(null)} title={req?.title ?? ""}
        footer={<>
          <Button variant="secondary" onClick={() => close(null)} disabled={busy && !!effects}>Edit first</Button>
          <Button variant={req?.danger ? "danger" : "primary"} onClick={run} loading={busy && !!effects} disabled={!effects}>{req?.confirmLabel ?? "Confirm"}</Button>
        </>}>
        <p className="mb-2 text-[14px] text-muted">{req?.intro ?? "Here is exactly what THUSO will do:"}</p>
        {!effects && !error && <div className="py-6 text-center text-muted">Checking…</div>}
        {effects && (
          <ul className="divide-y divide-subtle">
            {effects.map((e, i) => (
              <li key={i} className="flex gap-3 py-3.5">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", e.kind === "warning" ? "bg-warn-50 text-warn-700" : "bg-brand-50 text-brand-600")}>
                  <Icon name={effectIcon[e.kind]} size={16} strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[15px] font-bold">{e.title}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{e.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Dialog>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto max-w-md rounded-xl px-4 py-3 text-[14px] font-semibold shadow-lg",
            t.tone === "error" ? "bg-danger-600 text-white" : t.tone === "info" ? "bg-ink text-white" : "bg-brand-700 text-white")}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeedback outside FeedbackProvider");
  return c;
}

/** Run a Result-returning action with loading and a plain-language error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DomainError | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<Result<T>>): Promise<T | null> => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(r.error); return null; }
      return r.value;
    } catch (e) {
      setError({ code: "unavailable", message: friendlyError(e) });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return {
    busy, error, setError, run,
    fieldError: (f: string) => (error?.field === f ? error.message : null),
    /** The error to show at the top of a form: anything not tied to one of the form's own fields. */
    formError: (shownFields: readonly string[] = []) => (error && (!error.field || !shownFields.includes(error.field)) ? error.message : null),
  };
}
