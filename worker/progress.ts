// Life goals (with milestones or tracker targets) and sprints ("boss raids").
import { all, first, HttpError, notFound, rows, stmt } from "./db";
import { award, chestStmt, ledgerStmt, voidLedger, type Ctx } from "./game";

interface GoalRow {
  id: number;
  title: string;
  emoji: string;
  status: string;
  mode: string;
  progress: number;
  metric_key: string | null;
  start_value: number | null;
  target_value: number | null;
  ap: number;
  xp: number;
  rewarded_season: number | null;
}

/** Percent complete for a goal (0-100). */
export function goalPct(
  g: Pick<GoalRow, "mode" | "progress" | "start_value" | "target_value">,
  ms: { done_at: string | null }[],
  firstValue: number | undefined,
  latest: number | undefined,
): number {
  if (g.mode === "milestones") return ms.length ? (100 * ms.filter((m) => m.done_at).length) / ms.length : 0;
  if (g.mode === "metric") {
    const start = g.start_value ?? firstValue;
    if (start === undefined || latest === undefined || g.target_value === null) return 0;
    if (start === g.target_value) return latest === start ? 100 : 0;
    return Math.max(0, Math.min(100, (100 * (start - latest)) / (start - g.target_value)));
  }
  return Math.max(0, Math.min(100, g.progress));
}

const chestSource = (g: { title: string }) => `Goal: ${g.title}`;

async function completeGoal(ctx: Ctx, g: GoalRow) {
  // Atomic claim: only the request that flips it to done pays out, and only once per season.
  const r = await stmt(ctx.db, "UPDATE goals SET status = 'done', completed_at = ? WHERE id = ? AND status <> 'done'", ctx.today, g.id).run();
  if (!r.meta.changes) return;
  if (g.rewarded_season === ctx.season) {
    ctx.fx.push({ t: "toast", msg: `“${g.title}” done again (its reward was already collected).`, emoji: g.emoji });
    return;
  }
  await ctx.db.batch([
    stmt(ctx.db, "UPDATE goals SET rewarded_season = ? WHERE id = ?", ctx.season, g.id),
    ledgerStmt(ctx, { kind: "bonus", ap: g.ap, xp: g.xp, source: "goal", ref_id: g.id, description: `🎯 Goal complete: ${g.title}`, fx: false }),
    chestStmt(ctx, "legendary", chestSource(g)),
  ]);
  ctx.fx.push({ t: "goal", title: g.title, emoji: g.emoji });
}

/** Auto-completes goals whose tracker target or milestones are all reached. */
export async function checkGoals(ctx: Ctx) {
  const db = ctx.db;
  const [gR, mR, vR] = await db.batch([
    db.prepare("SELECT * FROM goals WHERE status = 'active'"),
    db.prepare("SELECT goal_id, done_at FROM milestones WHERE goal_id IN (SELECT id FROM goals WHERE status = 'active')"),
    db.prepare(
      `SELECT metric_key,
         (SELECT value FROM metric_values f WHERE f.metric_key = v.metric_key ORDER BY date ASC LIMIT 1) AS first_value,
         (SELECT value FROM metric_values l WHERE l.metric_key = v.metric_key ORDER BY date DESC LIMIT 1) AS latest
       FROM (SELECT DISTINCT metric_key FROM goals WHERE status = 'active' AND mode = 'metric' AND metric_key IS NOT NULL) v`,
    ),
  ]);
  const ms = rows<{ goal_id: number; done_at: string | null }>(mR);
  const vals = new Map(rows<{ metric_key: string; first_value: number; latest: number }>(vR).map((v) => [v.metric_key, v]));
  for (const g of rows<GoalRow>(gR)) {
    // Only tracker goals finish by themselves; milestone/manual goals are claimed with a tap.
    if (g.mode !== "metric") continue;
    const mine = ms.filter((m) => m.goal_id === g.id);
    const v = g.metric_key ? vals.get(g.metric_key) : undefined;
    if (goalPct(g, mine, v?.first_value ?? undefined, v?.latest ?? undefined) >= 100) await completeGoal(ctx, g);
  }
}

