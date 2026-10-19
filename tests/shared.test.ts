import { describe, expect, it } from "vitest";
import { addDays, closedThrough, daysBetween, gameDate, isDue, weekStart, weekday } from "../shared/dates";
import { bmi, bmiBand, ema, healthyRange, sma } from "../shared/health";
import { levelInfo, petStage, titleFor, xpToNext } from "../shared/levels";
import { priceOf, unitPrice, voucherApplies } from "../shared/pricing";
import { checkRule, DEFAULT_SETTINGS, limitPeriodStart, ruleProblem, streakMultiplier, type RuleInputs } from "../shared/rules";
import { buildPet, isPetColor, PET_COLORS, petPalette } from "../shared/petgrid";
import { EYES, isUnlocked, SPECIES } from "../shared/levels";
import { TEMPLATES } from "../worker/seed";
import { progressFor, type Stats } from "../worker/achievements";

describe("levels", () => {
  it("follows the XP curve", () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(150);
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toEqual({ level: 2, into: 0, needed: 150 });
    expect(levelInfo(250)).toEqual({ level: 3, into: 0, needed: 200 });
  });
  it("names titles and pet stages", () => {
    expect(titleFor(1)).toBe("Sprout");
    expect(titleFor(5)).toBe("Apprentice");
    expect(titleFor(22)).toBe("Champion");
    expect(petStage(1)).toBe(0);
    expect(petStage(3)).toBe(1);
    expect(petStage(10)).toBe(2);
    expect(petStage(35)).toBe(4);
  });
});

describe("dates", () => {
  const tz = "Asia/Singapore";
  it("treats the hours before day_start_hour as yesterday", () => {
    // 2026-10-19 01:30 SGT = 2026-10-18 17:30Z
    expect(gameDate(new Date("2026-10-18T17:30:00Z"), tz, 4)).toBe("2026-10-18");
    // 2026-10-19 04:30 SGT
    expect(gameDate(new Date("2026-10-18T20:30:00Z"), tz, 4)).toBe("2026-10-19");
  });
  it("closes a day only after the grace period", () => {
    // Day 10-18 ends 10-19 04:00 SGT; with 12h grace it closes at 10-19 16:00 SGT (08:00Z)
    expect(closedThrough(new Date("2026-10-19T07:59:00Z"), tz, 4, 12)).toBe("2026-10-17");
    expect(closedThrough(new Date("2026-10-19T08:01:00Z"), tz, 4, 12)).toBe("2026-10-18");
  });
  it("does calendar maths", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(daysBetween("2026-10-19", "2027-01-01")).toBe(74);
    expect(weekday("2026-10-19")).toBe(0); // Monday
    expect(weekday("2026-10-25")).toBe(6); // Sunday
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(isDue("1111100", "2026-10-24")).toBe(false); // Saturday
    expect(isDue("1111100", "2026-10-23")).toBe(true); // Friday
  });
});

describe("pricing", () => {
  const waiver = { id: 1, category: "Calorie Waiver", base_price: 80, tax: 3, voucher_ok: 1 };
  const leap = { id: 11, category: "Travel", base_price: 2000, tax: 1, voucher_ok: 0 };
  const all = { discount: 0.9, scope: "all", scope_values: null };
  const cat = { discount: 0.6, scope: "categories", scope_values: JSON.stringify(["Calorie Waiver"]) };
  it("applies tax then voucher", () => {
    expect(unitPrice(waiver)).toBe(240);
    expect(priceOf(waiver, 1, all)).toMatchObject({ unit: 240, subtotal: 240, total: 24, discount: 216 });
    expect(priceOf(waiver, 2, cat).total).toBe(192);
  });
  it("respects no-voucher items and scopes", () => {
    expect(voucherApplies(all, leap)).toBe(false);
    expect(priceOf(leap, 1, all).total).toBe(2000);
    expect(voucherApplies(cat, { ...waiver, category: "Travel" })).toBe(false);
    expect(voucherApplies({ discount: 0.5, scope: "items", scope_values: [1] }, waiver)).toBe(true);
  });
});

