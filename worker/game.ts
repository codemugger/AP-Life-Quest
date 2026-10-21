// Core game engine: context, rewards, quests, trackers and the nightly "close the day" pass.
import { addDays, closedThrough, daysBetween, gameDate, isDue, weekday, weekStart } from "../shared/dates";
import { LEVEL_HATS, levelInfo, titleFor, type Rarity } from "../shared/levels";
import { drainHp, OVERDUE_DAYS, priorityOf, todoPay } from "../shared/priority";
import { DEFAULT_SETTINGS, streakMultiplier, type Settings } from "../shared/rules";
import { unitPrice } from "../shared/pricing";
import type { Fx } from "../shared/types";
import { bad, clamp, first, all, hashFloat, HttpError, notFound, one, rand, rows, stmt } from "./db";
import { seedAll } from "./seeding";
import { evalAchievements } from "./achievements";
import { checkGoals } from "./progress";

export interface PlayerRow {
  hp: number;
  fainted: number;
  revive_progress: number;
  streak: number;
  best_streak: number;
  last_processed: string | null;
  fast_started_at: number | null;
  rewarded_level: number;
}

export interface Ctx {
  db: D1Database;
  s: Settings;
  season: number;
  seasonStart: string;
  now: Date;
  today: string;
  closed: string;
  player: PlayerRow;
  fx: Fx[];
  before: { ap: number; xp: number };
}

export interface QuestRow {
  id: number;
  type: string;
  title: string;
  emoji: string;
  ap: number;
  xp: number;
  hp_penalty: number;
  polarity: number;
  days: string;
  weekly_target: number;
  unit: string | null;
  metric_key: string | null;
  metric_op: string | null;
  metric_value: number | null;
  due_date: string | null;
  priority: string | null;
  active: number;
  created_at: string;
}

export interface ShopRow {
  id: number;
  name: string;
  emoji: string;
  category: string;
  base_price: number;
  tax: number;
  unit: string;
  voucher_ok: number;
  effect: string | null;
  trigger_metric: string | null;
  trigger_min: number | null;
  trigger_max: number | null;
  min_level: number;
  active: number;
}

const TOTALS_SQL =
  "SELECT COALESCE(SUM(ap),0) AS ap, COALESCE(SUM(xp),0) AS xp FROM ledger WHERE voided = 0 AND season_id = ?";

export function parseSettings(list: { key: string; value: string }[]): Settings {
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS, hats: [] };
  for (const { key, value } of list) {
    try {
      s[key] = JSON.parse(value);
    } catch {
      s[key] = value;
    }
  }
  if (!Array.isArray(s.hats)) s.hats = [];
  // Never let a bad value (e.g. from an imported backup) brick the app.
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof v === "number") s[k] = Number.isFinite(Number(s[k])) ? Number(s[k]) : v;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: String(s.timezone) });
  } catch {
    s.timezone = DEFAULT_SETTINGS.timezone;
  }
  s.day_start_hour = clamp(Math.round(s.day_start_hour as number), 0, 23);
  s.grace_hours = clamp(s.grace_hours as number, 0, 48);
  s.max_hp = Math.max(1, Math.round(s.max_hp as number));
  return s as unknown as Settings;
}

export async function loadCtx(db: D1Database, attempt = 0): Promise<Ctx> {
  const seasonSub = "(SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'current_season')";
  const [sRes, pRes, seasonRes, totRes] = await db.batch([
    db.prepare("SELECT key, value FROM settings"),
    db.prepare("SELECT * FROM player WHERE id = 1"),
    db.prepare(`SELECT id, started_at FROM seasons WHERE id = ${seasonSub}`),
    db.prepare(TOTALS_SQL.replace("?", seasonSub)),
  ]);
  if (!sRes.results.length || !pRes.results.length) {
    if (attempt > 1) throw new HttpError(500, "Could not initialise the database");
    try {
      await seedAll(db, { template: "starter" });
    } catch {
      // Another request seeded at the same time — just reload.
    }
    return loadCtx(db, attempt + 1);
  }
  const s = parseSettings(rows(sRes));
  const now = new Date();
  const season = one<{ id: number; started_at: string }>(seasonRes);
  return {
    db,
    s,
    season: s.current_season,
    seasonStart: season?.started_at ?? "0000-00-00",
    now,
    today: gameDate(now, s.timezone, s.day_start_hour),
    closed: closedThrough(now, s.timezone, s.day_start_hour, s.grace_hours),
    player: one<PlayerRow>(pRes)!,
    fx: [],
    before: one<{ ap: number; xp: number }>(totRes) ?? { ap: 0, xp: 0 },
  };
}

