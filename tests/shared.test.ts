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
import { countWords, emptyDoc, NOTE_FONTS, sanitizeDoc, summarize } from "../shared/notedoc";
import { drainHp, PRIORITIES, PRIORITY_ORDER, priorityOf, todoPay } from "../shared/priority";
import { describeRepeat, nextOccurrence, occursOn, parseRepeat, questDue, repeatProblem, type Repeat } from "../shared/schedule";
import { _forTests } from "../src/export";

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
    level: 4, ap_balance: 300, streak: 5, notes: 7,
    metric: {
      weight: { days: 10, total: 650, first: 67, latest: 64.5, bestWeek: 0, bestUnderRun: 0, target: 55, direction: "down" },
      calories: { days: 9, total: 17000, bestWeek: 0, bestUnderRun: 6, target: 1800, direction: "down", first: 2000, latest: 1700 },
      journal: { days: 4, total: 1200, bestWeek: 900, bestUnderRun: 0, bestRun: 3, target: 30, direction: "up" },
    },
  };
  it("reports [current, target]", () => {
    expect(progressFor({ t: "streak", n: 7 }, st, 1.62)).toEqual([5, 7]);
    expect(progressFor({ t: "weight_lost", kg: 3 }, st, 1.62)).toEqual([2.5, 3]);
    expect(progressFor({ t: "under_target_streak", metric: "calories", n: 7 }, st, 1.62)).toEqual([6, 7]);
    expect(progressFor({ t: "metric_target", metric: "weight" }, st, 1.62)).toEqual([0, 1]);
    expect(progressFor('{"t":"metric_days","metric":"weight","n":30}', st, 1.62)).toEqual([10, 30]);
    expect(progressFor({ t: "manual" }, st, 1.62)).toEqual([0, 1]);
    expect(progressFor({ t: "metric_streak", metric: "journal", n: 7 }, st, 1.62)).toEqual([3, 7]);
    expect(progressFor({ t: "metric_total", metric: "journal", n: 10000 }, st, 1.62)).toEqual([1200, 10000]);
    expect(progressFor({ t: "notes", n: 25 }, st, 1.62)).toEqual([7, 25]);
  });
});

describe("repeat schedules", () => {
  const upcoming = (r: Repeat, after: string, n = 4) => {
    const out: string[] = [];
    let d: string | null = after;
    while (out.length < n && (d = nextOccurrence(r, d!))) out.push(d);
    return out;
  };
  it("monthly on the 26th (and the 31st clamps to short months)", () => {
    expect(upcoming({ t: "monthday", n: 1, day: 26, from: "2026-10-01" }, "2026-10-26")).toEqual(["2026-11-26", "2026-12-26", "2027-01-26", "2027-02-26"]);
    expect(upcoming({ t: "monthday", n: 1, day: 31, from: "2026-01-01" }, "2027-01-31", 2)).toEqual(["2027-02-28", "2027-03-31"]);
    expect(upcoming({ t: "monthday", n: 1, day: -1, from: "2028-01-01" }, "2028-01-31", 1)).toEqual(["2028-02-29"]);
    expect(upcoming({ t: "monthday", n: 3, day: 1, from: "2026-11-01" }, "2026-10-01", 3)).toEqual(["2026-11-01", "2027-02-01", "2027-05-01"]);
  });
  it("alternate Sundays and every N days", () => {
    const alt: Repeat = { t: "weeks", n: 2, days: "0000001", from: "2026-11-01" }; // Sunday 1 Nov
    expect(upcoming(alt, "2026-10-28")).toEqual(["2026-11-01", "2026-11-15", "2026-11-29", "2026-12-13"]);
    expect(occursOn(alt, "2026-11-08")).toBe(false);
    expect(upcoming({ t: "days", n: 3, from: "2026-10-28" }, "2026-10-27", 3)).toEqual(["2026-10-28", "2026-10-31", "2026-11-03"]);
  });
  it("Nth / last weekday of the month, and yearly", () => {
    expect(upcoming({ t: "monthweek", n: 1, week: 2, weekday: 6, from: "2026-10-01" }, "2026-10-01", 2)).toEqual(["2026-10-11", "2026-11-08"]); // 2nd Sunday
    expect(upcoming({ t: "monthweek", n: 1, week: -1, weekday: 4, from: "2026-10-01" }, "2026-10-01", 2)).toEqual(["2026-10-30", "2026-11-27"]); // last Friday
    expect(upcoming({ t: "yearly", month: 2, day: 29, from: "2026-01-01" }, "2026-01-01", 2)).toEqual(["2026-02-28", "2027-02-28"]);
  });
  it("describes, validates and falls back to weekday masks", () => {
    expect(describeRepeat({ t: "weeks", n: 2, days: "0000001", from: "2026-11-01" })).toBe("Every other week on Sun");
    expect(describeRepeat({ t: "monthday", n: 1, day: 26, from: "2026-11-01" })).toBe("Monthly on the 26th");
    expect(describeRepeat({ t: "monthweek", n: 1, week: 2, weekday: 6, from: "2026-11-01" })).toBe("Monthly on the 2nd Sun");
    expect(repeatProblem({ t: "weeks", n: 2, days: "0000000", from: "2026-11-01" })).toMatch(/weekday/);
    expect(repeatProblem({ t: "monthday", n: 1, day: 40, from: "2026-11-01" })).toMatch(/day/);
    expect(repeatProblem({ t: "nope", from: "2026-11-01" })).toMatch(/unknown/);
    expect(parseRepeat("{bad json")).toBeNull();
    expect(questDue({ days: "1111100", repeat_rule: null }, "2026-10-31")).toBe(false); // Saturday, weekdays only
    expect(questDue({ days: "1111111", repeat_rule: JSON.stringify({ t: "monthday", n: 1, day: 26, from: "2026-01-01" }) }, "2026-10-26")).toBe(true);
    expect(questDue({ days: "1111111", repeat_rule: JSON.stringify({ t: "monthday", n: 1, day: 26, from: "2026-01-01" }) }, "2026-10-27")).toBe(false);
  });
});

