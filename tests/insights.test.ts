import { describe, expect, it } from "vitest";
import { addDays } from "../shared/dates";
import { bodyTrends, classify, weightMove, BANDS, type Pt } from "../src/insights";

const today = "2026-11-09";
const series = (vals: [number, number][]): Pt[] => vals.map(([back, value]) => ({ date: addDays(today, -back), value })).sort((a, b) => (a.date < b.date ? -1 : 1));
const daily = (n: number, f: (i: number) => number): Pt[] => Array.from({ length: n }, (_, i) => ({ date: addDays(today, i - n + 1), value: f(i) }));

describe("Body trends", () => {
  it("sorts weight changes into steady, minor and sharp", () => {
    expect(classify(0.2, BANDS.week)).toBe("steady");
    expect(classify(-0.5, BANDS.week)).toBe("minor-loss");
    expect(classify(0.7, BANDS.week)).toBe("sharp-gain");
    expect(classify(1.2, BANDS.month)).toBe("minor-gain");
    expect(classify(-2.4, BANDS.month)).toBe("sharp-loss");
    expect(classify(0.4, BANDS.month)).toBe("steady");
  });

  it("smooths weigh-ins, so one heavy morning isn't a trend", () => {
    // a week ago ~66 kg; this week 65.8 and 65.6, plus a heavy 66.9 three days back (outside the 'now' window)
    const w = series([
      [8, 66.1],
      [7, 66.0],
      [6, 65.9],
      [3, 66.9],
      [1, 65.8],
      [0, 65.6],
    ]);
    const m = weightMove(w, 7)!;
    expect(m.move).toBe("minor-loss");
    expect(m.delta).toBe(-0.3);
  });

  it("calls out a sharp gain and calories over budget", () => {
    const weights = series([
      [31, 63.0],
      [30, 63.2],
      [8, 64.4],
      [7, 64.6],
      [1, 65.5],
      [0, 65.7],
    ]);
    const calories = daily(30, (i) => (i < 27 ? 1900 : 2600));
    const { lines, take } = bodyTrends({ calories, weights, budget: 1800, today });
    const text = lines.map((l) => l.text).join(" | ");
    expect(text).toMatch(/30-day EMA .* over your 1,800 kcal budget/);
    expect(text).toMatch(/Last 3 days 2,600 kcal, \d+% above your average/);
    expect(text).toMatch(/Past week: \+1\.1 kg .* a sharp gain/);
    expect(text).toMatch(/Past month: \+2\.5 kg .* a sharp gain/);
    expect(take?.tone).toBe("bad");
  });

  it("praises steady progress under budget", () => {
    const weights = series([
      [30, 67.0],
      [7, 66.0],
      [0, 65.4],
    ]);
    const { lines, take } = bodyTrends({ calories: daily(30, () => 1700), weights, budget: 1800, today });
    expect(lines.some((l) => l.text.includes("under your 1,800 kcal budget") && l.tone === "good")).toBe(true);
    expect(lines.some((l) => l.text.startsWith("Past week: −0.6 kg") && l.text.includes("a minor loss"))).toBe(true);
    expect(take?.tone).toBe("good");
  });

  it("says so when there isn't enough to go on", () => {
    const { lines, take } = bodyTrends({ calories: [], weights: series([[20, 66]]), budget: 1800, today });
    expect(lines.map((l) => l.text)).toEqual(["No calories logged in the past week.", "No weigh-in in the past week, so no weight trend yet."]);
    expect(take).toBeNull();
  });
});
