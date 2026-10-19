// Game rules (defaults are editable in Settings → Game rules) and voucher rule checks.
import { addDays, monthStart, weekStart } from "./dates";
import { ema } from "./health";

export interface Settings {
  player_name: string;
  pet_name: string;
  pet_color: string;
  hat: string | null;
  hats: string[];
  height_m: number;
  birthday: string | null; // "MM-DD"
  timezone: string;
  day_start_hour: number; // before this hour it is still "yesterday"
  grace_hours: number; // hours after a day ends during which you can still tick it
  max_hp: number;
  crit_chance: number;
  crit_mult: number;
  streak_threshold: number; // share of due dailies needed to keep the streak alive
  streak_bonus_per_day: number;
  streak_bonus_cap: number;
  complete_heal: number;
  perfect_day_heal: number;
  perfect_day_chest_chance: number;
  faint_ap_pct: number;
  faint_min_ap: number;
  revive_quests: number;
  revive_hp: number;
  fainted_earn_mult: number;
  sound: boolean;
  theme: "auto" | "day" | "night";
  current_season: number;
}

export const DEFAULT_SETTINGS: Settings = {
  player_name: "Anson",
  pet_name: "Mochi",
  pet_color: "pink",
  hat: null,
  hats: [],
  height_m: 1.62,
  birthday: null,
  timezone: "Asia/Singapore",
  day_start_hour: 4,
  grace_hours: 12,
  max_hp: 100,
  crit_chance: 0.1,
  crit_mult: 2,
  streak_threshold: 0.8,
  streak_bonus_per_day: 0.02,
  streak_bonus_cap: 0.5,
  complete_heal: 2,
  perfect_day_heal: 10,
  perfect_day_chest_chance: 0.35,
  faint_ap_pct: 0.1,
  faint_min_ap: 20,
  revive_quests: 3,
  revive_hp: 50,
  fainted_earn_mult: 0.5,
  sound: true,
  theme: "auto",
  current_season: 1,
};

/** Keys the user may edit through the API (everything except internal bookkeeping). */
export const EDITABLE_SETTINGS = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== "current_season");

export const DIFFICULTY: Record<string, { ap: number; xp: number; hp: number; label: string }> = {
  trivial: { ap: 3, xp: 5, hp: 2, label: "Trivial" },
  easy: { ap: 5, xp: 10, hp: 3, label: "Easy" },
  medium: { ap: 10, xp: 20, hp: 5, label: "Medium" },
  hard: { ap: 20, xp: 35, hp: 8, label: "Hard" },
  epic: { ap: 40, xp: 60, hp: 12, label: "Epic" },
};

export function streakMultiplier(s: Settings, streak: number) {
  return 1 + Math.min(streak * s.streak_bonus_per_day, s.streak_bonus_cap);
}

// ---------------------------------------------------------------------------
// Voucher rules — optional JSON on a voucher that the app checks before letting you use it.
// ---------------------------------------------------------------------------
export type VoucherRule =
  | { t: "metric_week_sum"; metric: string; min: number }
  | { t: "metric_total"; metric: string; min: number }
  | { t: "metric_recent"; metric: string; max?: number; min?: number }
  | { t: "metric_latest"; metric: string; max?: number; min?: number }
  | { t: "metric_ema"; metric: string; period: number; max?: number; min?: number }
  | { t: "month_earned"; min: number }
  | { t: "birthday" }
  | { t: "all"; rules: VoucherRule[] };

export interface RuleInputs {
  today: string;
  values: { metric_key: string; date: string; value: number }[];
  totals: Record<string, number>;
  monthEarned: number;
  birthday: string | null;
}

