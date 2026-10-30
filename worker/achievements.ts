// Achievement rules: compute season stats once, then check every rule against them.
import { addDays, weekStart } from "../shared/dates";
import { bmi } from "../shared/health";
import { levelInfo, type Rarity } from "../shared/levels";
import { all, one, rows, stmt } from "./db";
import { chestStmt, ledgerStmt, type Ctx } from "./game";

export interface Stats {
  quests_done: number;
  perfect_days: number;
  purchases: number;
  chests_opened: number;
  crits: number;
  sprints_won: number;
  goals_done: number;
  revives: number;
  level: number;
  ap_balance: number;
  streak: number;
  notes: number;
  metric: Record<
    string,
    {
      days: number;
      total: number;
      first?: number;
      latest?: number;
      bestWeek: number;
      bestUnderRun: number;
      /** longest run of consecutive days with something logged */
      bestRun?: number;
      target: number | null;
      direction: string;
    }
  >;
}

export async function seasonStats(ctx: Ctx, tot: { ap: number; xp: number }): Promise<Stats> {
  const db = ctx.db;
  const S = ctx.season;
  const from = ctx.seasonStart;
  const res = await db.batch([
    // (deleted quests still count: their completions stay in your history)
    stmt(
      db,
      `SELECT COUNT(*) AS c FROM quest_log l LEFT JOIN quests q ON q.id = l.quest_id LEFT JOIN ledger g ON g.id = l.ledger_id
       WHERE l.season_id = ? AND COALESCE(q.polarity, CASE WHEN g.kind = 'penalty' THEN -1 ELSE 1 END) > 0`,
      S,
    ),
    // one pass over the season's ledger for every ledger-based counter
    stmt(
      db,
      `SELECT COALESCE(SUM(source = 'perfect'),0) AS perfect, COALESCE(SUM(crit = 1),0) AS crits,
              COALESCE(SUM(source = 'sprint'),0) AS sprints, COALESCE(SUM(source = 'goal'),0) AS goals,
              COALESCE(SUM(source = 'revive'),0) AS revives
       FROM ledger WHERE season_id = ? AND voided = 0`,
      S,
    ),
    stmt(db, "SELECT metric_key, date, value FROM metric_values WHERE date >= ? ORDER BY date", from),
    stmt(db, "SELECT COUNT(*) AS c FROM purchases WHERE season_id = ? AND ledger_id IS NOT NULL", S),
    stmt(db, "SELECT COUNT(*) AS c FROM chests WHERE season_id = ? AND opened_at IS NOT NULL", S),
    stmt(db, "SELECT key, target, direction FROM metrics"),
    db.prepare("SELECT COUNT(*) AS c FROM notes WHERE trashed_at IS NULL"),
  ]);
  const c = (i: number) => one<{ c: number }>(res[i])?.c ?? 0;
  const L = one<{ perfect: number; crits: number; sprints: number; goals: number; revives: number }>(res[1])!;
  const values = rows<{ metric_key: string; date: string; value: number }>(res[2]);
  const metric: Stats["metric"] = {};
  for (const m of rows<{ key: string; target: number | null; direction: string }>(res[5])) {
    const vs = values.filter((v) => v.metric_key === m.key);
    const weeks: Record<string, number> = {};
    let run = 0;
    let best = 0;
    let logRun = 0;
    let bestRun = 0;
    let prev: string | null = null;
    for (const v of vs) {
      weeks[weekStart(v.date)] = (weeks[weekStart(v.date)] ?? 0) + v.value;
      const next = !!prev && addDays(prev, 1) === v.date;
      const good = m.target !== null && v.value <= m.target;
      run = good ? (next ? run + 1 : 1) : 0;
      best = Math.max(best, run);
      logRun = next ? logRun + 1 : 1;
      bestRun = Math.max(bestRun, logRun);
      prev = v.date;
    }
    metric[m.key] = {
      days: vs.length,
      total: vs.reduce((a, v) => a + v.value, 0),
      first: vs[0]?.value,
      latest: vs.at(-1)?.value,
      bestWeek: Math.max(0, ...Object.values(weeks)),
      bestUnderRun: best,
      bestRun,
      target: m.target,
      direction: m.direction,
    };
  }
  return {
    quests_done: c(0),
    perfect_days: L.perfect,
    purchases: c(3),
    chests_opened: c(4),
    crits: L.crits,
    sprints_won: L.sprints,
    goals_done: L.goals,
    revives: L.revives,
    level: levelInfo(tot.xp).level,
    ap_balance: tot.ap,
    streak: Math.max(ctx.player.streak, ctx.player.best_streak),
    notes: c(6),
    metric,
  };
}

type Rule = { t: string; n?: number; metric?: string; kg?: number; value?: number };