export async function setGoalStatus(ctx: Ctx, id: number, status: "done" | "active" | "dropped") {
  const g = await first<GoalRow>(ctx.db, "SELECT * FROM goals WHERE id = ?", id);
  if (!g) throw notFound("Goal not found");
  if (status === "done") {
    if (g.status === "done") return;
    await completeGoal(ctx, g);
    return;
  }
  if (g.status === "done" && g.rewarded_season === ctx.season) {
    // Refund only if the legendary chest is still unopened; otherwise keep the reward (no farming).
    const chest = await first<{ id: number }>(
      ctx.db,
      "SELECT id FROM chests WHERE season_id = ? AND source = ? AND opened_at IS NULL ORDER BY id DESC LIMIT 1",
      ctx.season,
      chestSource(g),
    );
    if (chest) {
      const reward = await first<{ id: number }>(
        ctx.db,
        "SELECT id FROM ledger WHERE source = 'goal' AND ref_id = ? AND voided = 0 AND season_id = ? ORDER BY id DESC LIMIT 1",
        id,
        ctx.season,
      );
      if (reward) await voidLedger(ctx, reward.id, { silent: true });
      await ctx.db.batch([
        stmt(ctx.db, "DELETE FROM chests WHERE id = ?", chest.id),
        stmt(ctx.db, "UPDATE goals SET rewarded_season = NULL WHERE id = ?", id),
      ]);
    } else ctx.fx.push({ t: "toast", msg: "Goal reopened. Its chest was already opened, so the reward stays.", emoji: "🎯" });
  }
  await stmt(ctx.db, "UPDATE goals SET status = ?, completed_at = NULL WHERE id = ?", status, id).run();
}

export async function toggleMilestone(ctx: Ctx, id: number) {
  const m = await first<{ id: number; goal_id: number; title: string; ap: number; done_at: string | null }>(
    ctx.db,
    "SELECT * FROM milestones WHERE id = ?",
    id,
  );
  if (!m) throw notFound("Milestone not found");
  if (m.done_at) {
    await stmt(ctx.db, "UPDATE milestones SET done_at = NULL WHERE id = ?", id).run();
    const reward = await first<{ id: number }>(
      ctx.db,
      "SELECT id FROM ledger WHERE source = 'milestone' AND ref_id = ? AND voided = 0 AND season_id = ? ORDER BY id DESC LIMIT 1",
      id,
      ctx.season,
    );
    if (reward) await voidLedger(ctx, reward.id, { silent: true });
  } else {
    await stmt(ctx.db, "UPDATE milestones SET done_at = ? WHERE id = ?", ctx.today, id).run();
    await award(ctx, { kind: "bonus", ap: m.ap, xp: Math.round(m.ap / 2), source: "milestone", ref_id: id, description: `🚩 ${m.title}` });
  }
}

export async function toggleTask(ctx: Ctx, id: number) {
  const t = await first<{ id: number; sprint_id: number; title: string; dmg: number; done_at: string | null }>(
    ctx.db,
    "SELECT * FROM sprint_tasks WHERE id = ?",
    id,
  );
  if (!t) throw notFound("Task not found");
  const sp = await first<{ id: number; title: string; boss: string; status: string; ap: number; xp: number }>(
    ctx.db,
    "SELECT * FROM sprints WHERE id = ?",
    t.sprint_id,
  );
  if (!sp || sp.status !== "active") throw new HttpError(409, "This sprint is over");
  if (t.done_at) {
    await stmt(ctx.db, "UPDATE sprint_tasks SET done_at = NULL WHERE id = ?", id).run();
    return;
  }
  const hit = await stmt(ctx.db, "UPDATE sprint_tasks SET done_at = ? WHERE id = ? AND done_at IS NULL", ctx.today, id).run();
  if (!hit.meta.changes) return;
  ctx.fx.push({ t: "toast", msg: `Hit ${sp.boss} for ${t.dmg} damage!`, emoji: "💥" });
  const left = await all<{ id: number }>(ctx.db, "SELECT id FROM sprint_tasks WHERE sprint_id = ? AND done_at IS NULL", sp.id);
  if (left.length === 0) {
    // Only the request that flips the sprint to "won" pays out.
    const won = await stmt(ctx.db, "UPDATE sprints SET status = 'won' WHERE id = ? AND status = 'active'", sp.id).run();
    if (!won.meta.changes) return;
    await ctx.db.batch([
      ledgerStmt(ctx, { kind: "bonus", ap: sp.ap, xp: sp.xp, source: "sprint", ref_id: sp.id, description: `⚔️ Defeated ${sp.boss} (${sp.title})` }),
      chestStmt(ctx, "epic", `Sprint: ${sp.title}`),
    ]);
    ctx.fx.push({ t: "boss", title: sp.title, boss: sp.boss, won: true });
  }
}
