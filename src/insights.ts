// Body → Trends: a few plain lines about calories (30-day EMA, last 3 days) and how weight moved
// over the past week and month, sorted into steady / minor / sharp so the headline is clear.
import { addDays, daysBetween } from "../shared/dates";
import { ema, sma } from "../shared/health";

export interface Pt {
  date: string;
  value: number;
}
export type Tone = "good" | "warn" | "bad" | "neutral";
export interface Line {
  icon: string;
  text: string;
  tone: Tone;
}
export type Move = "steady" | "minor-loss" | "sharp-loss" | "minor-gain" | "sharp-gain";

/** kg: under `steady` counts as steady, from `sharp` up as sharp (in between: minor). */
export const BANDS = { week: { steady: 0.3, sharp: 0.7 }, month: { steady: 0.5, sharp: 2 } } as const;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const kg = (n: number) => `${n.toFixed(1)} kg`;
const kcal = (n: number) => `${Math.round(n).toLocaleString("en-SG")} kcal`;

export function classify(delta: number, band: { steady: number; sharp: number }): Move {
  const size = Math.abs(delta);
  if (size < band.steady) return "steady";
  if (delta < 0) return size >= band.sharp ? "sharp-loss" : "minor-loss";
  return size >= band.sharp ? "sharp-gain" : "minor-gain";
}

/** Average weigh-in near a day: within ±near days, else the closest within ±far days. */
function around(ws: Pt[], date: string, near: number, far: number) {
  const close = ws.filter((w) => Math.abs(daysBetween(date, w.date)) <= near);
  if (close.length) return avg(close.map((w) => w.value));
  const within = ws.filter((w) => Math.abs(daysBetween(date, w.date)) <= far);
  if (!within.length) return null;
  return within.reduce((a, b) => (Math.abs(daysBetween(date, b.date)) < Math.abs(daysBetween(date, a.date)) ? b : a)).value;
}

const WORDS: Record<Move, string> = {
  steady: "holding steady",
  "minor-loss": "a minor loss",
  "sharp-loss": "a sharp drop",
  "minor-gain": "a minor gain",
  "sharp-gain": "a sharp gain",
};
const TONE: Record<Move, Tone> = { steady: "neutral", "minor-loss": "good", "sharp-loss": "good", "minor-gain": "warn", "sharp-gain": "bad" };

/** How weight moved over a span, smoothed (averages of nearby weigh-ins, so one heavy morning doesn't count). */
export function weightMove(weights: Pt[], span: 7 | 30) {
  if (!weights.length) return null;
  const last = weights[weights.length - 1];
  const now = avg(weights.filter((w) => daysBetween(w.date, last.date) <= 2).map((w) => w.value));
  const then = span === 7 ? around(weights, addDays(last.date, -7), 2, 4) : around(weights, addDays(last.date, -30), 3, 7);
  if (then === null) return null;
  const delta = Math.round((now - then) * 10) / 10;
  return { delta, from: then, to: now, move: classify(delta, span === 7 ? BANDS.week : BANDS.month) };
}

export function bodyTrends({ calories, weights, budget, today }: { calories: Pt[]; weights: Pt[]; budget: number | null; today: string }) {
  const lines: Line[] = [];
  // ---- calories ----
  const lastCal = calories[calories.length - 1];
  let overBudget = false;
  let runningHigh = false;
  if (!lastCal || daysBetween(lastCal.date, today) > 7) lines.push({ icon: "🍱", text: "No calories logged in the past week.", tone: "neutral" });
  else {
    const vals = calories.map((c) => c.value);
    const e = ema(vals, 30).at(-1)!;
    const d3 = sma(vals, 3).at(-1)!;
    if (budget) {
      const diff = e - budget;
      overBudget = diff > 0;
      lines.push(
        diff <= 0
          ? { icon: "📉", text: `30-day EMA ${kcal(e)}: ${kcal(-diff)} under your ${kcal(budget)} budget.`, tone: "good" }
          : { icon: "📈", text: `30-day EMA ${kcal(e)}: ${kcal(diff)} over your ${kcal(budget)} budget.`, tone: diff > budget * 0.05 ? "bad" : "warn" },
      );
    } else lines.push({ icon: "📉", text: `30-day EMA ${kcal(e)}.`, tone: "neutral" });
    const pct = Math.round(((d3 - e) / e) * 100);
    runningHigh = pct >= 5;
    lines.push(
      Math.abs(pct) < 5
        ? { icon: "〰️", text: `Last 3 days ${kcal(d3)}, in line with your average.`, tone: "neutral" }
        : pct > 0
          ? { icon: "⬆️", text: `Last 3 days ${kcal(d3)}, ${pct}% above your average.`, tone: pct >= 15 ? "bad" : "warn" }
          : { icon: "⬇️", text: `Last 3 days ${kcal(d3)}, ${-pct}% below your average.`, tone: "good" },
    );
  }
  // ---- weight ----
  const lastW = weights[weights.length - 1];
  const week = weightMove(weights, 7);
  const month = weightMove(weights, 30);
  if (!lastW || daysBetween(lastW.date, today) > 7) lines.push({ icon: "⚖️", text: "No weigh-in in the past week, so no weight trend yet.", tone: "neutral" });
  else
    for (const [label, m] of [
      ["Past week", week],
      ["Past month", month],
    ] as const) {
      if (!m) {
        lines.push({ icon: "⚖️", text: `${label}: not enough weigh-ins to compare yet.`, tone: "neutral" });
        continue;
      }
      const sign = m.delta > 0 ? "+" : m.delta < 0 ? "−" : "±";
      const fast = label === "Past week" && m.delta <= -1 ? " (over 1 kg a week is fast: eat enough)" : "";
      lines.push({ icon: "⚖️", text: `${label}: ${sign}${kg(Math.abs(m.delta))} (${kg(m.from)} → ${kg(m.to)}), ${WORDS[m.move]}${fast}.`, tone: fast ? "warn" : TONE[m.move] });
    }
  // ---- one-line takeaway ----
  const moves = [week, month].filter((m) => m && lastW && daysBetween(lastW.date, today) <= 7).map((m) => m!.move);
  const losing = moves.some((m) => m.endsWith("loss")) && !moves.some((m) => m.endsWith("gain"));
  let take: Line | null = null;
  if (moves.includes("sharp-gain")) take = { icon: "🚨", text: "Weight is climbing fast: tighten calories this week.", tone: "bad" };
  else if (moves.includes("minor-gain") && (overBudget || runningHigh)) take = { icon: "⚠️", text: "A small creep up, and calories are running high: worth reining in.", tone: "warn" };
  else if (moves.includes("minor-gain")) take = { icon: "👀", text: "A small creep up: keep an eye on it.", tone: "warn" };
  else if (losing && !overBudget) take = { icon: "🌟", text: "Improving: weight is trending down. Keep going!", tone: "good" };
  else if (losing) take = { icon: "👍", text: "Weight is trending down, though calories are over budget.", tone: "good" };
  else if (moves.length && !overBudget && !runningHigh && lastCal) take = { icon: "✅", text: "Holding steady with calories in check.", tone: "good" };
  else if (runningHigh) take = { icon: "⚠️", text: "The last few days ran high: a lighter day or two keeps the average on track.", tone: "warn" };
  return { lines, take };
}