export async function totals(ctx: Ctx) {
  return (await first<{ ap: number; xp: number }>(ctx.db, TOTALS_SQL, ctx.season)) ?? { ap: 0, xp: 0 };
}

export function settingStmt(ctx: Ctx, key: string, value: unknown) {
  return stmt(ctx.db, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, JSON.stringify(value));
}

export function playerStmt(ctx: Ctx) {
  const p = ctx.player;
  return stmt(
    ctx.db,
    `UPDATE player SET hp=?, fainted=?, revive_progress=?, streak=?, best_streak=?, last_processed=?, fast_started_at=?, rewarded_level=? WHERE id = 1`,
    p.hp,
    p.fainted,
    p.revive_progress,
    p.streak,
    p.best_streak,
    p.last_processed,
    p.fast_started_at,
    p.rewarded_level,
  );
}

export const savePlayer = (ctx: Ctx) => playerStmt(ctx).run();

export interface LedgerEntry {
  kind: string;
  ap?: number;
  xp?: number;
  hp?: number;
  source: string;
  ref_id?: number | null;
  description: string;
  crit?: boolean;
  date?: string;
  fx?: boolean;
}

/** Builds a ledger INSERT and applies the HP change to the in-memory player (clamped). */
export function ledgerStmt(ctx: Ctx, e: LedgerEntry, returning = false) {
  let hp = Math.round(e.hp ?? 0);
  if (hp) {
    const before = ctx.player.hp;
    ctx.player.hp = clamp(before + hp, 0, ctx.s.max_hp);
    hp = ctx.player.hp - before;
  }
  const ap = Math.round(e.ap ?? 0);
  const xp = Math.round(e.xp ?? 0);
  if (e.fx !== false) {
    if (ap) ctx.fx.push({ t: "ap", v: ap, crit: e.crit });
    if (xp) ctx.fx.push({ t: "xp", v: xp });
    if (hp) ctx.fx.push({ t: "hp", v: hp });
  }
  return stmt(
    ctx.db,
    `INSERT INTO ledger (date, kind, ap, xp, hp, source, ref_id, description, crit, season_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)${returning ? " RETURNING id" : ""}`,
    e.date ?? ctx.today,
    e.kind,
    ap,
    xp,
    hp,
    e.source,
    e.ref_id ?? null,
    e.description,
    e.crit ? 1 : 0,
    ctx.season,
  );
}

export async function award(ctx: Ctx, e: LedgerEntry): Promise<number> {
  const r = await ledgerStmt(ctx, e, true).first<{ id: number }>();
  return r!.id;
}

export function chestStmt(ctx: Ctx, rarity: Rarity, source: string) {
  ctx.fx.push({ t: "chest", rarity, source });
  return stmt(ctx.db, "INSERT INTO chests (rarity, source, season_id) VALUES (?,?,?)", rarity, source, ctx.season);
}

export function assertOpenDay(ctx: Ctx, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad("Bad date");
  if (date > ctx.today) throw bad("That day hasn't happened yet");
  if (date <= ctx.closed) throw bad("That day is already closed — use a manual adjustment in the Log instead");
}

/** Runs after every mutation: goals, level-ups, achievements, fainting, then saves the player. */
export async function finalize(ctx: Ctx) {
  await checkGoals(ctx);
  for (let i = 0; i < 4; i++) {
    const after = await totals(ctx);
    // Rewards are paid once per level per season, so undo/redo across a level boundary can't farm chests.
    const lb = Math.max(levelInfo(ctx.before.xp).level, ctx.player.rewarded_level ?? 1);
    const la = levelInfo(after.xp).level;
    const batch: D1PreparedStatement[] = [];
    if (la > lb) {
      let hatsChanged = false;
      for (let L = lb + 1; L <= la; L++) {
        ctx.fx.push({ t: "levelup", level: L, title: titleFor(L) });
        const rarity: Rarity = L % 10 === 0 ? "legendary" : L % 5 === 0 ? "epic" : L % 2 === 0 ? "rare" : "common";
        batch.push(chestStmt(ctx, rarity, `Level ${L}`));
        const hat = LEVEL_HATS[L];
        if (hat && !ctx.s.hats.includes(hat)) {
          ctx.s.hats.push(hat);
          ctx.fx.push({ t: "hat", hat });
          hatsChanged = true;
        }
      }
      batch.push(ledgerStmt(ctx, { kind: "bonus", hp: ctx.s.max_hp, source: "levelup", description: `Reached level ${la} — full heal`, fx: false }));
      if (hatsChanged) batch.push(settingStmt(ctx, "hats", ctx.s.hats));
      ctx.player.rewarded_level = la;
    }
    if (batch.length) await ctx.db.batch(batch);
    ctx.before = after;
    const gainedXp = await evalAchievements(ctx, after);
    if (!gainedXp) break;
  }
  await maybeFaint(ctx);
  await savePlayer(ctx);
}

