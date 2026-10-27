// Picks a repeat schedule (shared/schedule.ts) and previews the next few dates.
import { prettyDate, WEEKDAY_SHORT } from "../../shared/dates";
import { nextOccurrence, repeatProblem, type Repeat } from "../../shared/schedule";
import { DaysInput } from "./ui";

type Mode = "" | Repeat["t"];
const MODES: [Mode, string][] = [
  ["days", "Every N days"],
  ["weeks", "Every N weeks on chosen days (e.g. alternate Sundays)"],
  ["monthday", "Monthly on a date (e.g. the 26th)"],
  ["monthweek", "Monthly on a weekday (e.g. 2nd Sunday)"],
  ["yearly", "Yearly (e.g. a renewal)"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The draft rule being edited (may be incomplete while you type). */
type Draft = { t?: Repeat["t"]; n?: number; days?: string; day?: number; week?: number; weekday?: number; month?: number; from?: string };

export function asRepeat(v: unknown): Draft | null {
  if (!v) return null;
  if (typeof v === "object") return v as Draft;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

/** A fresh rule of a kind, starting on `today`. */
function blank(t: Repeat["t"], today: string): Repeat {
  const [, m, d] = today.split("-").map(Number);
  const wd = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
  switch (t) {
    case "days":
      return { t, n: 2, from: today };
    case "weeks":
      return { t, n: 2, days: "0000000".slice(0, wd) + "1" + "0000000".slice(wd + 1), from: today };
    case "monthday":
      return { t, n: 1, day: d, from: today };
    case "monthweek":
      return { t, n: 1, week: Math.min(4, Math.ceil(d / 7)), weekday: wd, from: today };
    case "yearly":
      return { t, month: m, day: d, from: today };
  }
}

export function RepeatInput({
  value,
  onChange,
  today,
  noneLabel,
}: {
  value: unknown;
  onChange: (v: Repeat | null) => void;
  today: string;
  /** label of the "no schedule" choice (dailies: specific weekdays; to-dos: doesn't repeat) */
  noneLabel: string;
}) {
  const r = asRepeat(value);
  const mode: Mode = (r?.t as Mode) ?? "";
  const set = (patch: Record<string, unknown>) => onChange({ ...(r as Repeat), ...patch } as Repeat);
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
  const problem = r ? repeatProblem(r) : null;
  const preview: string[] = [];
  if (r && !problem) {
    let d: string | null = r.from! > today ? r.from! : today;
    // include today if it falls on the schedule
    d = nextOccurrence(r as Repeat, new Date(Date.parse(d + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10));
    while (d && preview.length < 4) {
      preview.push(d);
      d = nextOccurrence(r as Repeat, d);
    }
  }
  return (
    <div className="repeat-input">
      <select className="input" value={mode} onChange={(e) => onChange(e.target.value ? blank(e.target.value as Repeat["t"], today) : null)}>
        <option value="">{noneLabel}</option>
        {MODES.map(([m, l]) => (
          <option key={m} value={m}>
            {l}
          </option>
        ))}
      </select>
      {r && (
        <div className="repeat-body">
          {r.t !== "yearly" && (
            <label className="repeat-row">
              <span>Every</span>
              <input className="input num-in" type="number" inputMode="numeric" min={1} value={r.n ?? 1} onChange={(e) => set({ n: num(e.target.value, 1, r.t === "days" ? 365 : r.t === "weeks" ? 52 : 12) })} />
              <span>{r.t === "days" ? "day(s)" : r.t === "weeks" ? "week(s)" : "month(s)"}</span>
            </label>
          )}
          {r.t === "weeks" && <DaysInput value={r.days ?? "0000000"} onChange={(v) => set({ days: v })} />}
          {r.t === "monthday" && (
            <label className="repeat-row">
              <span>on the</span>
              <select className="input" value={r.day ?? 1} onChange={(e) => set({ day: Number(e.target.value) })}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                <option value={-1}>last day</option>
              </select>
            </label>
          )}
          {r.t === "monthweek" && (
            <label className="repeat-row">
              <span>on the</span>
              <select className="input" value={r.week ?? 1} onChange={(e) => set({ week: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {["1st", "2nd", "3rd", "4th"][w - 1]}
                  </option>
                ))}
                <option value={-1}>last</option>
              </select>
              <select className="input" value={r.weekday ?? 0} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                {WEEKDAY_SHORT.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          )}
          {r.t === "yearly" && (
            <label className="repeat-row">
              <span>on</span>
              <input className="input num-in" type="number" min={1} max={31} value={r.day ?? 1} onChange={(e) => set({ day: num(e.target.value, 1, 31) })} />
              <select className="input" value={r.month ?? 1} onChange={(e) => set({ month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(r.t === "days" || r.t === "weeks" || (r.n ?? 1) > 1) && (
            <label className="repeat-row">
              <span>starting</span>
              <input className="input" type="date" value={r.from ?? today} onChange={(e) => e.target.value && set({ from: e.target.value })} />
            </label>
          )}
          {problem ? (
            <span className="help neg">{problem}</span>
          ) : (
            <span className="help">Next: {preview.map((d) => prettyDate(d).replace(/ \d{4}$/, "")).join(" · ") || "—"}</span>
          )}
        </div>
      )}
    </div>
  );
}