describe("voucher rules", () => {
  const base: RuleInputs = {
    today: "2026-10-21",
    values: [
      { metric_key: "csd", date: "2026-10-19", value: 20 },
      { metric_key: "csd", date: "2026-10-20", value: 23 },
      { metric_key: "csd", date: "2026-10-12", value: 99 }, // previous week
      { metric_key: "calories", date: "2026-10-20", value: 2100 },
      { metric_key: "weight", date: "2026-10-20", value: 54.8 },
    ],
    totals: { fasting: 1100 },
    monthEarned: 650,
    birthday: "10-21",
  };
  it("checks each rule type", () => {
    expect(checkRule({ t: "metric_week_sum", metric: "csd", min: 42 }, base).ok).toBe(true);
    expect(checkRule({ t: "metric_week_sum", metric: "csd", min: 44 }, base).ok).toBe(false);
    expect(checkRule({ t: "metric_total", metric: "fasting", min: 1080 }, base).ok).toBe(true);
    expect(checkRule({ t: "metric_recent", metric: "calories", max: 2267 }, base).ok).toBe(true);
    expect(checkRule({ t: "metric_recent", metric: "calories", max: 2000 }, base).ok).toBe(false);
    expect(checkRule({ t: "month_earned", min: 600 }, base).ok).toBe(true);
    expect(checkRule({ t: "birthday" }, base).ok).toBe(true);
    expect(checkRule({ t: "all", rules: [{ t: "metric_latest", metric: "weight", max: 55 }, { t: "metric_ema", metric: "calories", period: 30, max: 1800 }] }, base).ok).toBe(false);
    expect(checkRule(null, base).ok).toBe(true);
  });
  it("validates rule shapes and never throws on bad ones", () => {
    expect(ruleProblem({ t: "month_earned", min: 600 })).toBeNull();
    expect(ruleProblem({ t: "all", rules: [{ t: "metric_latest", metric: "weight", max: 55 }] })).toBeNull();
    expect(ruleProblem({ t: "all" })).toMatch(/rules/);
    expect(ruleProblem({ t: "metric_total", min: 5 })).toMatch(/metric/);
    expect(ruleProblem({ t: "nope" })).toMatch(/unknown/);
    expect(checkRule({ t: "all" } as never, base).ok).toBe(false);
  });
  it("finds limit periods", () => {
    expect(limitPeriodStart("per_week", "2026-10-21")).toBe("2026-10-19");
    expect(limitPeriodStart("per_month", "2026-10-21")).toBe("2026-10-01");
    expect(limitPeriodStart("infinite", "2026-10-21")).toBeNull();
  });
  it("caps the streak multiplier", () => {
    expect(streakMultiplier(DEFAULT_SETTINGS, 0)).toBe(1);
    expect(streakMultiplier(DEFAULT_SETTINGS, 10)).toBeCloseTo(1.2);
    expect(streakMultiplier(DEFAULT_SETTINGS, 100)).toBeCloseTo(1.5);
  });
});

describe("health", () => {
  it("computes BMI with Singapore cut-offs", () => {
    expect(bmi(66.5, 1.62)).toBeCloseTo(25.34, 2);
    expect(bmiBand(22.9).tone).toBe("good");
    expect(bmiBand(23).tone).toBe("warn");
    expect(bmiBand(27.5).tone).toBe("bad");
    const [lo, hi] = healthyRange(1.62);
    expect(lo).toBeCloseTo(48.55, 1);
    expect(hi).toBeCloseTo(60.1, 1);
  });
  it("computes moving averages like the old sheet", () => {
    expect(ema([1588], 30)).toEqual([1588]);
    const e = ema([1588, 1443], 30);
    expect(e[1]).toBeCloseTo(1588 + (2 / 31) * (1443 - 1588), 6);
    expect(sma([1588, 1443, 4574], 3)[2]).toBeCloseTo(2535, 6);
  });
});