export interface RuleResult {
  ok: boolean;
  text: string;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-SG");

function within(v: number, r: { min?: number; max?: number }) {
  return (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
}

function bound(r: { min?: number; max?: number }) {
  if (r.max !== undefined && r.min !== undefined) return `${fmt(r.min)}–${fmt(r.max)}`;
  return r.max !== undefined ? `≤ ${fmt(r.max)}` : `≥ ${fmt(r.min ?? 0)}`;
}

const RULE_TYPES = ["metric_week_sum", "metric_total", "metric_recent", "metric_latest", "metric_ema", "month_earned", "birthday", "all"];

/** Why a voucher rule is malformed (null if fine). */
export function ruleProblem(r: unknown, depth = 0): string | null {
  if (!r || typeof r !== "object" || Array.isArray(r)) return "must be an object like {\"t\":\"month_earned\",\"min\":600}";
  const o = r as Record<string, unknown>;
  if (!RULE_TYPES.includes(String(o.t))) return `unknown type "${o.t}" (use one of ${RULE_TYPES.join(", ")})`;
  if (o.t === "all") {
    if (depth > 3 || !Array.isArray(o.rules) || !o.rules.length) return '"all" needs a non-empty "rules" list';
    for (const x of o.rules) {
      const why = ruleProblem(x, depth + 1);
      if (why) return why;
    }
    return null;
  }
  if (String(o.t).startsWith("metric") && (typeof o.metric !== "string" || !o.metric)) return `"${o.t}" needs "metric"`;
  if (o.t === "metric_ema" && !(Number(o.period) > 0)) return '"metric_ema" needs a positive "period"';
  if (o.t !== "birthday" && o.min === undefined && o.max === undefined) return `"${o.t}" needs "min" or "max"`;
  for (const k of ["min", "max"]) if (o[k] !== undefined && !Number.isFinite(Number(o[k]))) return `"${k}" must be a number`;
  return null;
}

export function checkRule(rule: VoucherRule | null | undefined, inp: RuleInputs): RuleResult {
  try {
    return evalRule(rule, inp);
  } catch {
    return { ok: false, text: "this voucher's rule is broken: edit it" };
  }
}

function evalRule(rule: VoucherRule | null | undefined, inp: RuleInputs): RuleResult {
  if (!rule) return { ok: true, text: "" };
  const series = (m: string) =>
    inp.values.filter((v) => v.metric_key === m).sort((a, b) => (a.date < b.date ? -1 : 1));
  switch (rule.t) {
    case "metric_week_sum": {
      const ws = weekStart(inp.today);
      const sum = series(rule.metric)
        .filter((v) => v.date >= ws && v.date <= inp.today)
        .reduce((a, v) => a + v.value, 0);
      return { ok: sum >= rule.min, text: `${rule.metric} this week ${fmt(sum)}/${fmt(rule.min)}` };
    }
    case "metric_total": {
      const sum = inp.totals[rule.metric] ?? 0;
      return { ok: sum >= rule.min, text: `${rule.metric} total ${fmt(sum)}/${fmt(rule.min)}` };
    }
    case "metric_recent": {
      const from = addDays(inp.today, -1);
      const recent = series(rule.metric).filter((v) => v.date >= from && v.date <= inp.today);
      const last = recent[recent.length - 1];
      if (!last) return { ok: false, text: `log ${rule.metric} today/yesterday first` };
      return { ok: within(last.value, rule), text: `${rule.metric} ${fmt(last.value)} (need ${bound(rule)})` };
    }
    case "metric_latest": {
      const s = series(rule.metric);
      const last = s[s.length - 1];
      if (!last) return { ok: false, text: `no ${rule.metric} logged yet` };
      return { ok: within(last.value, rule), text: `${rule.metric} ${fmt(last.value)} (need ${bound(rule)})` };
    }
    case "metric_ema": {
      const s = series(rule.metric).map((v) => v.value);
      if (!s.length) return { ok: false, text: `no ${rule.metric} logged yet` };
      const e = ema(s, rule.period).at(-1)!;
      return { ok: within(e, rule), text: `${rule.metric} ${rule.period}EMA ${fmt(e)} (need ${bound(rule)})` };
    }
    case "month_earned": {
      return {
        ok: inp.monthEarned >= rule.min,
        text: `AP earned this month ${fmt(inp.monthEarned)}/${fmt(rule.min)}`,
      };
    }
    case "birthday": {
      const ok = !!inp.birthday && inp.today.slice(5) === inp.birthday;
      return { ok, text: inp.birthday ? `birthday ${inp.birthday}` : "set your birthday in Settings" };
    }
    case "all": {
      const parts = rule.rules.map((r) => evalRule(r, inp));
      return { ok: parts.every((p) => p.ok), text: parts.map((p) => (p.ok ? "✓ " : "✗ ") + p.text).join(" · ") };
    }
    default:
      return { ok: true, text: "" };
  }
}

export function parseRule(raw: unknown): VoucherRule | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as VoucherRule;
  try {
    return JSON.parse(String(raw)) as VoucherRule;
  } catch {
    return null;
  }
}

/** Start date of the period a voucher limit counts over. */
export function limitPeriodStart(limitType: string, today: string): string | null {
  if (limitType === "per_week") return weekStart(today);
  if (limitType === "per_month") return monthStart(today);
  if (limitType === "once") return "0000-00-00";
  return null;
}
