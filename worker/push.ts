// Phone reminders: what to send and when. Each character's Durable Object runs these from an
// alarm set for the next reminder, so nothing polls. Every reminder is recorded in push_sent,
// so it goes out once even if the alarm fires twice.
import { addDays, clockLabel, closesAt, dateInTz, isClockTime, zonedTime } from "../shared/dates";
import { questDue } from "../shared/schedule";
import { all, bad, first, notFound, rows, stmt } from "./db";
import type { Ctx } from "./game";
import { pushEndpointOk, sendPush, type Vapid } from "./webpush";

export const MAX_DEVICES = 10;
/** A morning or evening reminder that's this late (alarm delayed, phone just added) is skipped. */
const LATE_OK = 3 * 3600_000;
const NOTE_LATE_OK = 6 * 3600_000;

export interface Reminder {
  kind: "morning" | "evening" | "note" | "test";
  ref: string;
  title: string;
  body: string;
  url: string;
  ttl: number;
}

export interface Device {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string | null;
  created_at: string;
  last_ok: string | null;
  fails: number;
}

export const devices = (db: D1Database) => all<Device>(db, "SELECT * FROM push_devices ORDER BY id");

export async function addDevice(db: D1Database, b: Record<string, any>) {
  const endpoint = String(b.endpoint ?? "");
  const p256dh = String(b.keys?.p256dh ?? "");
  const auth = String(b.keys?.auth ?? "");
  if (!pushEndpointOk(endpoint)) throw bad("That doesn't look like a phone or browser push address");
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw bad("Bad push keys");
  const label = String(b.label ?? "").trim().slice(0, 40) || null;
  const known = await first(db, "SELECT 1 AS x FROM push_devices WHERE endpoint = ?", endpoint);
  if (!known && ((await first<{ c: number }>(db, "SELECT COUNT(*) AS c FROM push_devices"))?.c ?? 0) >= MAX_DEVICES)
    throw bad(`Up to ${MAX_DEVICES} devices; remove an old one first`);
  await stmt(
    db,
    `INSERT INTO push_devices (endpoint, p256dh, auth, label) VALUES (?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, label = COALESCE(excluded.label, label), fails = 0`,
    endpoint,
    p256dh,
    auth,
    label,
  ).run();
}

export async function removeDevice(db: D1Database, id: number) {
  const r = await stmt(db, "DELETE FROM push_devices WHERE id = ?", id).run();
  if (!r.meta.changes) throw notFound("Device not found");
}

interface QuestBit {
  id: number;
  type: string;
  title: string;
  days: string;
  repeat_rule: string | null;
  due_date: string | null;
  priority: string | null;
  created_at: string;
}

/** Today's open to-dos, dailies and promises (what a reminder talks about). */
async function today(ctx: Ctx) {
  const d = ctx.today;
  const [qR, lR, pR] = await ctx.db.batch([
    ctx.db.prepare("SELECT id, type, title, days, repeat_rule, due_date, priority, created_at FROM quests WHERE active = 1 AND type IN ('daily', 'todo')"),
    stmt(ctx.db, "SELECT l.quest_id, l.date FROM quest_log l JOIN quests q ON q.id = l.quest_id WHERE l.date = ? OR q.type = 'todo'", d),
    // promises whose day is still open (today's, and yesterday's during the grace hours)
    stmt(ctx.db, "SELECT quest_id, title, date FROM promises WHERE date > ? AND season_id = ?", ctx.closed, ctx.season),
  ]);
  const qs = rows<QuestBit>(qR);
  const logs = rows<{ quest_id: number; date: string }>(lR);
  const doneToday = new Set(logs.filter((l) => l.date === d).map((l) => l.quest_id));
  const doneEver = new Set(logs.map((l) => l.quest_id));
  const todos = qs.filter((q) => q.type === "todo" && !doneEver.has(q.id));
  const proms = rows<{ quest_id: number; title: string; date: string }>(pR);
  // kept = ticked on its day or later (an open day can only be ticked before it closes)
  const kept = (p: { quest_id: number; date: string }) => logs.some((l) => l.quest_id === p.quest_id && l.date >= p.date);
  return {
    dailiesLeft: qs.filter((q) => q.type === "daily" && q.created_at <= d && questDue(q, d) && !doneToday.has(q.id)).length,
    open: todos.length,
    dueToday: todos.filter((q) => q.due_date === d).map((q) => q.title),
    late: todos.filter((q) => q.due_date && q.due_date < d && q.priority && q.priority !== "later").map((q) => q.title),
    promised: proms.filter((p) => p.date === d),
    promisesLeft: proms.filter((p) => p.date === d && !kept(p)).map((p) => p.title),
    yesterdayLeft: proms.filter((p) => p.date < d && !kept(p)).map((p) => p.title),
  };
}

