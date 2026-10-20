// Save points (snapshots), JSON export/import, New Game+ and factory reset.
//
// Save points are built *inside SQLite*: each chunk is `json_group_array(json_object(...))` over up to
// 500 rows of one table, so saving and loading cost the Worker almost no CPU however big the game gets.
import { addDays } from "../shared/dates";
import { levelInfo } from "../shared/levels";
import { MAX_DOC_CHARS, sanitizeDoc } from "../shared/notedoc";
import { all, bad, first, HttpError, notFound, stmt } from "./db";
import { savePlayer, settingStmt, totals, type Ctx } from "./game";
import { contentCols, journalRebuildStmts } from "./notes";
import { ownerTemplatesAllowed, seedAll } from "./seeding";

/** Every table that holds game data (sessions/login attempts/snapshots are deliberately excluded). */
export const DATA_TABLES = [
  "settings",
  "seasons",
  "player",
  "day_closures",
  "rest_days",
  "quests",
  "quest_log",
  "metrics",
  "metric_values",
  "ledger",
  "shop_items",
  "vouchers",
  "purchases",
  "item_uses",
  "obligations",
  "chests",
  "achievements",
  "achievement_unlocks",
  "goals",
  "milestones",
  "sprints",
  "sprint_tasks",
  "events",
  "notebooks",
  "note_labels",
  "notes",
] as const;

/**
 * Your notebook is life data, not game progress: loading a save point or a factory reset leaves it
 * alone unless you ask, and a backup file only replaces it if the file contains notes.
 */
export const NOTE_TABLES: readonly string[] = ["notebooks", "note_labels", "notes"];

const isDataTable = (t: string) => (DATA_TABLES as readonly string[]).includes(t);
const IDENT = /^[a-z_][a-z0-9_]*$/;
const PART = 500;
/** Rows per chunk: notes are big, and a single value in a character database must stay under 2 MB. */
const partOf = (t: string) => (t === "notes" ? 10 : PART);
/** Columns left out of downloaded backups (rebuilt from the doc on import, keeps files small). */
const EXPORT_SKIP: Record<string, string[]> = { notes: ["preview", "text"] };
const MAX_IMPORT_ROWS = 60_000;
const MAX_MANUAL_SNAPSHOTS = 12;
/** Newest snapshots kept per automatic kind. */
const KEEP: Record<string, number> = { auto: 8, "pre-reset": 5, "pre-restore": 5 };