describe("achievement progress", () => {
  const st: Stats = {
    quests_done: 12, perfect_days: 2, purchases: 1, chests_opened: 3, crits: 4, sprints_won: 0, goals_done: 0, revives: 0,
    level: 4, ap_balance: 300, streak: 5,
    metric: {
      weight: { days: 10, total: 650, first: 67, latest: 64.5, bestWeek: 0, bestUnderRun: 0, target: 55, direction: "down" },
      calories: { days: 9, total: 17000, bestWeek: 0, bestUnderRun: 6, target: 1800, direction: "down", first: 2000, latest: 1700 },
    },
  };
  it("reports [current, target]", () => {
    expect(progressFor({ t: "streak", n: 7 }, st, 1.62)).toEqual([5, 7]);
    expect(progressFor({ t: "weight_lost", kg: 3 }, st, 1.62)).toEqual([2.5, 3]);
    expect(progressFor({ t: "under_target_streak", metric: "calories", n: 7 }, st, 1.62)).toEqual([6, 7]);
    expect(progressFor({ t: "metric_target", metric: "weight" }, st, 1.62)).toEqual([0, 1]);
    expect(progressFor('{"t":"metric_days","metric":"weight","n":30}', st, 1.62)).toEqual([10, 30]);
    expect(progressFor({ t: "manual" }, st, 1.62)).toEqual([0, 1]);
  });
});

describe("pixel pet", () => {
  it("renders every species × stage × mood × accessory as a clean grid", () => {
    const moods = ["happy", "content", "meh", "sad", "fainted", "sleep", "blink"] as const;
    const hats = [null, "party", "crown", "wizard", "flower", "bow", "headband", "beanie", "cap"];
    for (const species of SPECIES.map((x) => x.id))
      for (const eyes of EYES.map((x) => x.id))
        for (const face of [null, "glasses", "sunnies"])
          for (let stage = 0; stage <= 4; stage++)
            for (const m of moods)
              for (const h of hats) {
                const g = buildPet(stage, m, h, { species, eyes, face });
                expect(g.length).toBeGreaterThanOrEqual(24);
                for (const row of g) expect(row.length).toBe(24);
                expect(g.join("")).toMatch(/o/);
              }
  });
  it("derives shades for custom colours", () => {
    expect(petPalette("pink").b).toBe(PET_COLORS.pink.b);
    const c = petPalette("#336699");
    expect(c.b).toBe("#336699");
    expect(c.l).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.d).toMatch(/^#[0-9a-f]{6}$/);
    expect(isPetColor("#336699")).toBe(true);
    expect(isPetColor("red")).toBe(false);
  });
});

describe("cosmetics", () => {
  it("unlocks free, level and chest items correctly", () => {
    expect(isUnlocked("beanie", [], 1)).toBe(true);
    expect(isUnlocked("crown", [], 39)).toBe(false);
    expect(isUnlocked("crown", [], 40)).toBe(true);
    expect(isUnlocked("bow", [], 99)).toBe(false);
    expect(isUnlocked("bow", ["bow"], 1)).toBe(true);
    expect(isUnlocked("nope", ["nope"], 99)).toBe(false);
  });
});

describe("templates", () => {
  it("every quest and voucher only uses trackers that exist in its template", () => {
    for (const [id, t] of Object.entries(TEMPLATES)) {
      const keys = t.content.metrics.map((m) => m.key);
      for (const q of t.content.quests) if (q.metric_key) expect(keys, `${id}: ${q.title}`).toContain(q.metric_key);
      for (const v of t.content.vouchers) {
        const r = v.rule as { metric?: string } | undefined;
        if (r?.metric) expect(keys, `${id}: ${v.name}`).toContain(r.metric);
      }
      for (const a of t.content.achievements) {
        const r = a.rule as { metric?: string };
        if (r.metric) expect(keys, `${id}: ${a.name}`).toContain(r.metric);
      }
      expect(keys).toContain("weight");
      expect(keys).toContain("calories");
      expect(t.content.shop.some((i) => i.effect === "heal:30")).toBe(true);
    }
  });
});
