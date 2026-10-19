// Builds the full game state the UI renders from (one batched read).
import { addDays, monthStart } from "../shared/dates";
import { levelInfo, petStage, titleFor } from "../shared/levels";
import { checkRule, limitPeriodStart, parseRule, streakMultiplier, type RuleInputs } from "../shared/rules";
import type { Achievement, GameState, Goal, LedgerRow, Sprint } from "../shared/types";
import { rows, stmt } from "./db";
import { progressFor, seasonStats } from "./achievements";
import type { Ctx } from "./game";
import { goalPct } from "./progress";

export async function buildState(ctx: Ctx, version: string): Promise<GameState> {
  const db = ctx.db;
  const S = ctx.season;
  const t = ctx.today;
  const res = await db.batch([
    db.prepare("SELECT * FROM seasons ORDER BY id"), // 0
    db.prepare("SELECT * FROM quests ORDER BY sort, id"), // 1
    stmt(
      db,
      `SELECT l.id, l.quest_id, l.date, l.qty, l.auto FROM quest_log l JOIN quests q ON q.id = l.quest_id
       WHERE l.date >= ? OR q.type = 'todo'`,
      addDays(t, -14),
    ), // 2
    db.prepare("SELECT * FROM metrics ORDER BY sort, key"), // 3
    stmt(db, "SELECT metric_key, date, value, note FROM metric_values WHERE date >= ? ORDER BY date", addDays(t, -400)), // 4
    db.prepare("SELECT metric_key, SUM(value) AS total FROM metric_values GROUP BY metric_key"), // 5
    db.prepare("SELECT * FROM shop_items ORDER BY sort, id"), // 6
    db.prepare("SELECT * FROM vouchers ORDER BY sort, id"), // 7
    stmt(db, "SELECT voucher_id, date FROM purchases WHERE season_id = ? AND voucher_id IS NOT NULL", S), // 8
    stmt(db, "SELECT item_id, SUM(qty) AS q FROM purchases WHERE season_id = ? GROUP BY item_id", S), // 9
    stmt(db, "SELECT item_id, SUM(qty) AS q FROM item_uses WHERE season_id = ? GROUP BY item_id", S), // 10
    stmt(db, "SELECT id, item_id, item_name, qty, total, voucher_name, date, note FROM purchases WHERE season_id = ? ORDER BY id DESC LIMIT 60", S), // 11
    stmt(db, "SELECT id, date, metric_key, item_id, value, status FROM obligations WHERE season_id = ? AND status = 'open' ORDER BY date", S), // 12
    stmt(db, "SELECT id, rarity, source, created_at FROM chests WHERE season_id = ? AND opened_at IS NULL ORDER BY id", S), // 13
    stmt(
      db,
      `SELECT a.*, u.unlocked_at,
         (SELECT COUNT(*) FROM achievement_unlocks p WHERE p.achievement_id = a.id AND p.season_id <> ?) AS past_seasons
       FROM achievements a LEFT JOIN achievement_unlocks u ON u.achievement_id = a.id AND u.season_id = ?
       ORDER BY a.sort, a.id`,
      S,
      S,
    ), // 14
    db.prepare("SELECT * FROM goals ORDER BY status = 'done', sort, id"), // 15
    db.prepare("SELECT * FROM milestones ORDER BY sort, id"), // 16
    db.prepare("SELECT * FROM sprints ORDER BY status <> 'active', end_date DESC LIMIT 30"), // 17
    db.prepare("SELECT * FROM sprint_tasks ORDER BY sort, id"), // 18
    db.prepare("SELECT * FROM events ORDER BY date"), // 19
    stmt(db, "SELECT id, ts, date, kind, ap, xp, hp, source, description, crit, voided FROM ledger WHERE season_id = ? ORDER BY id DESC LIMIT 250", S), // 20
    stmt(
      db,
      `SELECT COALESCE(SUM(ap),0) AS ap, COALESCE(SUM(xp),0) AS xp,
         COALESCE(SUM(CASE WHEN ap > 0 AND kind IN ('earn','bonus','loot') AND date = ? THEN ap END),0) AS today,
         COALESCE(SUM(CASE WHEN ap > 0 AND kind IN ('earn','bonus','loot') AND date >= ? THEN ap END),0) AS month
       FROM ledger WHERE season_id = ? AND voided = 0`,
      t,
      monthStart(t),
      S,
    ), // 21
    stmt(db, "SELECT date FROM rest_days WHERE date >= ?", addDays(t, -60)), // 22
    db.prepare(
      `SELECT m.metric_key, m.value FROM metric_values m
       JOIN (SELECT metric_key AS k, MIN(date) AS d FROM metric_values GROUP BY metric_key) f ON m.metric_key = f.k AND m.date = f.d`,
    ), // 23
  ]);

  const tot = res[21].results[0] as { ap: number; xp: number; today: number; month: number };
  const lv = levelInfo(tot.xp);
  const p = ctx.player;
  const values = rows<GameState["values"][number]>(res[4]);
  const totalsMap = Object.fromEntries(rows<{ metric_key: string; total: number }>(res[5]).map((r) => [r.metric_key, r.total]));
  const ruleIn: RuleInputs = { today: t, values, totals: totalsMap, monthEarned: tot.month, birthday: ctx.s.birthday };

  // Vouchers with usage + rule status
  const uses = rows<{ voucher_id: number; date: string }>(res[8]);
  const vouchers = rows<GameState["vouchers"][number]>(res[7]).map((v) => {
    const from = limitPeriodStart(v.limit_type, t);
    const used = from ? uses.filter((u) => u.voucher_id === v.id && u.date >= from).length : 0;
    const r = checkRule(parseRule(v.rule), ruleIn);
    return { ...v, used, rule_ok: r.ok, rule_text: r.text };
  });

  // Inventory
  const inventory: Record<number, number> = {};
  for (const r of rows<{ item_id: number; q: number }>(res[9])) inventory[r.item_id] = (inventory[r.item_id] ?? 0) + r.q;
  for (const r of rows<{ item_id: number; q: number }>(res[10])) inventory[r.item_id] = (inventory[r.item_id] ?? 0) - r.q;

  // Achievements with progress
  const stats = await seasonStats(ctx, tot);
  const achievements = rows<Achievement>(res[14]).map((a) => ({
    ...a,
    progress: a.unlocked_at ? null : progressFor(a.rule, stats, ctx.s.height_m),
  }));

  // Goals with milestones + percent
  const firstVals = new Map(rows<{ metric_key: string; value: number }>(res[23]).map((r) => [r.metric_key, r.value]));
  const latest = new Map<string, number>();
  for (const v of values) latest.set(v.metric_key, v.value);
  const milestones = rows<Goal["milestones"][number]>(res[16]);
  const goals = rows<Goal>(res[15]).map((g) => {
    const ms = milestones.filter((m) => m.goal_id === g.id);
    const pct = goalPct(g, ms, g.metric_key ? firstVals.get(g.metric_key) : undefined, g.metric_key ? latest.get(g.metric_key) : undefined);
    return { ...g, milestones: ms, pct: g.status === "done" ? 100 : pct };
  });

  const tasks = rows<Sprint["tasks"][number]>(res[18]);
  const sprints = rows<Sprint>(res[17]).map((s) => ({ ...s, tasks: tasks.filter((x) => x.sprint_id === s.id) }));

  const seasons = rows<GameState["seasons"][number]>(res[0]);
  const editable = [t, addDays(t, -1)].filter((d) => d > ctx.closed);

  return {
    version,
    today: t,
    closed: ctx.closed,
    editable,
    settings: ctx.s,
    season: seasons.find((s) => s.id === S) ?? { id: S, name: `Season ${S}`, started_at: t, ended_at: null, summary: null },
    seasons,
    player: {
      hp: p.hp,
      max_hp: ctx.s.max_hp,
      fainted: p.fainted,
      revive_progress: p.revive_progress,
      streak: p.streak,
      best_streak: p.best_streak,
      fast_started_at: p.fast_started_at,
      ap: tot.ap,
      xp: tot.xp,
      level: lv.level,
      into: lv.into,
      needed: lv.needed,
      title: titleFor(lv.level),
      stage: petStage(lv.level),
      mult: streakMultiplier(ctx.s, p.streak) * (p.fainted ? ctx.s.fainted_earn_mult : 1),
      earned_today: tot.today,
      month_earned: tot.month,
    },
    quests: rows(res[1]),
    log: rows(res[2]),
    metrics: rows(res[3]),
    values,
    totals: totalsMap,
    shop: rows(res[6]),
    vouchers,
    inventory,
    purchases: rows(res[11]),
    obligations: rows(res[12]),
    chests: rows(res[13]),
    achievements,
    goals,
    sprints,
    events: rows(res[19]),
    ledger: rows<LedgerRow>(res[20]),
    rest_days: rows<{ date: string }>(res[22]).map((r) => r.date),
    stats: {
      quests_done: stats.quests_done,
      perfect_days: stats.perfect_days,
      chests_opened: stats.chests_opened,
      crits: stats.crits,
      purchases: stats.purchases,
      sprints_won: stats.sprints_won,
      goals_done: stats.goals_done,
    },
  };
}
