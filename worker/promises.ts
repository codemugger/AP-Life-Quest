// Big 3: promise up to a few to-dos for today. Keeping one pays extra (see completeQuest);
// breaking one costs HP when the day closes (see processDay).
import { bad, first, HttpError, notFound, stmt } from "./db";
import type { Ctx } from "./game";

/** Minutes a promise can still be taken back (for a mis-tap); after that it's locked in. */
export const PROMISE_UNDO_MIN = 10;

export async function makePromise(ctx: Ctx, questId: number) {
  const q = await first<{ id: number; type: string; title: string; emoji: string; active: number }>(
    ctx.db,
    "SELECT id, type, title, emoji, active FROM quests WHERE id = ?",
    questId,
  );
  if (!q || q.type !== "todo" || !q.active) throw notFound("To-do not found");
  if (await first(ctx.db, "SELECT 1 AS x FROM quest_log WHERE quest_id = ?", questId)) throw bad("That one's already done");
  const n = (await first<{ c: number }>(ctx.db, "SELECT COUNT(*) AS c FROM promises WHERE date = ?", ctx.today))?.c ?? 0;
  if (n >= ctx.s.promise_max) throw bad(`You've already promised ${ctx.s.promise_max} for today`);
  const r = await stmt(
    ctx.db,
    "INSERT OR IGNORE INTO promises (date, quest_id, title, emoji, made_at, season_id) VALUES (?,?,?,?,?,?)",
    ctx.today,
    q.id,
    q.title,
    q.emoji,
    ctx.now.getTime(),
    ctx.season,
  ).run();
  if (!r.meta.changes) throw new HttpError(409, "Already promised");
  ctx.fx.push({ t: "toast", msg: `Promised for today: ${q.title}`, emoji: "🎯" });
}

export async function dropPromise(ctx: Ctx, questId: number) {
  const p = await first<{ made_at: number }>(ctx.db, "SELECT made_at FROM promises WHERE date = ? AND quest_id = ?", ctx.today, questId);
  if (!p) throw notFound("No such promise today");
  if (ctx.now.getTime() - p.made_at > PROMISE_UNDO_MIN * 60_000)
    throw bad("It's locked in. Finish it today, or it counts as broken tonight.");
  await stmt(ctx.db, "DELETE FROM promises WHERE date = ? AND quest_id = ?", ctx.today, questId).run();
}
