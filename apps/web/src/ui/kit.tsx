import {
  forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./icons";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------- brand

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={cn("grid h-[34px] w-[34px] place-items-center rounded-[9px] text-[17px] font-extrabold", inverted ? "bg-white text-brand-600" : "bg-brand-600 text-white")}>T</span>
      {!compact && <span className={cn("text-[19px] font-extrabold tracking-[1.5px]", inverted ? "text-white" : "text-ink")}>THUSO</span>}
    </span>
  );
}

// ---------------------------------------------------------------- buttons

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "bg-surface text-ink border-[1.5px] border-line-strong hover:bg-subtle disabled:opacity-60",
  ghost: "bg-transparent text-brand-600 hover:bg-brand-50 disabled:opacity-50",
  danger: "bg-danger-600 text-white hover:bg-[#8a2424] disabled:opacity-60",
};
const sizes = { sm: "h-10 px-3.5 text-[13px] gap-1.5", md: "h-12 px-5 text-[15px] gap-2", lg: "h-[54px] px-7 text-base gap-2" };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof sizes;
  icon?: IconName;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, loading, full, className, children, disabled, type = "button", ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[10px] font-bold transition-colors disabled:cursor-not-allowed", variants[variant], sizes[size], full && "w-full", className)}
      {...rest}>
      {loading ? <Spinner small /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} strokeWidth={2} /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant = "primary", size = "md", icon, className, children, full }: {
  to: string; variant?: Variant; size?: keyof typeof sizes; icon?: IconName; className?: string; children: ReactNode; full?: boolean;
}) {
  return (
    <Link to={to} className={cn("inline-flex shrink-0 items-center justify-center rounded-[10px] font-bold no-underline transition-colors", variants[variant], sizes[size], full && "w-full", className)}>
      {icon && <Icon name={icon} size={18} strokeWidth={2} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon, label, onClick, className }: { icon: IconName; label: string; onClick?: () => void; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cn("grid h-11 w-11 place-items-center rounded-[10px] text-ink-soft hover:bg-subtle", className)}>
      <Icon name={icon} />
    </button>
  );
}

export function Spinner({ small = false }: { small?: boolean }) {
  return <span role="status" aria-label="Loading" className={cn("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", small ? "h-4 w-4" : "h-6 w-6")} />;
}

export function PageSpinner() {
  return <div className="grid min-h-[50vh] place-items-center text-brand-600"><Spinner /></div>;
}

// ---------------------------------------------------------------- form fields

export function Field({ label, error, hint, children, htmlFor, optional }: {
  label: string; error?: string | null; hint?: string; children: ReactNode; htmlFor?: string; optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-bold">
        {label} {optional && <span className="font-medium text-muted">(optional)</span>}
      </label>
      {children}
      {error ? <p role="alert" className="text-[13px] font-semibold text-danger-600">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

const inputCls = "h-12 w-full rounded-[10px] border border-line-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-[#8a9690] disabled:bg-subtle disabled:text-muted aria-[invalid=true]:border-danger-600";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputCls, className)} {...rest} />;
  });

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputCls, "pr-8", className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "h-auto min-h-[96px] py-3 leading-relaxed", className)} {...rest} />;
}

export function Checkbox({ label, checked, onChange, detail }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; detail?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-[14px] leading-snug text-ink-soft">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-brand-600" />
      <span>{label}{detail && <span className="mt-0.5 block text-[12px] text-muted">{detail}</span>}</span>
    </label>
  );
}

/** Selectable card-style option (radio or checkbox). */
export function OptionCard({ selected, onToggle, children, multi = false, className }: {
  selected: boolean; onToggle: () => void; children: ReactNode; multi?: boolean; className?: string;
}) {
  return (
    <label className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] bg-surface px-4 py-3.5 text-[15px] font-bold transition-colors",
      selected ? "border-brand-600 bg-brand-50" : "border-line hover:border-line-strong", className)}>
      <input type={multi ? "checkbox" : "radio"} checked={selected} onChange={onToggle} className="sr-only" />
      {children}
    </label>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={cn("min-h-11 rounded-xl border-[1.5px] px-4 text-[14px] font-bold transition-colors", selected ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-surface hover:border-line-strong")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- display

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-[14px] border border-line bg-surface", className)}>{children}</div>;
}

type Tone = "green" | "amber" | "red" | "grey" | "blue";
const tones: Record<Tone, string> = {
  green: "bg-brand-50 text-brand-700", amber: "bg-warn-50 text-warn-700", red: "bg-danger-50 text-danger-600",
  grey: "bg-subtle text-ink-soft", blue: "bg-info-50 text-info-700",
};
export function Pill({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold", tones[tone])}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        {back && <Link to={back} className="mb-1 inline-flex items-center gap-1 text-[13px] font-bold text-brand-600"><Icon name="chevronLeft" size={16} />Back</Link>}
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Icon name={icon} size={26} /></div>
      <h3 className="text-[17px] font-extrabold">{title}</h3>
      <p className="max-w-sm text-[14px] leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "amber" | "blue" | "green"; children: ReactNode }) {
  const cls = { red: "bg-danger-50 text-danger-600", amber: "bg-warn-50 text-warn-700", blue: "bg-info-50 text-info-700", green: "bg-brand-50 text-brand-700" }[tone];
  return <div role={tone === "red" ? "alert" : "status"} className={cn("rounded-[10px] px-4 py-3 text-[14px] font-semibold leading-relaxed", cls)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[12px] font-bold text-muted">{label}</div>
      <div className="tabular mt-1.5 text-[26px] font-extrabold">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------- dialog

export function Dialog({ open, onClose, title, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#14201c]/45 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id}
        className={cn("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-[480px]")}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={id} className="text-[17px] font-extrabold">{title}</h2>
          <button data-close type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-[10px] text-ink-soft hover:bg-subtle"><Icon name="x" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2.5 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("min-h-11 whitespace-nowrap border-b-2 px-3.5 text-[14px] font-bold", value === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
