import { dayName, WEEKDAYS, type WorkingSchedule } from "@thuso/core";
import { cn, Field, Select } from "../../ui/kit";

export function ScheduleEditor({ value, onChange, error }: { value: WorkingSchedule; onChange: (s: WorkingSchedule) => void; error?: string | null }) {
  const setDay = (d: (typeof WEEKDAYS)[number], patch: Partial<WorkingSchedule["days"]["mon"]>) =>
    onChange({ ...value, days: { ...value.days, [d]: { ...value.days[d], ...patch } } });

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[14px] border border-line bg-surface px-4 sm:px-5">
        {WEEKDAYS.map((d) => {
          const day = value.days[d];
          return (
            <div key={d} className="grid grid-cols-[1fr] items-center gap-3 border-b border-subtle py-3 last:border-0 sm:grid-cols-[150px_1fr_1fr]">
              <label className="flex min-h-11 items-center gap-2.5 text-[15px] font-bold">
                <input type="checkbox" checked={day.open} onChange={(e) => setDay(d, { open: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                {dayName(d)}
                {!day.open && <span className="text-[13px] font-semibold text-muted sm:hidden">Closed</span>}
              </label>
              <div className={cn("grid grid-cols-2 gap-3 sm:contents", !day.open && "opacity-50")}>
                <label className="flex flex-col gap-1 text-[12px] font-bold">Opens
                  <input type="time" value={day.from} disabled={!day.open} onChange={(e) => setDay(d, { from: e.target.value })}
                    className="h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] disabled:bg-subtle" />
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-bold">Closes
                  <input type="time" value={day.to} disabled={!day.open} onChange={(e) => setDay(d, { to: e.target.value })}
                    className="h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] disabled:bg-subtle" />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="text-[13px] font-semibold text-danger-600">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Booking times every" htmlFor="sch-step">
          <Select id="sch-step" value={value.slotStepMinutes} onChange={(e) => onChange({ ...value, slotStepMinutes: Number(e.target.value) as 15 | 30 | 60 })}>
            <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>Hour</option>
          </Select>
        </Field>
        <Field label="Minimum notice" htmlFor="sch-notice">
          <Select id="sch-notice" value={value.minNoticeMinutes} onChange={(e) => onChange({ ...value, minNoticeMinutes: Number(e.target.value) })}>
            <option value={0}>None</option><option value={60}>1 hour</option><option value={180}>3 hours</option><option value={1440}>1 day</option><option value={2880}>2 days</option>
          </Select>
        </Field>
        <Field label="Book up to" htmlFor="sch-ahead">
          <Select id="sch-ahead" value={value.maxAdvanceDays} onChange={(e) => onChange({ ...value, maxAdvanceDays: Number(e.target.value) })}>
            <option value={7}>1 week ahead</option><option value={14}>2 weeks ahead</option><option value={30}>30 days ahead</option><option value={60}>60 days ahead</option><option value={90}>90 days ahead</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}
