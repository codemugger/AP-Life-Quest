// The notebook: binders, labels and rich notes (pins, Today pins, reminders, links to goals).
// Journal entries (notes in a "journal" binder) feed the 📔 Journal tracker, which auto-completes
// the journal quest and powers the writing trophies, so writing is part of the game.
import { emptyDoc, MAX_DOC_CHARS, NOTE_COLORS, NOTE_FONTS, NOTEBOOK_COLORS, PAPERS, REPEATS, sanitizeDoc, summarize } from "../shared/notedoc";
import type { Fx } from "../shared/types";
import { all, bad, first, HttpError, insertStmt, notFound, run, stmt } from "./db";
import { finalize, loadCtx, setMetric, type Ctx } from "./game";
import { JOURNAL_METRIC } from "./seed";

/** Columns sent for cards on the board (everything except the full doc and the search text). */
const CARD = `id, notebook_id, title, preview, words, cover, extras, color, paper, font, mood, labels, pinned, pin_today,
  archived, trashed_at, journal_date, goal_id, sprint_id, event_id, remind_at, remind_repeat, rev, created_at, updated_at`;

const TRASH_DAYS = 30;
const MAX_NOTES = 5000;
const MAX_NOTEBOOKS = 40;
const MAX_LABELS = 100;

type Body = Record<string, unknown>;
/** What a note write did: the response data, and which journal days need their word count re-checked. */
export interface NoteResult {
  data?: unknown;
  dates?: (string | null | undefined)[];
  /** re-check those days through the game engine now (deliberate actions like trash/restore) */
  force?: boolean;
}

