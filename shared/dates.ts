// Date helpers. All game dates are plain "YYYY-MM-DD" strings in the player's timezone.

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar date of an instant in a timezone. */
export function dateInTz(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour (0-23) of an instant in a timezone. */
export function hourInTz(instant: Date, tz: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(instant);
  return Number(h) % 24;
}

/** Milliseconds a timezone is ahead of UTC at an instant. */
function tzOffset(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - Math.floor(t / 1000) * 1000;
}

/** The instant a wall-clock time ("HH:MM") happens on a date in a timezone, e.g. 08:00 in Singapore. */
export function zonedTime(date: string, hhmm: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  // two passes, so a daylight-saving change between the guess and the answer is handled
  return wall - tzOffset(wall - tzOffset(wall, tz), tz);
}

export const isClockTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** The "game day": before `dayStartHour` (e.g. 4am) it still counts as the previous day. */
export function gameDate(now: Date, tz: string, dayStartHour: number): string {
  return dateInTz(new Date(now.getTime() - dayStartHour * 3600_000), tz);
}

/**
 * Grace hours read like a clock: day D stays open until that hour the next day (16 = 4 pm,
 * 12 = noon), but never closes before the game day itself ends at `dayStartHour` (so 0 = closes
 * as soon as the day ends).
 */
const closeOffset = (dayStartHour: number, graceHours: number) => Math.max(dayStartHour, graceHours) * 3600_000;

/** Latest date that is "closed" (penalties applied, no more quest ticking). */
export function closedThrough(now: Date, tz: string, dayStartHour: number, graceHours: number): string {
  return addDays(dateInTz(new Date(now.getTime() - closeOffset(dayStartHour, graceHours)), tz), -1);
}

/** An instant as a short clock time in a timezone: "4 pm", "12:30 am". */
export function clockLabel(t: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h12" }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("hour")}${get("minute") === "00" ? "" : `:${get("minute")}`} ${get("dayPeriod").toLowerCase()}`;
}

/** The moment day D closes (ms). */
export function closesAt(date: string, tz: string, dayStartHour: number, graceHours: number): number {
  return zonedTime(addDays(date, 1), "00:00", tz) + closeOffset(dayStartHour, graceHours);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A real calendar date written YYYY-MM-DD (so not 2016-02-30). */
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** 0 = Monday … 6 = Sunday */
export function weekday(date: string): number {
  return (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function weekStart(date: string): string {
  return addDays(date, -weekday(date));
}

export function monthStart(date: string): string {
  return date.slice(0, 8) + "01";
}

/** Is a daily quest with a "1111100" Mon..Sun mask due on this date? */
export function isDue(days: string, date: string): boolean {
  return (days || "1111111")[weekday(date)] === "1";
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function prettyDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