export async function maybeFaint(ctx: Ctx) {
  if (ctx.player.hp > 0 || ctx.player.fainted) return;
  const bal = (await totals(ctx)).ap;
  const lost = Math.max(ctx.s.faint_min_ap, Math.round(Math.max(0, bal) * ctx.s.faint_ap_pct));
  await award(ctx, {
    kind: "faint",
    ap: -lost,
    source: "faint",
    ref_id: ctx.player.streak, // remembered so undoing the faint can restore the streak
    description: `${ctx.s.pet_name} fainted! Lost ${lost} AP and the streak`,
    fx: false,
  });
  ctx.player.fainted = 1;
  ctx.player.revive_progress = 0;
  ctx.player.streak = 0;
  ctx.fx.push({ t: "fainted", ap_lost: lost });
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export async function completeQuest(ctx: Ctx, id: number, opts: { date?: string; qty?: number; auto?: boolean } = {}) {
  const q = await first<QuestRow>(ctx.db, "SELECT * FROM quests WHERE id = ?", id);
  if (!q) throw notFound("Quest not found");
  const date = opts.date ?? ctx.today;
  assertOpenDay(ctx, date);
  const qty = q.type === "habit" && q.unit ? clamp(Number(opts.qty) || 1, 0.1, 168) : 1;
  const qtyLabel = q.unit ? ` (${qty} ${q.unit})` : "";
  const exclusive = q.type === "daily" || q.type === "todo";
  // Repeatables: the n-th completion of the day gets its own (fixed) crit roll.
  const count = exclusive
    ? 0
    : ((await first<{ c: number }>(ctx.db, "SELECT COUNT(*) AS c FROM quest_log WHERE quest_id = ? AND date = ?", id, date))?.c ?? 0);
  // Claim the completion first in ONE statement, so double taps / two devices can't double-award.
  const claim = exclusive
    ? await stmt(
        ctx.db,
        `INSERT INTO quest_log (quest_id, date, qty, auto, season_id)
         SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM quest_log WHERE quest_id = ?${q.type === "todo" ? "" : " AND date = ?"})
         RETURNING id`,
        ...[q.id, date, qty, opts.auto ? 1 : 0, ctx.season, q.id, ...(q.type === "todo" ? [] : [date])],
      ).first<{ id: number }>()
    : await stmt(ctx.db, "INSERT INTO quest_log (quest_id, date, qty, auto, season_id) VALUES (?,?,?,?,?) RETURNING id", q.id, date, qty, opts.auto ? 1 : 0, ctx.season).first<{
        id: number;
      }>();
  if (!claim) throw new HttpError(409, "Already done");
  let ledgerId: number;
  try {
    if (q.polarity < 0) {
      ledgerId = await award(ctx, {
        kind: "penalty",
        ap: -q.ap * qty,
        hp: -q.hp_penalty * qty,
        source: "quest",
        ref_id: q.id,
        date,
        description: `${q.emoji} ${q.title}${qtyLabel}`,
      });
    } else {
      const p = ctx.player;
      const mult = streakMultiplier(ctx.s, p.streak) * (p.fainted ? ctx.s.fainted_earn_mult : 1);
      const crit = q.ap > 0 && hashFloat(`${q.id}|${date}|${count}`) < ctx.s.crit_chance;
      // to-dos: late = half pay; important ones finished early get a bonus
      const pay = q.type === "todo" ? todoPay(q.priority, q.due_date, date) : { mult: 1, tag: "" };
      const ap = Math.round(q.ap * qty * mult * pay.mult * (crit ? ctx.s.crit_mult : 1));
      ledgerId = await award(ctx, {
        kind: "earn",
        ap,
        xp: Math.round(q.xp * qty * Math.min(1, pay.mult)),
        hp: q.type === "habit" ? 0 : ctx.s.complete_heal,
        source: "quest",
        ref_id: q.id,
        date,
        crit,
        description: `${q.emoji} ${q.title}${qtyLabel}${pay.tag}${crit ? " — CRITICAL!" : ""}`,
      });
      if (p.fainted) {
        p.revive_progress++;
        if (p.revive_progress >= ctx.s.revive_quests) {
          p.fainted = 0;
          p.revive_progress = 0;
          await award(ctx, {
            kind: "bonus",
            hp: Math.max(0, ctx.s.revive_hp - p.hp),
            source: "revive",
            description: `${ctx.s.pet_name} is back on its feet!`,
            fx: false,
          });
          ctx.fx.push({ t: "revived" });
        }
      }
    }
  } catch (e) {
    await stmt(ctx.db, "DELETE FROM quest_log WHERE id = ?", claim.id).run();
    throw e;
  }
  await stmt(ctx.db, "UPDATE quest_log SET ledger_id = ? WHERE id = ?", ledgerId, claim.id).run();
}

export async function uncompleteQuest(ctx: Ctx, id: number, date?: string) {
  const log = date
    ? await first<{ id: number; date: string; ledger_id: number | null }>(
        ctx.db,
        "SELECT id, date, ledger_id FROM quest_log WHERE quest_id = ? AND date = ? ORDER BY id DESC LIMIT 1",
        id,
        date,
      )
    : await first<{ id: number; date: string; ledger_id: number | null }>(
        ctx.db,
        "SELECT id, date, ledger_id FROM quest_log WHERE quest_id = ? ORDER BY id DESC LIMIT 1",
        id,
      );
  if (!log) throw notFound("Nothing to undo");
  assertOpenDay(ctx, log.date);
  if (log.ledger_id) await voidLedger(ctx, log.ledger_id, { silent: true, crossSeason: true });
  await stmt(ctx.db, "DELETE FROM quest_log WHERE id = ?", log.id).run();
  if (ctx.player.fainted && ctx.player.revive_progress > 0) ctx.player.revive_progress--;
}

export async function voidLedger(ctx: Ctx, id: number, opts: { silent?: boolean; crossSeason?: boolean } = {}) {
  const row = await first<{ id: number; kind: string; ap: number; xp: number; hp: number; source: string; ref_id: number | null; voided: number; season_id: number }>(
    ctx.db,
    "SELECT id, kind, ap, xp, hp, source, ref_id, voided, season_id FROM ledger WHERE id = ?",
    id,
  );
  if (!row || (row.season_id !== ctx.season && !opts.crossSeason)) throw notFound("Ledger entry not found");
  if (row.voided) throw new HttpError(409, "Already voided");
  const here = row.season_id === ctx.season; // entries from an archived season don't touch the live player
  const batch = [stmt(ctx.db, "UPDATE ledger SET voided = 1 WHERE id = ?", id)];
  if (row.source === "quest") batch.push(stmt(ctx.db, "DELETE FROM quest_log WHERE ledger_id = ?", id));
  if (row.source === "shop") {
    const p = await first<{ id: number; item_id: number | null; qty: number }>(ctx.db, "SELECT id, item_id, qty FROM purchases WHERE ledger_id = ?", id);
    if (p) {
      if (p.item_id !== null && here) {
        const inv = await first<{ left: number; linked: number }>(
          ctx.db,
          `SELECT (SELECT COALESCE(SUM(qty),0) FROM purchases WHERE item_id = ? AND season_id = ?)
                - (SELECT COALESCE(SUM(qty),0) FROM item_uses WHERE item_id = ? AND season_id = ?) AS left,
                  (SELECT COALESCE(SUM(qty),0) FROM item_uses WHERE purchase_id = ?) AS linked`,
          p.item_id,
          ctx.season,
          p.item_id,
          ctx.season,
          p.id,
        );
        if (inv && inv.left - p.qty + inv.linked < -1e-9)
          throw bad("You've already used what you bought, so it can't be refunded. Use ± Adjust in the Log instead.");
      }
      batch.push(
        stmt(ctx.db, "DELETE FROM item_uses WHERE purchase_id = ?", p.id),
        stmt(ctx.db, "DELETE FROM purchases WHERE id = ?", p.id),
        stmt(ctx.db, "UPDATE obligations SET status = 'waived', resolved_at = ? WHERE purchase_id = ?", ctx.today, p.id),
      );
    }
  }
  const pl = ctx.player;
  if (here && row.hp) pl.hp = clamp(pl.hp - row.hp, 0, ctx.s.max_hp);
  if (here && row.kind === "faint") {
    pl.fainted = 0;
    pl.revive_progress = 0;
    if (row.ref_id !== null) pl.streak = Math.max(pl.streak, row.ref_id);
    if (pl.hp <= 0) pl.hp = 1;
  }
  await ctx.db.batch(batch);
  if (here && row.ap) ctx.fx.push({ t: "ap", v: -row.ap });
  // Undoing the thing that knocked you out also undoes the faint.
  if (here && row.kind !== "faint" && pl.fainted && pl.hp > 0) {
    const f = await first<{ id: number }>(
      ctx.db,
      "SELECT id FROM ledger WHERE season_id = ? AND kind = 'faint' AND voided = 0 AND id > ? ORDER BY id DESC LIMIT 1",
      ctx.season,
      id,
    );
    if (f) {
      await voidLedger(ctx, f.id, { silent: true });
      ctx.fx.push({ t: "toast", msg: `${ctx.s.pet_name} is back up: the faint was undone.`, emoji: "🐣" });
    }
  }
  if (!opts.silent) ctx.fx.push({ t: "toast", msg: "Entry voided", emoji: "↩️" });
}

// ---------------------------------------------------------------------------
// Trackers
// ---------------------------------------------------------------------------

interface MetricRow {
  key: string;
  name: string;
  mode: string;
  target: number | null;
}

export async function setMetric(
  ctx: Ctx,
  key: string,
  opts: { date?: string; value: number | null; mode?: string; note?: string | null },
) {
  const m = await first<MetricRow>(ctx.db, "SELECT key, name, mode, target FROM metrics WHERE key = ?", key);
  if (!m) throw notFound("Tracker not found");
  const date = opts.date ?? ctx.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad("Bad date");
  if (date > ctx.today) throw bad("That day hasn't happened yet");

  let val: number | null = null;
  if (opts.value === null || opts.value === undefined) {
    await stmt(ctx.db, "DELETE FROM metric_values WHERE metric_key = ? AND date = ?", key, date).run();
  } else {
    const v = Number(opts.value);
    if (!Number.isFinite(v) || Math.abs(v) > 1e7) throw bad("That number looks wrong");
    const note = opts.note ? String(opts.note).slice(0, 500) : null;
    const add = (opts.mode ?? m.mode) === "add";
    const r = await stmt(
      ctx.db,
      `INSERT INTO metric_values (metric_key, date, value, note) VALUES (?,?,?,?)
       ON CONFLICT(metric_key, date) DO UPDATE SET value = ${add ? "value + excluded.value" : "excluded.value"},
         note = COALESCE(excluded.note, note), updated_at = datetime('now')
       RETURNING value`,
      key,
      date,
      v,
      note,
    ).first<{ value: number }>();
    val = r?.value ?? null;
    if (add && val !== null && val <= 0) {
      await stmt(ctx.db, "DELETE FROM metric_values WHERE metric_key = ? AND date = ?", key, date).run();
      val = null;
    }
  }
  if (date > ctx.closed) await syncMetricQuests(ctx, m, date, val);
  await syncObligations(ctx, key, date, val);
  return val;
}

async function syncMetricQuests(ctx: Ctx, m: MetricRow, date: string, val: number | null) {
  const qs = await all<QuestRow>(
    ctx.db,
    "SELECT * FROM quests WHERE metric_key = ? AND active = 1 AND type IN ('daily','todo')",
    m.key,
  );
  if (!qs.length) return;
  const logs = await all<{ quest_id: number; auto: number; date: string }>(
    ctx.db,
    `SELECT l.quest_id, l.auto, l.date FROM quest_log l JOIN quests q ON q.id = l.quest_id
     WHERE q.metric_key = ? AND (l.date = ? OR q.type = 'todo')`,
    m.key,
    date,
  );
  for (const q of qs) {
    if (q.type === "daily" && !isDue(q.days, date)) continue;
    const th = q.metric_value ?? m.target;
    const op = q.metric_op || "logged";
    const ok =
      val !== null &&
      (op === "logged" || (th !== null && ((op === "<=" && val <= th) || (op === ">=" && val >= th))));
    const log = logs.find((l) => l.quest_id === q.id && (q.type === "todo" || l.date === date));
    if (ok && !log) await completeQuest(ctx, q.id, { date, auto: true });
    else if (!ok && log?.auto && log.date > ctx.closed) await uncompleteQuest(ctx, q.id, log.date);
  }
}

/** Calorie court: a value inside a shop item's trigger band means that ticket must be used. */
async function syncObligations(ctx: Ctx, key: string, date: string, val: number | null) {
  const triggers = await all<ShopRow>(ctx.db, "SELECT * FROM shop_items WHERE trigger_metric = ? AND active = 1", key);
  if (!triggers.length) return;
  const obs = await all<{ id: number; item_id: number; status: string; value: number }>(
    ctx.db,
    "SELECT id, item_id, status, value FROM obligations WHERE metric_key = ? AND date = ? AND season_id = ?",
    key,
    date,
    ctx.season,
  );
  const open = obs.find((o) => o.status === "open");
  const match =
    val === null
      ? undefined
      : triggers.find((t) => val >= (t.trigger_min ?? -Infinity) && val <= (t.trigger_max ?? Infinity));
  const drop = () => stmt(ctx.db, "DELETE FROM obligations WHERE id = ?", open!.id).run();
  if (!match || obs.some((o) => o.status !== "open" && o.item_id === match.id)) {
    if (open) await drop();
    return;
  }
  const announce = (id: number) =>
    ctx.fx.push({ t: "obligation", id, item: match.name, emoji: match.emoji, price: unitPrice(match), date });
  if (open) {
    if (open.item_id !== match.id || open.value !== val) {
      await stmt(ctx.db, "UPDATE obligations SET item_id = ?, value = ? WHERE id = ?", match.id, val, open.id).run();
      if (open.item_id !== match.id) announce(open.id);
    }
  } else {
    const r = await stmt(
      ctx.db,
      "INSERT INTO obligations (date, metric_key, item_id, value, season_id) VALUES (?,?,?,?,?) RETURNING id",
      date,
      key,
      match.id,
      val,
      ctx.season,
    ).first<{ id: number }>();
    announce(r!.id);
  }
}

// ---------------------------------------------------------------------------
// Fasting timer
// ---------------------------------------------------------------------------

export async function startFast(ctx: Ctx) {
  const r = await stmt(ctx.db, "UPDATE player SET fast_started_at = ? WHERE id = 1 AND fast_started_at IS NULL", ctx.now.getTime()).run();
  if (!r.meta.changes) throw bad("A fast is already running");
  ctx.player.fast_started_at = ctx.now.getTime();
  ctx.fx.push({ t: "toast", msg: "Fast started — you got this!", emoji: "⏳" });
}

export async function stopFast(ctx: Ctx, cancel = false) {
  const start = ctx.player.fast_started_at;
  if (!start) throw bad("No fast running");
  const r = await stmt(ctx.db, "UPDATE player SET fast_started_at = NULL WHERE id = 1 AND fast_started_at = ?", start).run();
  ctx.player.fast_started_at = null;
  if (!r.meta.changes) throw new HttpError(409, "That fast was already ended");
  if (cancel) return;
  const hours = Math.round(((ctx.now.getTime() - start) / 3_600_000) * 10) / 10;
  if (hours >= 0.1) {
    await setMetric(ctx, "fasting", { value: hours, mode: "add" });
    ctx.fx.push({ t: "toast", msg: `Fast complete: ${hours}h logged`, emoji: "⏳" });
  }
}

// ---------------------------------------------------------------------------
// Closing days (penalties, streaks, auto-billing). Idempotent and atomic per day.
// ---------------------------------------------------------------------------

const STREAK_CHESTS: Record<number, Rarity> = { 3: "common", 7: "rare", 14: "rare", 30: "epic", 60: "epic", 100: "legendary" };

export async function processDays(ctx: Ctx, maxDays = 3) {
  const p = ctx.player;
  if (!p.last_processed) {
    p.last_processed = ctx.closed; // first run: nothing retroactive
    await savePlayer(ctx);
    return 0;
  }
  if (daysBetween(p.last_processed, ctx.closed) > 14) {
    const skipped = daysBetween(p.last_processed, ctx.closed) - 14;
    p.last_processed = addDays(ctx.closed, -14);
    ctx.fx.push({ t: "toast", msg: `You were away a while — only the last 14 days were scored (${skipped} skipped)`, emoji: "🧭" });
  }
  let n = 0;
  while (ctx.player.last_processed! < ctx.closed && n < maxDays) {
    const fxLen = ctx.fx.length;
    try {
      await processDay(ctx, addDays(ctx.player.last_processed!, 1));
    } catch (e) {
      if (!String((e as Error)?.message ?? e).includes("day_closures")) throw e;
      // Another request (e.g. your other device) closed this day a moment ago — use its result.
      ctx.fx.length = fxLen;
      ctx.player = (await first<PlayerRow>(ctx.db, "SELECT * FROM player WHERE id = 1"))!;
      return 0;
    }
    n++;
  }
  await maybeFaint(ctx);
  await savePlayer(ctx);
  return Math.max(0, daysBetween(ctx.player.last_processed!, ctx.closed));
}

async function processDay(ctx: Ctx, d: string) {
  const db = ctx.db;
  const ws = weekStart(d);
  const sunday = weekday(d) === 6;
  const [restR, dailyR, doneR, weeklyR, obR, sprintR, shieldR, todoR] = await db.batch([
    stmt(db, "SELECT date FROM rest_days WHERE date = ?", d),
    stmt(db, "SELECT id, title, emoji, hp_penalty, days FROM quests WHERE type = 'daily' AND active = 1 AND created_at <= ?", d),
    stmt(db, "SELECT DISTINCT quest_id FROM quest_log WHERE date = ?", d),
    stmt(
      db,
      `SELECT q.id, q.title, q.emoji, q.hp_penalty, q.weekly_target,
         (SELECT COUNT(*) FROM quest_log l WHERE l.quest_id = q.id AND l.date BETWEEN ? AND ?) AS cnt
       FROM quests q WHERE q.type = 'weekly' AND q.active = 1 AND q.created_at <= ?`,
      ws,
      d,
      ws,
    ),
    stmt(
      db,
      `SELECT o.id, o.date, o.item_id, s.name, s.emoji, s.base_price, s.tax, s.category, s.voucher_ok
       FROM obligations o JOIN shop_items s ON s.id = o.item_id
       WHERE o.status = 'open' AND o.date <= ? AND o.season_id = ?`,
      d,
      ctx.season,
    ),
    stmt(db, "SELECT id, title, boss FROM sprints WHERE status = 'active' AND end_date <= ?", d),
    stmt(
      db,
      `SELECT s.id, (SELECT COALESCE(SUM(qty),0) FROM purchases p WHERE p.item_id = s.id AND p.season_id = ?)
        - (SELECT COALESCE(SUM(qty),0) FROM item_uses u WHERE u.item_id = s.id AND u.season_id = ?) AS left
       FROM shop_items s WHERE s.effect = 'streak_freeze'`,
      ctx.season,
      ctx.season,
    ),
    // prioritised to-dos due today or still overdue (not done by the end of this day)
    stmt(
      db,
      `SELECT q.id, q.title, q.emoji, q.ap, q.hp_penalty, q.priority, q.due_date FROM quests q
       WHERE q.type = 'todo' AND q.active = 1 AND q.priority IN ('do', 'schedule', 'delegate')
         AND q.due_date IS NOT NULL AND q.due_date <= ? AND q.due_date >= ? AND q.created_at <= ?
         AND NOT EXISTS (SELECT 1 FROM quest_log l WHERE l.quest_id = q.id AND l.date <= ?)`,
      d,
      addDays(d, -OVERDUE_DAYS),
      d,
      d,
    ),
  ]);

  const p = ctx.player;
  const rest = restR.results.length > 0;
  // First statement: claim the day. If it was already closed, the whole batch rolls back.
  const claimDay = stmt(db, "INSERT INTO day_closures (date) VALUES (?)", d);
  const due = rows<{ id: number; title: string; emoji: string; hp_penalty: number; days: string }>(dailyR).filter((q) =>
    isDue(q.days, d),
  );
  const done = new Set(rows<{ quest_id: number }>(doneR).map((r) => r.quest_id));
  const missed = due.filter((q) => !done.has(q.id));
  const batch: D1PreparedStatement[] = [claimDay];
  const hpBefore = p.hp;
  let perfect = false;
  const late: string[] = [];

  if (!rest) {
    // To-do deadlines (Eisenhower priorities): a missed deadline hurts once (urgent+important ones
    // also forfeit their AP); important ones keep draining a little each day they stay late.
    const todos = rows<{ id: number; title: string; emoji: string; ap: number; hp_penalty: number; priority: string; due_date: string }>(todoR);
    const missedNow = todos.filter((t) => t.due_date === d);
    const overdue = todos.filter((t) => t.due_date < d && priorityOf(t.priority)?.drain);
    if (missedNow.length) {
      batch.push(
        ledgerStmt(ctx, {
          kind: "penalty",
          hp: -missedNow.reduce((a, t) => a + t.hp_penalty, 0),
          ap: -missedNow.filter((t) => priorityOf(t.priority)?.fine).reduce((a, t) => a + t.ap, 0),
          source: "deadline",
          date: d,
          description: `Missed deadlines: ${missedNow.map((t) => t.title).join(", ")}`,
          fx: false,
        }),
      );
      late.push(...missedNow.map((t) => `${t.emoji} ${t.title} (deadline)`));
    }
    if (overdue.length) {
      batch.push(
        ledgerStmt(ctx, {
          kind: "penalty",
          hp: -overdue.reduce((a, t) => a + drainHp(t.hp_penalty), 0),
          source: "deadline",
          date: d,
          description: `Still overdue: ${overdue.map((t) => `${t.title} (${daysBetween(t.due_date, d)}d late)`).join(", ")}`,
          fx: false,
        }),
      );
      late.push(...overdue.map((t) => `${t.emoji} ${t.title} (${daysBetween(t.due_date, d)}d late)`));
    }

    if (missed.length) {
      batch.push(
        ledgerStmt(ctx, {
          kind: "penalty",
          hp: -missed.reduce((a, q) => a + q.hp_penalty, 0),
          source: "day",
          date: d,
          description: `Missed dailies: ${missed.map((q) => q.title).join(", ")}`,
          fx: false,
        }),
      );
    }
    if (sunday) {
      const weekMiss = rows<{ title: string; hp_penalty: number; weekly_target: number; cnt: number }>(weeklyR).filter(
        (q) => q.cnt < q.weekly_target,
      );
      if (weekMiss.length)
        batch.push(
          ledgerStmt(ctx, {
            kind: "penalty",
            hp: -weekMiss.reduce((a, q) => a + q.hp_penalty, 0),
            source: "day",
            date: d,
            description: `Missed weeklies: ${weekMiss.map((q) => `${q.title} (${q.cnt}/${q.weekly_target})`).join(", ")}`,
            fx: false,
          }),
        );
    }
    if (due.length) {
      const ratio = (due.length - missed.length) / due.length;
      perfect = missed.length === 0;
      if (ratio >= ctx.s.streak_threshold) {
        p.streak++;
        p.best_streak = Math.max(p.best_streak, p.streak);
        const r = STREAK_CHESTS[p.streak] ?? (p.streak % 50 === 0 ? "legendary" : undefined);
        if (r) batch.push(chestStmt(ctx, r, `${p.streak}-day streak`));
      } else if (p.streak > 0) {
        const shield = rows<{ id: number; left: number }>(shieldR).find((s) => s.left > 0);
        if (shield) {
          batch.push(
            stmt(ctx.db, "INSERT INTO item_uses (item_id, qty, note, date, season_id) VALUES (?,?,?,?,?)", shield.id, 1, `Protected ${p.streak}-day streak`, d, ctx.season),
          );
          ctx.fx.push({ t: "toast", msg: `Streak Shield saved your ${p.streak}-day streak!`, emoji: "🛡️" });
        } else p.streak = 0;
      }
      if (perfect) {
        batch.push(
          ledgerStmt(ctx, { kind: "bonus", hp: ctx.s.perfect_day_heal, source: "perfect", date: d, description: "Perfect day — well rested", fx: false }),
        );
        if (rand() < ctx.s.perfect_day_chest_chance) batch.push(chestStmt(ctx, rand() < 0.2 ? "rare" : "common", "Perfect day"));
      }
    }
  }

  // Auto-bill unresolved calorie court cases at full price (no vouchers).
  const billed: string[] = [];
  for (const o of rows<{ id: number; date: string; item_id: number; name: string; emoji: string; base_price: number; tax: number; category: string; voucher_ok: number }>(obR)) {
    const price = unitPrice({ ...o, id: o.item_id });
    billed.push(`${o.emoji} ${o.name} (${price} AP)`);
    batch.push(
      ledgerStmt(ctx, { kind: "penalty", ap: -price, source: "shop", ref_id: o.item_id, date: d, description: `Auto-billed: ${o.name} for ${o.date}`, fx: false }),
      stmt(
        ctx.db,
        `INSERT INTO purchases (item_id, item_name, qty, unit_price, total, note, date, ledger_id, season_id)
         VALUES (?,?,1,?,?,?,?,last_insert_rowid(),?)`,
        o.item_id,
        o.name,
        price,
        price,
        `Auto-billed (calorie court ${o.date})`,
        d,
        ctx.season,
      ),
      // (UPDATE doesn't change last_insert_rowid, so both of these see the purchase id)
      stmt(ctx.db, "UPDATE obligations SET status = 'auto_billed', resolved_at = ?, purchase_id = last_insert_rowid() WHERE id = ?", d, o.id),
      stmt(
        ctx.db,
        "INSERT INTO item_uses (item_id, purchase_id, qty, note, date, season_id) VALUES (?,last_insert_rowid(),1,?,?,?)",
        o.item_id,
        `Calorie court ${o.date}`,
        d,
        ctx.season,
      ),
    );
  }

  for (const sp of rows<{ id: number; title: string; boss: string }>(sprintR)) {
    batch.push(stmt(ctx.db, "UPDATE sprints SET status = 'lost' WHERE id = ?", sp.id));
    ctx.fx.push({ t: "boss", title: sp.title, boss: sp.boss, won: false });
  }

  p.last_processed = d;
  batch.push(playerStmt(ctx));
  await db.batch(batch); // atomic: the whole day is applied or none of it

  ctx.fx.push({
    t: "report",
    date: d,
    due: due.length,
    done: due.length - missed.length,
    missed: missed.map((q) => `${q.emoji} ${q.title}`),
    late,
    hp: p.hp - hpBefore,
    streak: p.streak,
    perfect,
    billed,
    rest,
  });
  if (p.hp <= 0) await maybeFaint(ctx);
}
