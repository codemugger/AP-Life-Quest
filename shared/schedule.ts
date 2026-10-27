// Repeat schedules beyond "these weekdays": every N days, every N weeks on some weekdays,
// monthly on a day (e.g. the 26th), monthly on the Nth weekday (e.g. 2nd Sunday), yearly.
// Dailies use them as "due on these days"; to-dos use them to create their next occurrence.
import { addDays, daysBetween, isDue, weekday, weekStart, WEEKDAY_SHORT } from "./dates";

export type Repeat =
  | { t: "days"; n: number; from: string }
  | { t: "weeks"; n: number; days: string; from: string } // days = Mon..Sun mask like "0000001"
  | { t: "monthday"; n: number; day: number; from: string } // day 1-31, or -1 = last day of the month
  | { t: "monthweek"; n: number; week: number; weekday: number; from: string } // week 1-4 or -1 = last; weekday 0 = Mon
  | { t: "yearly"; month: number; day: number; from: string };

export const REPEAT_TYPES = ["days", "weeks", "monthday", "monthweek", "yearly"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const ymd = (date: string) => date.split("-").map(Number) as [number, number, number];
const monthsBetween = (a: string, b: string) => {
  const [ay, am] = ymd(a);
  const [by, bm] = ymd(b);
  return (by - ay) * 12 + (bm - am);
};

export function parseRepeat(raw: unknown): Repeat | null {
  if (!raw) return null;
  try {
    const r = typeof raw === "string" ? JSON.parse(raw) : raw;
    return r && typeof r === "object" && !repeatProblem(r) ? (r as Repeat) : null;
  } catch {
    return null;
  }
}

/** Why a schedule is malformed (null if fine). */
export function repeatProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "must be an object";
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (!REPEAT_TYPES.includes(r.t as never)) return `unknown repeat type "${r.t}"`;
  if (typeof r.from !== "string" || !DATE.test(r.from)) return "needs a start date";
  switch (r.t) {
    case "days":
      return int(r.n, 1, 365) ? null : "every 1–365 days";
    case "weeks":
      if (!int(r.n, 1, 52)) return "every 1–52 weeks";
      return typeof r.days === "string" && /^[01]{7}$/.test(r.days) && r.days.includes("1") ? null : "pick at least one weekday";
    case "monthday":
      if (!int(r.n, 1, 12)) return "every 1–12 months";
      return int(r.day, 1, 31) || r.day === -1 ? null : "day must be 1–31 or last";
    case "monthweek":
      if (!int(r.n, 1, 12)) return "every 1–12 months";
      if (!(int(r.week, 1, 4) || r.week === -1)) return "week must be 1st–4th or last";
      return int(r.weekday, 0, 6) ? null : "pick a weekday";
    case "yearly":
      return int(r.month, 1, 12) && int(r.day, 1, 31) ? null : "pick a month and day";
  }
  return null;
}

/** Does the schedule fall on this date? */
export function occursOn(r: Repeat, date: string): boolean {
  if (date < r.from) return false;
  const [y, m, d] = ymd(date);
  switch (r.t) {
    case "days":
      return daysBetween(r.from, date) % r.n === 0;
    case "weeks":
      return r.days[weekday(date)] === "1" && (daysBetween(weekStart(r.from), weekStart(date)) / 7) % r.n === 0;
    case "monthday": {
      if (monthsBetween(r.from, date) % r.n !== 0) return false;
      const last = dim(y, m);
      return r.day === -1 ? d === last : d === Math.min(r.day, last); // the 31st → last day in short months
    }
    case "monthweek": {
      if (monthsBetween(r.from, date) % r.n !== 0 || weekday(date) !== r.weekday) return false;
      return r.week === -1 ? d + 7 > dim(y, m) : Math.ceil(d / 7) === r.week;
    }
    case "yearly":
      return m === r.month && d === Math.min(r.day, dim(y, m));
  }
}

/** First date strictly after `after` on which the schedule falls (null if none within ~4 years). */
export function nextOccurrence(r: Repeat, after: string): string | null {
  let d = addDays(after < r.from ? addDays(r.from, -1) : after, 1);
  for (let i = 0; i < 1500; i++, d = addDays(d, 1)) if (occursOn(r, d)) return d;
  return null;
}

/** Due on a date? Dailies with a schedule follow it; others use their weekday mask. */
export const questDue = (q: { days: string; repeat_rule?: string | null }, date: string) => {
  const r = q.repeat_rule ? parseRepeat(q.repeat_rule) : null;
  return r ? occursOn(r, date) : isDue(q.days, date);
};

const ORD = ["", "1st", "2nd", "3rd", "4th"];
const nth = (n: number) => (n === 1 ? "" : ` ${n}`);
const dayNth = (d: number) => (d === -1 ? "last day" : `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Every 2 weeks on Sun", "Monthly on the 26th", "Every month on the 2nd Sun"… */
export function describeRepeat(r: Repeat): string {
  switch (r.t) {
    case "days":
      return r.n === 1 ? "Every day" : `Every ${r.n} days`;
    case "weeks": {
      const days = WEEKDAY_SHORT.filter((_, i) => r.days[i] === "1").join(", ");
      return r.n === 1 ? `Every week on ${days}` : r.n === 2 ? `Every other week on ${days}` : `Every ${r.n} weeks on ${days}`;
    }
    case "monthday":
      return `${r.n === 1 ? "Monthly" : `Every${nth(r.n)} months`} on the ${dayNth(r.day)}`;
    case "monthweek":
      return `${r.n === 1 ? "Monthly" : `Every${nth(r.n)} months`} on the ${r.week === -1 ? "last" : ORD[r.week]} ${WEEKDAY_SHORT[r.weekday]}`;
    case "yearly":
      return `Yearly on ${r.day} ${MONTHS[r.month - 1]}`;
  }
}
