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

/** The "game day": before `dayStartHour` (e.g. 4am) it still counts as the previous day. */
export function gameDate(now: Date, tz: string, dayStartHour: number): string {
  return dateInTz(new Date(now.getTime() - dayStartHour * 3600_000), tz);
}

/**
 * Latest date that is "closed" (penalties applied, no more quest ticking).
 * Day D closes `graceHours` after it ends, so you can still log yesterday in the morning.
 */
export function closedThrough(now: Date, tz: string, dayStartHour: number, graceHours: number): string {
  return addDays(gameDate(new Date(now.getTime() - graceHours * 3600_000), tz, dayStartHour), -1);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

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