/** When yesterday finally closes, e.g. "4 pm". */
const closeTime = (ctx: Ctx) => clockLabel(closesAt(addDays(ctx.today, -1), ctx.s.timezone, ctx.s.day_start_hour, ctx.s.grace_hours), ctx.s.timezone);

const list = (names: string[], max = 3) => (names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max}` : names.join(", "));
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

async function morning(ctx: Ctx): Promise<Omit<Reminder, "kind" | "ref"> | null> {
  const t = await today(ctx);
  const show = ctx.s.push_details;
  const lines: string[] = [];
  if (t.yesterdayLeft.length)
    lines.push(show ? `⏳ Yesterday's promises, until ${closeTime(ctx)}: ${list(t.yesterdayLeft)}` : `⏳ ${many(t.yesterdayLeft.length, "promise")} from yesterday, until ${closeTime(ctx)}`);
  if (!t.promised.length && t.open) lines.push(`🎯 Pick today's top ${ctx.s.promise_max} and lock in`);
  else if (t.promisesLeft.length) lines.push(show ? `🎯 Promised: ${list(t.promisesLeft)}` : `🎯 ${many(t.promisesLeft.length, "promise")} today`);
  if (t.dueToday.length) lines.push(show ? `⏰ Due today: ${list(t.dueToday)}` : `⏰ ${many(t.dueToday.length, "to-do")} due today`);
  if (t.late.length) lines.push(show ? `🔥 Late: ${list(t.late)}` : `🔥 ${many(t.late.length, "late to-do")}`);
  if (t.dailiesLeft) lines.push(`⚔️ ${many(t.dailiesLeft, "daily", "dailies")} to do`);
  if (!lines.length) return null;
  return { title: `☀️ Good morning, ${ctx.s.player_name}`, body: lines.join("\n"), url: "/#/", ttl: 4 * 3600 };
}

async function evening(ctx: Ctx): Promise<Omit<Reminder, "kind" | "ref"> | null> {
  const t = await today(ctx);
  const show = ctx.s.push_details;
  const lines: string[] = [];
  if (t.promisesLeft.length)
    lines.push(
      (show ? `🎯 Promises left: ${list(t.promisesLeft)}` : `🎯 ${many(t.promisesLeft.length, "promise")} left`) +
        (ctx.s.promise_hp ? ` (−${ctx.s.promise_hp} HP each if missed)` : ""),
    );
  if (t.dueToday.length) lines.push(show ? `⏰ Due today: ${list(t.dueToday)}` : `⏰ ${many(t.dueToday.length, "to-do")} due today`);
  if (t.dailiesLeft) lines.push(`⚔️ ${many(t.dailiesLeft, "daily", "dailies")} left`);
  if (!lines.length) return null;
  return { title: "🌙 Still time today", body: lines.join("\n"), url: "/#/", ttl: 3 * 3600 };
}

/** Morning and evening slots near `now`: today's and tomorrow's, as instants. */
function slots(ctx: Ctx) {
  const tz = ctx.s.timezone;
  const day = dateInTz(ctx.now, tz);
  const out: { kind: "morning" | "evening"; ref: string; at: number }[] = [];
  for (const [kind, hhmm] of [
    ["morning", ctx.s.push_morning],
    ["evening", ctx.s.push_evening],
  ] as const) {
    if (!isClockTime(hhmm)) continue;
    for (const d of [addDays(day, -1), day, addDays(day, 1)]) out.push({ kind, ref: d, at: zonedTime(d, hhmm, tz) });
  }
  return out;
}