/** [current, target] for a rule. Reached when current >= target. */
export function progressFor(ruleRaw: string | Rule, st: Stats, heightM: number): [number, number] {
  let r: Rule;
  try {
    r = typeof ruleRaw === "string" ? JSON.parse(ruleRaw) : ruleRaw;
  } catch {
    return [0, 1];
  }
  const n = r.n ?? 1;
  const m = r.metric ? st.metric[r.metric] : undefined;
  switch (r.t) {
    case "quests_done":
    case "perfect_days":
    case "purchases":
    case "chests_opened":
    case "crits":
    case "sprints_won":
    case "goals_done":
    case "revives":
    case "level":
    case "streak":
    case "notes":
      return [st[r.t] ?? 0, n];
    case "ap_balance":
      return [Math.max(0, st.ap_balance), n];
    case "metric_days":
      return [m?.days ?? 0, n];
    case "metric_total":
      return [Math.round(m?.total ?? 0), n];
    case "metric_week_sum":
      return [Math.round((m?.bestWeek ?? 0) * 10) / 10, n];
    case "under_target_streak":
      return [m?.bestUnderRun ?? 0, n];
    case "metric_streak":
      return [m?.bestRun ?? 0, n];
    case "weight_lost": {
      const w = st.metric.weight;
      const lost = w?.first !== undefined && w.latest !== undefined ? w.first - w.latest : 0;
      return [Math.max(0, Math.round(lost * 10) / 10), r.kg ?? 1];
    }
    case "metric_target": {
      if (!m || m.latest === undefined || m.target === null) return [0, 1];
      const ok = m.direction === "up" ? m.latest >= m.target : m.latest <= m.target;
      return [ok ? 1 : 0, 1];
    }
    case "bmi_below": {
      const w = st.metric.weight?.latest;
      return [w !== undefined && bmi(w, heightM) < (r.value ?? 23) ? 1 : 0, 1];
    }
    default:
      return [0, 1]; // "manual" and unknown rules are claimed by hand
  }
}

const TIER_CHEST: Record<string, Rarity | undefined> = { gold: "rare", platinum: "epic" };

/** Unlocks anything newly reached. Returns true if XP was awarded (caller re-checks level-ups). */
export async function evalAchievements(ctx: Ctx, tot: { ap: number; xp: number }): Promise<boolean> {
  const list = await all<{ id: number; name: string; emoji: string; rule: string; tier: string; ap: number; xp: number }>(
    ctx.db,
    `SELECT a.id, a.name, a.emoji, a.rule, a.tier, a.ap, a.xp FROM achievements a
     WHERE a.active = 1 AND NOT EXISTS
       (SELECT 1 FROM achievement_unlocks u WHERE u.achievement_id = a.id AND u.season_id = ?)`,
    ctx.season,
  );
  if (!list.length) return false;
  const st = await seasonStats(ctx, tot);
  const batch: D1PreparedStatement[] = [];
  let xp = 0;
  for (const a of list) {
    const [cur, target] = progressFor(a.rule, st, ctx.s.height_m);
    if (cur < target) continue;
    batch.push(stmt(ctx.db, "INSERT OR IGNORE INTO achievement_unlocks (achievement_id, season_id) VALUES (?,?)", a.id, ctx.season));
    batch.push(
      ledgerStmt(ctx, { kind: "bonus", ap: a.ap, xp: a.xp, source: "achievement", ref_id: a.id, description: `🏆 ${a.name}`, fx: false }),
    );
    const chest = TIER_CHEST[a.tier];
    if (chest) batch.push(chestStmt(ctx, chest, `Achievement: ${a.name}`));
    ctx.fx.push({ t: "achievement", name: a.name, emoji: a.emoji, tier: a.tier, ap: a.ap });
    xp += a.xp;
  }
  if (batch.length) await ctx.db.batch(batch);
  return xp > 0;
}

/** Manually claim an achievement with a "manual" rule (e.g. "Ran a half marathon"). */
export async function claimAchievement(ctx: Ctx, id: number) {
  const a = await ctx.db
    .prepare("SELECT id, name, emoji, rule, tier, ap, xp FROM achievements WHERE id = ?")
    .bind(id)
    .first<{ id: number; name: string; emoji: string; rule: string; tier: string; ap: number; xp: number }>();
  if (!a) throw new Error("Achievement not found");
  const done = await ctx.db
    .prepare("SELECT 1 FROM achievement_unlocks WHERE achievement_id = ? AND season_id = ?")
    .bind(id, ctx.season)
    .first();
  if (done) return;
  await ctx.db.batch([
    stmt(ctx.db, "INSERT INTO achievement_unlocks (achievement_id, season_id) VALUES (?,?)", id, ctx.season),
    ledgerStmt(ctx, { kind: "bonus", ap: a.ap, xp: a.xp, source: "achievement", ref_id: id, description: `🏆 ${a.name}`, fx: false }),
  ]);
  ctx.fx.push({ t: "achievement", name: a.name, emoji: a.emoji, tier: a.tier, ap: a.ap });
}