const has = (b: Body, k: string) => Object.hasOwn(b, k);
const pick = <T extends string>(list: readonly T[], v: unknown, what: string): T => {
  if (typeof v !== "string" || !list.includes(v as T)) throw bad(`Unknown ${what}`);
  return v as T;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FONT_IDS = NOTE_FONTS.map((f) => f.id);

async function insertId(db: D1Database, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const r = await stmt(db, `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) RETURNING id`, ...cols.map((c) => row[c])).first<{ id: number }>();
  return r!.id;
}

/** Rich-text columns derived from the doc (sanitised first). */
export function contentCols(raw: unknown) {
  const doc = sanitizeDoc(raw);
  const json = JSON.stringify(doc);
  if (json.length > MAX_DOC_CHARS) throw bad("This note is too long. Split it into two notes.");
  const s = summarize(doc);
  return {
    doc: json,
    preview: JSON.stringify(s.preview),
    text: s.text.slice(0, 20_000),
    words: s.words,
    media_ids: s.media.length ? JSON.stringify(s.media) : null,
    cover: s.images[0] ?? null,
    extras: JSON.stringify({ audio: s.audio, tasks: s.tasks, images: s.images.length }),
  };
}

/** Validates the simple (non-content) note fields that are present in the body. */
async function noteProps(db: D1Database, b: Body, today: () => Promise<string>) {
  const out: Record<string, unknown> = {};
  if (has(b, "title")) out.title = String(b.title ?? "").trim().slice(0, 200);
  if (has(b, "color")) out.color = b.color ? pick(NOTE_COLORS, b.color, "colour") : null;
  if (has(b, "paper")) out.paper = pick(PAPERS, b.paper, "paper");
  if (has(b, "font")) out.font = pick(FONT_IDS, b.font, "font");
  if (has(b, "mood")) out.mood = b.mood ? String(b.mood).trim().slice(0, 16) || null : null;
  for (const k of ["pinned", "pin_today", "archived"]) if (has(b, k)) out[k] = b[k] ? 1 : 0;
  if (has(b, "remind_repeat")) out.remind_repeat = b.remind_repeat ? pick(REPEATS, b.remind_repeat, "repeat") : null;
  if (has(b, "remind_at")) {
    if (!b.remind_at) out.remind_at = null;
    else {
      const t = Date.parse(String(b.remind_at));
      if (!Number.isFinite(t)) throw bad("That reminder time looks wrong");
      out.remind_at = new Date(t).toISOString();
    }
  }
  if (has(b, "labels")) {
    const list = Array.isArray(b.labels) ? [...new Set(b.labels.map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 30) : [];
    const ok = list.length ? await all<{ id: number }>(db, `SELECT id FROM note_labels WHERE id IN (${list.map(() => "?").join(",")})`, ...list) : [];
    const keep = list.filter((id) => ok.some((r) => r.id === id));
    out.labels = keep.length ? JSON.stringify(keep) : null;
  }
  for (const [k, table] of [
    ["notebook_id", "notebooks"],
    ["goal_id", "goals"],
    ["sprint_id", "sprints"],
    ["event_id", "events"],
  ] as const) {
    if (!has(b, k)) continue;
    if (b[k] === null || b[k] === "") {
      if (k === "notebook_id") throw bad("Pick a notebook");
      out[k] = null;
      continue;
    }
    const n = Number(b[k]);
    if (!Number.isInteger(n) || !(await first(db, `SELECT 1 AS ok FROM ${table} WHERE id = ?`, n))) throw bad(`That ${k.slice(0, -3)} doesn't exist`);
    out[k] = n;
  }
  if (has(b, "journal_date") && b.journal_date) {
    const d = String(b.journal_date);
    if (!DATE.test(d)) throw bad("Journal date must be YYYY-MM-DD");
    if (d > (await today())) throw bad("That day hasn't happened yet");
    out.journal_date = d;
  }
  return out;
}

const lazyToday = (db: D1Database) => {
  let t: Promise<string> | null = null;
  return () => (t ??= loadCtx(db).then((c) => c.today));
};

const notebookKind = async (db: D1Database, id: unknown) => (await first<{ kind: string }>(db, "SELECT kind FROM notebooks WHERE id = ?", id))?.kind ?? null;

export const noteCard = (db: D1Database, id: number) => first(db, `SELECT ${CARD} FROM notes WHERE id = ?`, id);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
export async function listNotes(db: D1Database) {
  // Trash empties itself after a while (journal words already left the tracker when it was trashed).
  await run(db, `DELETE FROM notes WHERE trashed_at IS NOT NULL AND trashed_at < datetime('now', '-${TRASH_DAYS} days')`);
  const [nbs, labels, notes] = await db.batch([
    db.prepare("SELECT * FROM notebooks ORDER BY sort, id"),
    db.prepare("SELECT * FROM note_labels ORDER BY name"),
    db.prepare(`SELECT ${CARD} FROM notes ORDER BY pinned DESC, updated_at DESC, id DESC`),
  ]);
  return { notebooks: nbs.results, labels: labels.results, notes: notes.results, trash_days: TRASH_DAYS };
}

export async function getNote(db: D1Database, id: number) {
  const n = await first(db, `SELECT ${CARD}, doc FROM notes WHERE id = ?`, id);
  if (!n) throw notFound("Note not found");
  return n;
}

export async function searchNotes(db: D1Database, q: string) {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return all(
    db,
    `SELECT id, substr(text, max(1, instr(lower(text), lower(?)) - 40), 160) AS snippet FROM notes
     WHERE trashed_at IS NULL AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')
     ORDER BY pinned DESC, updated_at DESC LIMIT 100`,
    term,
    like,
    like,
  );
}

// ---------------------------------------------------------------------------
// Writing notes
// ---------------------------------------------------------------------------
export async function createNote(db: D1Database, b: Body): Promise<NoteResult> {
  const count = (await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM notes"))?.n ?? 0;
  if (count >= MAX_NOTES) throw bad(`Your notebook is full (${MAX_NOTES} notes). Empty the trash or delete old notes.`);
  const nbId = b.notebook_id ?? (await first<{ id: number }>(db, "SELECT id FROM notebooks ORDER BY sort, id LIMIT 1"))?.id;
  if (!nbId) throw bad("Create a notebook first");
  const today = lazyToday(db);
  const { journal_date: wanted, ...props } = await noteProps(db, { ...b, notebook_id: nbId }, today);
  const journal = (await notebookKind(db, props.notebook_id)) === "journal";
  const content = contentCols(b.doc ?? emptyDoc());
  const row: Record<string, unknown> = { ...props, ...content, journal_date: journal ? (wanted ?? (await today())) : null };
  const id = await insertId(db, "notes", row);
  return { data: await getNote(db, id), dates: journal && content.words ? [row.journal_date as string] : [] };
}

export async function updateNote(db: D1Database, id: number, b: Body): Promise<NoteResult> {
  const cur = await first<{ notebook_id: number | null; journal_date: string | null; kind: string | null }>(
    db,
    "SELECT n.notebook_id, n.journal_date, nb.kind FROM notes n LEFT JOIN notebooks nb ON nb.id = n.notebook_id WHERE n.id = ?",
    id,
  );
  if (!cur) throw notFound("Note not found");
  const today = lazyToday(db);
  const props = await noteProps(db, b, today);
  const content = has(b, "doc") ? contentCols(b.doc) : null;
  // Journal entries are dated; moving a note in or out of a journal binder gives it / takes away its day.
  let journal = cur.kind === "journal";
  if (props.notebook_id !== undefined && props.notebook_id !== cur.notebook_id) {
    journal = (await notebookKind(db, props.notebook_id)) === "journal";
    if (journal) props.journal_date ??= cur.journal_date ?? (await today());
    else props.journal_date = null;
  } else if (!journal) delete props.journal_date;

  const sets: Record<string, unknown> = { ...props, ...(content ?? {}) };
  const cols = Object.keys(sets);
  // `sync` (sent when the editor closes) re-checks the day through the game engine
  if (!cols.length) return { data: await noteCard(db, id), dates: b.sync ? [cur.journal_date] : [] };
  const contentChange = content !== null || props.title !== undefined;
  const checkRev = contentChange && b.rev !== undefined && b.rev !== null;
  const res = await stmt(
    db,
    `UPDATE notes SET ${cols.map((c) => `${c} = ?`).join(", ")}${contentChange ? ", rev = rev + 1, updated_at = datetime('now')" : ""}
     WHERE id = ?${checkRev ? " AND rev = ?" : ""} RETURNING id`,
    ...cols.map((c) => sets[c]),
    id,
    ...(checkRev ? [Number(b.rev)] : []),
  ).first();
  if (!res) throw new HttpError(409, "This note was changed on another device.");
  const touchesWords = content !== null || props.journal_date !== undefined || props.notebook_id !== undefined || !!b.sync;
  return { data: await noteCard(db, id), dates: touchesWords ? [cur.journal_date, props.journal_date as string | null | undefined] : [] };
}

export async function trashNote(db: D1Database, id: number, trash: boolean): Promise<NoteResult> {
  const n = await first<{ journal_date: string | null }>(db, "SELECT journal_date FROM notes WHERE id = ?", id);
  if (!n) throw notFound("Note not found");
  await run(db, `UPDATE notes SET trashed_at = ${trash ? "datetime('now')" : "NULL"} WHERE id = ?`, id);
  return { data: await noteCard(db, id), dates: [n.journal_date], force: true };
}

export async function deleteNote(db: D1Database, id: number): Promise<NoteResult> {
  const r = await run(db, "DELETE FROM notes WHERE id = ? AND trashed_at IS NOT NULL", id);
  if (!r.meta.changes) throw bad("Move the note to the trash first");
  return {};
}

export async function emptyTrash(db: D1Database): Promise<NoteResult> {
  const r = await run(db, "DELETE FROM notes WHERE trashed_at IS NOT NULL");
  return { data: { removed: r.meta.changes } };
}

export async function duplicateNote(db: D1Database, id: number): Promise<NoteResult> {
  const n = await first<{ journal_date: string | null; words: number }>(db, "SELECT journal_date, words FROM notes WHERE id = ?", id);
  if (!n) throw notFound("Note not found");
  const day = n.journal_date ? await lazyToday(db)() : null;
  const r = await stmt(
    db,
    `INSERT INTO notes (notebook_id, title, doc, preview, text, words, media_ids, cover, extras, color, paper, font, mood, labels, goal_id, sprint_id, event_id, journal_date)
     SELECT notebook_id, title, doc, preview, text, words, media_ids, cover, extras, color, paper, font, mood, labels, goal_id, sprint_id, event_id, ?
     FROM notes WHERE id = ? RETURNING id`,
    day,
    id,
  ).first<{ id: number }>();
  return { data: await getNote(db, r!.id), dates: day && n.words ? [day] : [] };
}

const STEP: Record<string, (d: Date) => void> = {
  daily: (d) => d.setUTCDate(d.getUTCDate() + 1),
  weekly: (d) => d.setUTCDate(d.getUTCDate() + 7),
  monthly: (d) => d.setUTCMonth(d.getUTCMonth() + 1),
};

/** "Done" on a reminder: repeating ones move to their next time, others are cleared. */
export async function reminderDone(db: D1Database, id: number): Promise<NoteResult> {
  const n = await first<{ remind_at: string | null; remind_repeat: string | null }>(db, "SELECT remind_at, remind_repeat FROM notes WHERE id = ?", id);
  if (!n) throw notFound("Note not found");
  let next: string | null = null;
  if (n.remind_at && n.remind_repeat && STEP[n.remind_repeat]) {
    const d = new Date(n.remind_at);
    for (let i = 0; i < 2000 && d.getTime() <= Date.now(); i++) STEP[n.remind_repeat](d);
    next = d.toISOString();
  }
  await run(db, "UPDATE notes SET remind_at = ? WHERE id = ?", next, id);
  return { data: await noteCard(db, id) };
}

// ---------------------------------------------------------------------------
// Notebooks (binders) and labels
// ---------------------------------------------------------------------------
function notebookFields(b: Body, creating: boolean) {
  const out: Record<string, unknown> = {};
  if (has(b, "name") || creating) {
    const name = String(b.name ?? "").trim().slice(0, 40);
    if (!name) throw bad("Give the notebook a name");
    out.name = name;
  }
  if (has(b, "emoji")) out.emoji = String(b.emoji ?? "").trim().slice(0, 16) || "📒";
  if (has(b, "color")) out.color = pick(NOTEBOOK_COLORS, b.color, "colour");
  if (has(b, "sort")) out.sort = Math.max(-1e6, Math.min(1e6, Math.round(Number(b.sort) || 0)));
  if (creating) out.kind = b.kind === "journal" ? "journal" : "notes";
  return out;
}

export async function createNotebook(db: D1Database, b: Body): Promise<NoteResult> {
  const c = await first<{ n: number; s: number }>(db, "SELECT COUNT(*) AS n, COALESCE(MAX(sort), 0) + 1 AS s FROM notebooks");
  if (c!.n >= MAX_NOTEBOOKS) throw bad(`That's a lot of notebooks (max ${MAX_NOTEBOOKS}). Use labels too!`);
  const id = await insertId(db, "notebooks", { sort: c!.s, ...notebookFields(b, true) });
  return { data: await first(db, "SELECT * FROM notebooks WHERE id = ?", id) };
}

export async function updateNotebook(db: D1Database, id: number, b: Body): Promise<NoteResult> {
  const row = notebookFields(b, false); // a binder's kind is fixed once made
  const cols = Object.keys(row);
  if (cols.length) {
    const r = await stmt(db, `UPDATE notebooks SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, ...cols.map((c) => row[c]), id).run();
    if (!r.meta.changes) throw notFound("Notebook not found");
  }
  return { data: await first(db, "SELECT * FROM notebooks WHERE id = ?", id) };
}

/** Deletes a binder; its notes move to another one (same kind first). */
export async function deleteNotebook(db: D1Database, id: number): Promise<NoteResult> {
  const nb = await first<{ kind: string }>(db, "SELECT kind FROM notebooks WHERE id = ?", id);
  if (!nb) throw notFound("Notebook not found");
  const other = await first<{ id: number; kind: string; name: string }>(
    db,
    "SELECT id, kind, name FROM notebooks WHERE id <> ? ORDER BY (kind = ?) DESC, sort, id LIMIT 1",
    id,
    nb.kind,
  );
  if (!other) throw bad("Keep at least one notebook");
  const leavingJournal = nb.kind === "journal" && other.kind !== "journal";
  const dates = leavingJournal
    ? (await all<{ d: string }>(db, "SELECT DISTINCT journal_date AS d FROM notes WHERE notebook_id = ? AND journal_date IS NOT NULL", id)).map((r) => r.d)
    : [];
  await db.batch([
    stmt(db, `UPDATE notes SET notebook_id = ?${leavingJournal ? ", journal_date = NULL" : ""} WHERE notebook_id = ?`, other.id, id),
    stmt(db, "DELETE FROM notebooks WHERE id = ?", id),
  ]);
  return { data: { moved_to: other.id, name: other.name }, dates, force: true };
}

export async function createLabel(db: D1Database, b: Body): Promise<NoteResult> {
  const name = String(b.name ?? "").trim().slice(0, 30);
  if (!name) throw bad("Give the label a name");
  if (((await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM note_labels"))?.n ?? 0) >= MAX_LABELS) throw bad(`Max ${MAX_LABELS} labels`);
  if (await first(db, "SELECT 1 AS ok FROM note_labels WHERE name = ?", name)) throw bad("You already have that label");
  const color = b.color ? pick(NOTE_COLORS, b.color, "colour") : null;
  return { data: await stmt(db, "INSERT INTO note_labels (name, color) VALUES (?, ?) RETURNING *", name, color).first() };
}

export async function updateLabel(db: D1Database, id: number, b: Body): Promise<NoteResult> {
  if (has(b, "name")) {
    const name = String(b.name ?? "").trim().slice(0, 30);
    if (!name) throw bad("Give the label a name");
    if (await first(db, "SELECT 1 AS ok FROM note_labels WHERE name = ? AND id <> ?", name, id)) throw bad("You already have that label");
    await run(db, "UPDATE note_labels SET name = ? WHERE id = ?", name, id);
  }
  if (has(b, "color")) await run(db, "UPDATE note_labels SET color = ? WHERE id = ?", b.color ? pick(NOTE_COLORS, b.color, "colour") : null, id);
  const row = await first(db, "SELECT * FROM note_labels WHERE id = ?", id);
  if (!row) throw notFound("Label not found");
  return { data: row };
}

export async function deleteLabel(db: D1Database, id: number): Promise<NoteResult> {
  await db.batch([
    stmt(db, "DELETE FROM note_labels WHERE id = ?", id),
    stmt(
      db,
      `UPDATE notes SET labels = (SELECT CASE WHEN COUNT(*) THEN json_group_array(j.value) END FROM json_each(notes.labels) j WHERE j.value <> ?)
       WHERE labels IS NOT NULL AND json_valid(labels) AND EXISTS (SELECT 1 FROM json_each(notes.labels) WHERE value = ?)`,
      id,
      id,
    ),
  ]);
  return {};
}

// ---------------------------------------------------------------------------
// Journal → game
// ---------------------------------------------------------------------------

/**
 * Re-counts the words in each day's journal entries and stores them in the 📔 tracker.
 * Most autosaves only update the number (cheap); when a day crosses the journal quest's
 * threshold (or starts/stops having words), or `force` is set, it goes through the game
 * engine so the quest ticks, trophies unlock and the effects come back for the UI.
 */
export async function syncJournal(db: D1Database, dates: (string | null | undefined)[], force: boolean): Promise<Fx[]> {
  const days = [...new Set(dates.filter((d): d is string => !!d && DATE.test(d)))];
  if (!days.length) return [];
  let m = await first<{ active: number; target: number | null }>(db, "SELECT active, target FROM metrics WHERE key = 'journal'");
  if (!m) {
    // e.g. after loading an old backup: bring the tracker back
    await insertStmt(db, "metrics", JOURNAL_METRIC, "INSERT OR IGNORE").run();
    m = { active: 1, target: JOURNAL_METRIC.target };
  }
  if (!m.active) return [];
  const target = m.target;
  const thresholds = (await all<{ metric_op: string | null; metric_value: number | null }>(db, "SELECT metric_op, metric_value FROM quests WHERE metric_key = 'journal' AND active = 1")).map(
    (q) => (q.metric_op === ">=" || q.metric_op === "<=" ? (q.metric_value ?? target ?? 1) : 1),
  );
  let ctx: Ctx | null = force ? await loadCtx(db) : null;
  for (const d of days) {
    const [w, v] = await db.batch([
      stmt(db, "SELECT COALESCE(SUM(words), 0) AS n FROM notes WHERE journal_date = ? AND trashed_at IS NULL", d),
      stmt(db, "SELECT value FROM metric_values WHERE metric_key = 'journal' AND date = ?", d),
    ]);
    const next = (w.results[0] as { n: number }).n || null;
    const cur = (v.results[0] as { value: number } | undefined)?.value ?? null;
    if (next === cur) continue;
    const crosses = cur === null || next === null || thresholds.some((t) => cur < t !== next < t);
    if (crosses || ctx) {
      ctx ??= await loadCtx(db);
      if (d > ctx.today) continue;
      await setMetric(ctx, "journal", { date: d, value: next, mode: "set" });
    } else await run(db, "UPDATE metric_values SET value = ?, updated_at = datetime('now') WHERE metric_key = 'journal' AND date = ?", next, d);
  }
  if (!ctx) return [];
  await finalize(ctx);
  return ctx.fx;
}

/** Rebuilds the 📔 tracker from the journal entries (after loading a save point / backup / reset). */
export function journalRebuildStmts(db: D1Database) {
  return [
    db.prepare("DELETE FROM metric_values WHERE metric_key = 'journal'"),
    db.prepare(
      `INSERT INTO metric_values (metric_key, date, value)
       SELECT 'journal', journal_date, SUM(words) FROM notes
       WHERE journal_date IS NOT NULL AND trashed_at IS NULL AND EXISTS (SELECT 1 FROM metrics WHERE key = 'journal')
       GROUP BY journal_date HAVING SUM(words) > 0`,
    ),
  ];
}