const sent = async (ctx: Ctx, kind: string, ref: string) => !!(await first(ctx.db, "SELECT 1 AS x FROM push_sent WHERE kind = ? AND ref = ?", kind, ref));

/** Reminders that should go out right now (and haven't yet). */
export async function dueReminders(ctx: Ctx): Promise<Reminder[]> {
  const now = ctx.now.getTime();
  const out: Reminder[] = [];
  for (const s of slots(ctx)) {
    if (s.at > now || now - s.at > LATE_OK || (await sent(ctx, s.kind, s.ref))) continue;
    const m = s.kind === "morning" ? await morning(ctx) : await evening(ctx);
    // nothing to say still counts as done, so it isn't re-checked all evening
    out.push(m ? { kind: s.kind, ref: s.ref, ...m } : { kind: s.kind, ref: s.ref, title: "", body: "", url: "", ttl: 0 });
  }
  if (ctx.s.push_notes) {
    const notes = await all<{ id: number; title: string; remind_at: string }>(
      ctx.db,
      "SELECT id, title, remind_at FROM notes WHERE remind_at IS NOT NULL AND trashed_at IS NULL AND remind_at <= ? AND remind_at > ? ORDER BY remind_at LIMIT 10",
      new Date(now).toISOString(),
      new Date(now - NOTE_LATE_OK).toISOString(),
    );
    for (const n of notes) {
      const ref = `${n.id}@${n.remind_at}`;
      if (await sent(ctx, "note", ref)) continue;
      out.push({
        kind: "note",
        ref,
        title: `⏰ ${ctx.s.push_details && n.title ? n.title : "Note reminder"}`,
        body: "Tap to open the note",
        url: `/#/notes/${n.id}`,
        ttl: 3 * 3600,
      });
    }
  }
  return out;
}

/** When the next reminder is due (now if one is waiting), or null if there's nothing to schedule. */
export async function nextReminderAt(ctx: Ctx): Promise<number | null> {
  const now = ctx.now.getTime();
  if ((await dueReminders(ctx)).length) return now;
  const times = slots(ctx)
    .map((s) => s.at)
    .filter((t) => t > now);
  if (ctx.s.push_notes) {
    const n = await first<{ t: string | null }>(ctx.db, "SELECT MIN(remind_at) AS t FROM notes WHERE remind_at > ? AND trashed_at IS NULL", new Date(now).toISOString());
    if (n?.t) times.push(Date.parse(n.t));
  }
  return times.length ? Math.min(...times) : null;
}

/** Sends reminders to every device; forgets devices the push service says are gone. */
export async function deliver(ctx: Ctx, v: Vapid, list: Reminder[], char: string | null) {
  const devs = await devices(ctx.db);
  let ok = 0;
  let failed = 0;
  for (const r of list) {
    // claim it first, so an overlapping alarm can't send it twice
    if (r.kind !== "test") {
      const claim = await stmt(ctx.db, "INSERT OR IGNORE INTO push_sent (kind, ref) VALUES (?, ?)", r.kind, r.ref).run();
      if (!claim.meta.changes || !r.title) continue;
    }
    const message = { title: r.title, body: r.body, url: r.url, tag: r.kind === "note" ? `note-${r.ref.split("@")[0]}` : r.kind, char };
    for (const d of devs) {
      const res = await sendPush(d, message, v, { ttl: r.ttl, topic: r.kind === "note" ? undefined : r.kind });
      if (res.result === "ok") {
        ok++;
        await stmt(ctx.db, "UPDATE push_devices SET last_ok = datetime('now'), fails = 0 WHERE id = ?", d.id).run();
      } else {
        failed++;
        if (res.result === "gone" || d.fails >= 9) await stmt(ctx.db, "DELETE FROM push_devices WHERE id = ?", d.id).run();
        else await stmt(ctx.db, "UPDATE push_devices SET fails = fails + 1 WHERE id = ?", d.id).run();
      }
    }
  }
  // keep a couple of months of history
  await stmt(ctx.db, "DELETE FROM push_sent WHERE sent_at < datetime('now', '-60 days')").run();
  return { ok, failed, devices: devs.length };
}