export interface Backup {
  app: "ap-life-quest";
  format: 1;
  exported_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Column names of every data table, read from the live schema. */
async function tableColumns(db: D1Database) {
  const info = await db.batch(DATA_TABLES.map((t) => db.prepare(`PRAGMA table_info(${t})`)));
  const out: Record<string, string[]> = {};
  DATA_TABLES.forEach((t, i) => (out[t] = (info[i].results as { name: string }[]).map((c) => c.name).filter((c) => IDENT.test(c))));
  return out;
}

/** One statement per chunk; with a snapshot id they INSERT the chunk, without they just SELECT it. */
async function chunkStatements(db: D1Database, snapId: number | null) {
  const cols = await tableColumns(db);
  const tables = DATA_TABLES.filter((t) => cols[t].length); // the v1 database has no notebook tables
  const counts = await db.batch(tables.map((t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`)));
  const out: D1PreparedStatement[] = [];
  let idx = 0;
  tables.forEach((t, i) => {
    const n = (counts[i].results[0] as { n: number }).n;
    const obj = cols[t]
      .filter((c) => snapId !== null || !EXPORT_SKIP[t]?.includes(c))
      .map((c) => `'${c}', "${c}"`)
      .join(", ");
    const part = partOf(t);
    for (let off = 0; off < Math.max(n, 1); off += part) {
      const sel = `SELECT json_group_array(json_object(${obj})) FROM (SELECT * FROM ${t} ORDER BY rowid LIMIT ${part} OFFSET ${off})`;
      out.push(
        snapId === null
          ? stmt(db, `SELECT ? AS tbl, (${sel}) AS data`, t)
          : stmt(db, `INSERT INTO snapshot_chunks (snapshot_id, idx, tbl, cols, data) VALUES (?, ?, ?, ?, (${sel}))`, snapId, idx, t, JSON.stringify(cols[t])),
      );
      idx++;
    }
  });
  return out;
}

/** Stitches chunk arrays into one backup JSON document (string ops only, no parsing). */
function assemble(parts: { tbl: string; data: string }[]) {
  const by: Record<string, string[]> = {};
  for (const p of parts) {
    by[p.tbl] ??= [];
    const inner = String(p.data ?? "[]").slice(1, -1).trim();
    if (inner) by[p.tbl].push(inner);
  }
  const tables = Object.entries(by)
    .map(([t, xs]) => `${JSON.stringify(t)}:[${xs.join(",")}]`)
    .join(",");
  return `{"app":"ap-life-quest","format":1,"exported_at":${JSON.stringify(new Date().toISOString())},"tables":{${tables}}}`;
}

/** Full backup as a JSON string (for the download button). */
export async function exportJson(db: D1Database) {
  const res = await db.batch(await chunkStatements(db, null));
  return assemble(res.map((r) => r.results[0] as { tbl: string; data: string }));
}

export async function snapshotJson(db: D1Database, id: number) {
  const rows = await all<{ tbl: string; data: string }>(db, "SELECT tbl, data FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY idx", id);
  if (!rows.length) throw notFound("Save point not found");
  return assemble(rows);
}

/** Creates a save point atomically (the row and all its chunks, or nothing). */
export async function createSnapshot(db: D1Database, label: string, kind = "manual") {
  const next = await first<{ n: number; manual: number }>(db, "SELECT COALESCE(MAX(id), 0) + 1 AS n, (SELECT COUNT(*) FROM snapshots WHERE kind = 'manual') AS manual FROM snapshots");
  if (kind === "manual" && next!.manual >= MAX_MANUAL_SNAPSHOTS) throw bad(`You have ${MAX_MANUAL_SNAPSHOTS} save points. Delete an old one first.`);
  const id = next!.n;
  await db.batch([
    stmt(db, "INSERT INTO snapshots (id, label, kind) VALUES (?, ?, ?)", id, label.slice(0, 120), kind),
    ...(await chunkStatements(db, id)),
    stmt(db, "UPDATE snapshots SET size = (SELECT COALESCE(SUM(length(data)), 0) FROM snapshot_chunks WHERE snapshot_id = ?) WHERE id = ?", id, id),
    // Keep only the newest few of each automatic kind.
    ...Object.entries(KEEP).map(([k, n]) =>
      stmt(db, "DELETE FROM snapshots WHERE kind = ? AND id NOT IN (SELECT id FROM snapshots WHERE kind = ? ORDER BY id DESC LIMIT ?)", k, k, n),
    ),
    db.prepare("DELETE FROM snapshot_chunks WHERE snapshot_id NOT IN (SELECT id FROM snapshots)"),
  ]);
  return id;
}

/**
 * Loads a save point (after saving the current game), entirely inside SQLite, in one atomic batch.
 * The notebook only goes back in time too with `notes`.
 */
export async function restoreSnapshot(db: D1Database, id: number, opts: { notes?: boolean } = {}) {
  const chunks = await all<{ idx: number; tbl: string; cols: string }>(db, "SELECT idx, tbl, cols FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY idx", id);
  if (!chunks.length) throw notFound("Save point not found");
  await createSnapshot(db, "Before loading a save point", "pre-restore");
  const live = await tableColumns(db);
  // (save points from before the notebook existed have no notes: the current ones stay then too)
  const keepNotes = !opts.notes || !chunks.some((ch) => ch.tbl === "notes");
  const replace = (t: string) => isDataTable(t) && !(keepNotes && NOTE_TABLES.includes(t));
  const batch: D1PreparedStatement[] = DATA_TABLES.filter(replace).map((t) => db.prepare(`DELETE FROM ${t}`));
  for (const ch of chunks) {
    if (!replace(ch.tbl)) continue;
    let saved: string[] = [];
    try {
      saved = JSON.parse(ch.cols);
    } catch {}
    const use = saved.filter((c) => live[ch.tbl].includes(c)); // only columns that still exist
    if (!use.length) continue;
    batch.push(
      stmt(
        db,
        `INSERT INTO ${ch.tbl} (${use.map((c) => `"${c}"`).join(", ")})
         SELECT ${use.map((c) => `json_extract(j.value, '$.${c}')`).join(", ")}
         FROM json_each((SELECT data FROM snapshot_chunks WHERE snapshot_id = ? AND idx = ?)) AS j`,
        id,
        ch.idx,
      ),
    );
  }
  batch.push(...journalRebuildStmts(db));
  await db.batch(batch);
}

/** Imported values get the same safety rules as things typed into the app. */
function sanitise(t: string, col: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return null; // backups only contain scalars
  if (col === "link") return typeof v === "string" && /^https?:\/\//i.test(v) && v.length <= 1000 ? v : null;
  const ids = (max: number) => {
    try {
      const a = JSON.parse(String(v));
      return Array.isArray(a) && a.length <= max && a.every((x) => Number.isInteger(x) && x > 0) ? JSON.stringify(a) : null;
    } catch {
      return null;
    }
  };
  if (col === "images") return ids(12);
  if (t === "notes") {
    if (col === "media_ids") return ids(5000);
    if (col === "labels") return ids(30);
    // already rebuilt from a sanitised doc by notesRow()
    if (col === "doc" || col === "preview" || col === "text" || col === "extras") return typeof v === "string" && v.length <= MAX_DOC_CHARS * 2 ? v : null;
  }
  if (typeof v === "string" && v.length > 10_000) return v.slice(0, 10_000);
  return v;
}

/** A note from a backup file: its text, preview and media list are rebuilt from its (sanitised) doc. */
function notesRow(r: Record<string, unknown>): Record<string, unknown> {
  try {
    return { ...r, ...contentCols(JSON.parse(String(r.doc))) };
  } catch {
    return { ...r, ...contentCols(sanitizeDoc(null)) };
  }
}

/**
 * Replaces all game data with an uploaded backup file, atomically. Unknown tables/columns are
 * ignored. With keepTemplate, the character keeps its current template (a backup can't switch it).
 */
export async function importAll(db: D1Database, data: Backup, opts: { keepTemplate?: boolean } = {}) {
  if (!data || data.app !== "ap-life-quest" || !data.tables || typeof data.tables !== "object") throw bad("That file isn't an AP Life Quest backup");
  if (!Array.isArray(data.tables.settings) || !data.tables.settings.length || !Array.isArray(data.tables.player) || !data.tables.player.length)
    throw bad("Backup is missing settings/player data");
  const rowCount = DATA_TABLES.reduce((n, t) => n + (Array.isArray(data.tables[t]) ? data.tables[t].length : 0), 0);
  if (rowCount > MAX_IMPORT_ROWS) throw bad("That backup is too large to import");
  const current = opts.keepTemplate ? await first<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'template'") : null;
  const live = await tableColumns(db);
  // NOT NULL columns that have a default: a null in the file means "use the default".
  const info = await db.batch(DATA_TABLES.map((t) => db.prepare(`PRAGMA table_info(${t})`)));
  const required: Record<string, Set<string>> = {};
  DATA_TABLES.forEach((t, i) => {
    required[t] = new Set((info[i].results as { name: string; notnull: number; dflt_value: unknown }[]).filter((c) => c.notnull && c.dflt_value !== null).map((c) => c.name));
  });
  // Files from before the notebook existed don't touch it.
  const replace = (t: string) => !NOTE_TABLES.includes(t) || Array.isArray(data.tables[t]);
  const batch: D1PreparedStatement[] = DATA_TABLES.filter(replace).map((t) => db.prepare(`DELETE FROM ${t}`));
  for (const t of DATA_TABLES) {
    if (!replace(t)) continue;
    let list = Array.isArray(data.tables[t]) ? data.tables[t].filter((r) => r && typeof r === "object") : [];
    if (t === "notes") list = list.map(notesRow);
    if (!list.length) continue;
    // Group rows by which columns they have, so a missing field gets its normal default
    // (normal exports are a single group; hand-edited files may have several).
    const groups = new Map<string, { cols: string[]; rows: Record<string, unknown>[] }>();
    for (const r of list) {
      const cols = live[t].filter((c) => c in r && !(r[c] === null && required[t].has(c)));
      if (!cols.length) continue;
      const key = cols.join(",");
      if (!groups.has(key)) groups.set(key, { cols, rows: [] });
      groups.get(key)!.rows.push(r);
    }
    for (const { cols, rows: grp } of groups.values()) {
      const perStmt = Math.max(1, Math.floor(90 / cols.length)); // D1 allows 100 bound params per statement
      for (let j = 0; j < grp.length; j += perStmt) {
        const chunk = grp.slice(j, j + perStmt);
        const sql = `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",")}`;
        batch.push(stmt(db, sql, ...chunk.flatMap((r) => cols.map((c) => sanitise(t, c, r[c])))));
      }
    }
  }
  if (opts.keepTemplate) batch.push(stmt(db, "INSERT OR REPLACE INTO settings (key, value) VALUES ('template', ?)", current?.value ?? JSON.stringify("starter")));
  batch.push(...journalRebuildStmts(db));
  await db.batch(batch);
}

/** Weekly automatic save point (run in the background after closing days). */
export async function maybeAutoSnapshot(ctx: Ctx) {
  const last = await first<{ created_at: string }>(ctx.db, "SELECT created_at FROM snapshots WHERE kind = 'auto' ORDER BY id DESC LIMIT 1");
  if (last && last.created_at.slice(0, 10) > addDays(ctx.today, -7)) return;
  await createSnapshot(ctx.db, `Weekly auto-save ${ctx.today}`, "auto");
}

/** New Game+: archive the season, reset AP/XP/level/HP/streak/inventory. Trackers & config are kept. */
export async function seasonReset(ctx: Ctx, name: string) {
  await createSnapshot(ctx.db, `Before New Game+ (${ctx.today})`, "pre-reset");
  const db = ctx.db;
  const tot = await totals(ctx);
  const [earned, spent, quests, achs, weights] = await db.batch([
    stmt(db, "SELECT COALESCE(SUM(ap),0) AS v FROM ledger WHERE season_id = ? AND voided = 0 AND ap > 0", ctx.season),
    stmt(db, "SELECT COALESCE(-SUM(ap),0) AS v FROM ledger WHERE season_id = ? AND voided = 0 AND ap < 0", ctx.season),
    stmt(db, "SELECT COUNT(*) AS v FROM quest_log WHERE season_id = ?", ctx.season),
    stmt(db, "SELECT COUNT(*) AS v FROM achievement_unlocks WHERE season_id = ?", ctx.season),
    stmt(
      db,
      `SELECT (SELECT value FROM metric_values WHERE metric_key = 'weight' AND date >= ? ORDER BY date LIMIT 1) AS first,
              (SELECT value FROM metric_values WHERE metric_key = 'weight' AND date >= ? ORDER BY date DESC LIMIT 1) AS last`,
      ctx.seasonStart,
      ctx.seasonStart,
    ),
  ]);
  const v = (r: D1Result) => (r.results[0] as { v: number })?.v ?? 0;
  const w = weights.results[0] as { first: number | null; last: number | null };
  const summary = {
    level: levelInfo(tot.xp).level,
    xp: tot.xp,
    ap_final: tot.ap,
    ap_earned: v(earned),
    ap_spent: v(spent),
    quests_done: v(quests),
    achievements: v(achs),
    best_streak: ctx.player.best_streak,
    weight_start: w?.first ?? null,
    weight_end: w?.last ?? null,
  };
  const next = await first<{ n: number }>(db, "SELECT COALESCE(MAX(id),0) + 1 AS n FROM seasons");
  const id = next!.n;
  await db.batch([
    stmt(db, "UPDATE seasons SET ended_at = ?, summary = ? WHERE id = ?", ctx.today, JSON.stringify(summary), ctx.season),
    stmt(db, "INSERT INTO seasons (id, name, started_at) VALUES (?,?,?)", id, (name || `Season ${id}`).slice(0, 80), ctx.today),
    settingStmt(ctx, "current_season", id),
    stmt(db, "UPDATE sprints SET status = 'cancelled' WHERE status = 'active'"),
    // Finished to-dos stay finished: archive them so they don't look open-but-unclickable.
    stmt(db, "UPDATE quests SET active = 0 WHERE type = 'todo' AND active = 1 AND id IN (SELECT quest_id FROM quest_log)"),
  ]);
  ctx.season = id;
  ctx.seasonStart = ctx.today;
  Object.assign(ctx.player, {
    hp: ctx.s.max_hp,
    fainted: 0,
    revive_progress: 0,
    streak: 0,
    best_streak: 0,
    fast_started_at: null,
    last_processed: ctx.closed,
    rewarded_level: 1,
  });
  await savePlayer(ctx);
  ctx.fx.push({ t: "toast", msg: "New Game+ started. Fresh season, same you — let's go!", emoji: "🌱" });
}

/** Wipes everything (a save point is made first) and reloads the starter content. The notebook stays unless `notes`. */
export async function factoryReset(db: D1Database, keepProfile: Record<string, unknown>, opts: { notes?: boolean } = {}) {
  const allowOwnerOnly = await ownerTemplatesAllowed(db);
  await createSnapshot(db, "Before factory reset", "pre-reset");
  await db.batch(DATA_TABLES.filter((t) => opts.notes || !NOTE_TABLES.includes(t)).map((t) => db.prepare(`DELETE FROM ${t}`)));
  try {
    await seedAll(db, keepProfile, undefined, allowOwnerOnly);
  } catch (e) {
    throw new HttpError(500, `Reset failed while seeding: ${(e as Error).message}`);
  }
  await db.batch(journalRebuildStmts(db));
}