describe("spreadsheet export", () => {
  const { buildSheets, sheetXml, csv, serial, colName } = _forTests;
  const tables = {
    settings: [{ key: "player_name", value: '"Anson"' }, { key: "current_season", value: "1" }, { key: "height_m", value: "1.62" }],
    seasons: [{ id: 1, name: "Season 1", started_at: "2026-10-01" }],
    player: [{ best_streak: 4 }],
    metrics: [{ key: "weight", name: "Weight", unit: "kg", sort: 1 }, { key: "calories", name: "Calories", unit: "kcal", sort: 2 }],
    metric_values: [
      { metric_key: "weight", date: "2026-10-02", value: 66.5 },
      { metric_key: "calories", date: "2026-10-02", value: 1800 },
      { metric_key: "weight", date: "2026-10-01", value: 67 },
    ],
    ledger: [
      { id: 1, date: "2026-10-01", ts: "x", kind: "earn", ap: 10, xp: 20, hp: 0, description: "=HYPERLINK(evil)", voided: 0, season_id: 1 },
      { id: 2, date: "2026-10-02", ts: "x", kind: "spend", ap: -4, xp: 0, hp: 0, description: 'Bubble tea, "large"', voided: 0, season_id: 1 },
    ],
    notes: [{ notebook_id: 1, title: "CET", doc: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Gym 7pm" }] }] }), labels: null, words: 2 }],
    notebooks: [{ id: 1, name: "Notes" }],
  };
  const sheets = buildSheets(tables as never);
  const by = (n: string) => sheets.find((s) => s.name === n)!;
  it("builds friendly sheets (trackers by date with BMI, running AP balance, note text)", () => {
    expect(by("Trackers").head).toEqual(["Date", "Weight (kg)", "Calories (kcal)", "BMI"]);
    expect(by("Trackers").rows).toEqual([
      [{ date: "2026-10-01" }, 67, null, 25.5],
      [{ date: "2026-10-02" }, 66.5, 1800, 25.3],
    ]);
    expect(by("AP ledger").rows.map((r) => r[8])).toEqual([10, 6]);
    expect(by("Notes").rows[0].at(-1)).toBe("Gym 7pm");
  });
  it("exports just a date period (balance still counts what came before)", () => {
    const p = buildSheets(tables as never, { from: "2026-10-02", to: "2026-10-31" });
    const get = (n: string) => p.find((s) => s.name === n)!;
    expect(get("Trackers").rows).toEqual([[{ date: "2026-10-02" }, 66.5, 1800, 25.3]]);
    expect(get("AP ledger").rows.map((r) => [r[5], r[8]])).toEqual([[-4, 6]]);
    const summary = Object.fromEntries(get("Summary").rows.filter((r) => r[0]).map((r) => [r[0], r[1]]));
    expect(summary.Period).toBe("2026-10-02 to 2026-10-31");
    expect(summary["AP spent / lost"]).toBe(4);
    expect(summary["AP earned"]).toBe(0);
    expect(summary["Days weighed"]).toBe(1);
    expect(get("Notes").rows.length).toBe(0); // the note has no dates in this period
  });
  it("writes valid cells and safe CSV", () => {
    expect(colName(0)).toBe("A");
    expect(colName(27)).toBe("AB");
    expect(serial("2026-10-28")).toBe(46323); // Excel's day number for 28 Oct 2026
    const xml = sheetXml(by("AP ledger"));
    expect(xml).toContain("&quot;large&quot;");
    expect(xml).not.toContain("<f>"); // text is never written as a formula
    const out = csv(by("AP ledger"));
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain(`"'=HYPERLINK(evil)"`);
    expect(out).toContain(`"Bubble tea, ""large"""`);
  });
});

describe("to-do priorities", () => {
  it("pays half when late and a bonus for scheduled work done early", () => {
    expect(todoPay("do", "2026-10-22", "2026-10-23")).toMatchObject({ mult: 0.5 });
    expect(todoPay("schedule", "2026-10-25", "2026-10-22")).toMatchObject({ mult: 1.25 });
    expect(todoPay("do", "2026-10-25", "2026-10-22")).toMatchObject({ mult: 1 }); // no early bonus for urgent work
    expect(todoPay("schedule", "2026-10-22", "2026-10-22")).toMatchObject({ mult: 1 });
    expect(todoPay(null, null, "2026-10-22")).toMatchObject({ mult: 1 });
  });
  it("defines the four quadrants", () => {
    expect(PRIORITY_ORDER.map((p) => PRIORITIES[p].hp)).toEqual([10, 6, 3, 0]);
    expect(priorityOf("nope")).toBeNull();
    expect(drainHp(10)).toBe(5);
    expect(drainHp(3)).toBe(2);
  });
});

describe("notes", () => {
  const p = (text: string, marks?: object[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
  it("keeps only whitelisted nodes, marks and styles", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        p("hi", [{ type: "bold" }, { type: "evil" }, { type: "textStyle", attrs: { color: "red; background:url(x)", fontFamily: '"Patrick Hand", cursive', fontSize: "99px" } }]),
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        p("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        p("y", [{ type: "link", attrs: { href: "https://example.com", onclick: "x" } }]),
        { type: "image", attrs: { media: 5, size: "huge", onerror: "x" } },
        { type: "image", attrs: { src: "https://evil/x.png" } },
        { type: "paragraph", content: [{ type: "text", text: "" }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("done")] }] },
      ],
    });
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/evil|script|alert|javascript|onerror|onclick|99px|url\(/);
    expect(doc.content![0].content![0].marks).toEqual([{ type: "bold" }, { type: "textStyle", attrs: { fontFamily: NOTE_FONTS.find((f) => f.id === "hand")!.css } }]);
    expect(doc.content![1].content![0].marks).toBeUndefined(); // unsafe link dropped, text kept
    expect(doc.content![2].content![0].marks).toEqual([{ type: "link", attrs: { href: "https://example.com" } }]);
    expect(doc.content![3]).toEqual({ type: "image", attrs: { media: 5 } }); // bad size dropped; src-only image removed
    expect(sanitizeDoc("nope")).toEqual(emptyDoc());
    expect(sanitizeDoc({ type: "doc", content: [] })).toEqual(emptyDoc());
  });
  it("summarises text, words, media, tasks and a short preview", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "CET 20 Oct" }] },
        p("Gym at 7pm, then aikido. It’s fine"),
        { type: "image", attrs: { media: 3 } },
        { type: "audio", attrs: { media: 4, duration: 12 } },
        { type: "taskList", content: [1, 2, 3].map((i) => ({ type: "taskItem", attrs: { checked: i === 1 }, content: [p(`task ${i}`)] })) },
        ...Array.from({ length: 20 }, (_, i) => p(`line ${i} ${"word ".repeat(30)}`)),
      ],
    });
    const s = summarize(doc);
    expect(s.media).toEqual([3, 4]);
    expect(s.images).toEqual([3]);
    expect(s.audio).toBe(1);
    expect(s.tasks).toEqual([1, 3]);
    expect(s.text.startsWith("CET 20 Oct\nGym at 7pm")).toBe(true);
    expect(s.words).toBe(3 + 7 + 6 + 20 * 32);
    const prev = JSON.stringify(s.preview);
    expect(prev).not.toMatch(/"image"|"audio"/);
    expect(prev.length).toBeLessThan(JSON.stringify(doc).length / 3);
    expect(countWords("Dear diary, today was GREAT!")).toBe(5);
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
  }, 30_000); // ~14,000 pets: give slow or busy machines time
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
