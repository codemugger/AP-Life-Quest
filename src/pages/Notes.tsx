// Notebook: binder tabs (OneNote-style), a Keep-style board of cards (pinned first), labels,
// reminders, archive and trash, and the journal (dated entries that feed your journal quest).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { prettyDate } from "../../shared/dates";
import { NOTE_COLORS, NOTEBOOK_COLORS, type PMNode } from "../../shared/notedoc";
import type { Note, NoteCard, Notebook, NoteLabel } from "../../shared/types";
import { useFx } from "../fx";
import { journalStreak, notesApi, parseDoc, parseExtras, parseIds, reminderDue, reminderLabel, type NotesData } from "../notes";
import { useGame } from "../store";
import { MediaImg } from "../components/Media";
import { NoteView } from "../components/NoteView";
import { EmojiInput, Empty, Field, HelpLink, Modal, Panel } from "../components/ui";
import type { EditorInit } from "../components/notes/NoteEditor";

const NoteEditor = lazy(() => import("../components/notes/NoteEditor"));

type Special = null | "reminders" | "archive" | "trash";
interface Open {
  note: Note | null;
  init?: EditorInit;
  start?: "sketch" | "voice" | { files: File[] } | null;
}

const VIEW_KEY = "aplq-notes-view";
const sortCards = (a: NoteCard, b: NoteCard) => b.pinned - a.pinned || (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.id - a.id);
const CHECKLIST: PMNode = { type: "doc", content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }] }] };

function loadView(): { nb: number | "all"; label: number | null } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}");
    return { nb: typeof v.nb === "number" ? v.nb : "all", label: typeof v.label === "number" ? v.label : null };
  } catch {
    return { nb: "all", label: null };
  }
}

export default function Notes({ sub }: { sub?: string }) {
  const fx = useFx();
  const { state, refresh } = useGame();
  const [data, setData] = useState<NotesData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState(loadView);
  const [special, setSpecial] = useState<Special>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Map<number, string> | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [nbEdit, setNbEdit] = useState<Notebook | "new" | null>(null);
  const [labelsEdit, setLabelsEdit] = useState(false);
  const photoIn = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await notesApi.list());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {}
  }, [view]);

  // server-side search (titles + full text), debounced
  useEffect(() => {
    const term = q.trim();
    if (!term) return setHits(null);
    const t = setTimeout(() => {
      notesApi
        .search(term)
        .then((r) => setHits(new Map(r.map((x) => [x.id, x.snippet]))))
        .catch((e) => fx.error((e as Error).message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, fx]);

  const notebooks = data?.notebooks ?? [];
  const nb = view.nb === "all" ? null : (notebooks.find((n) => n.id === view.nb) ?? null);
  const journalNb = nb?.kind === "journal" ? nb : null;

  const upsert = useCallback((card: NoteCard) => setData((d) => (d ? { ...d, notes: [card, ...d.notes.filter((n) => n.id !== card.id)].sort(sortCards) } : d)), []);
  const drop = useCallback((id: number) => setData((d) => (d ? { ...d, notes: d.notes.filter((n) => n.id !== id) } : d)), []);

  const openNote = useCallback(
    async (id: number) => {
      setLoadingNote(true);
      try {
        const note = await notesApi.get(id);
        setOpen({ note });
        history.replaceState(null, "", `#/notes/${id}`);
      } catch (e) {
        fx.error((e as Error).message);
      } finally {
        setLoadingNote(false);
      }
    },
    [fx],
  );

  const newNote = useCallback(
    (init: EditorInit = {}, start: Open["start"] = null) => {
      const target = init.notebook_id ?? (nb && !journalNb ? nb.id : notebooks.find((n) => n.kind === "notes")?.id ?? notebooks[0]?.id);
      setOpen({ note: null, init: { notebook_id: target, ...init }, start });
    },
    [nb, journalNb, notebooks],
  );

  /** Today's journal entry: open it if it exists, otherwise start one. */
  const todaysEntry = useCallback(
    (book?: Notebook | null) => {
      const j = book ?? notebooks.find((n) => n.kind === "journal");
      if (!j || !data) return fx.error("Make a journal notebook first (＋ next to the tabs)");
      const existing = data.notes.find((n) => n.notebook_id === j.id && n.journal_date === state.today && !n.trashed_at);
      if (existing) void openNote(existing.id);
      else setOpen({ note: null, init: { notebook_id: j.id, journal_date: state.today } });
    },
    [data, notebooks, openNote, state.today, fx],
  );

  // deep links: #/notes/<id>, #/notes/journal, #/notes/new?goal_id=…
  useEffect(() => {
    if (!data || !sub) return;
    if (/^\d+$/.test(sub)) void openNote(Number(sub));
    else if (sub === "journal") todaysEntry();
    else if (sub.startsWith("new")) {
      const p = new URLSearchParams(sub.split("?")[1] ?? "");
      const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
      newNote({ goal_id: num("goal_id"), sprint_id: num("sprint_id"), event_id: num("event_id"), title: p.get("title") ?? undefined });
    }
    // only when the route (or first load) changes
  }, [sub, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeEditor = () => {
    setOpen(null);
    history.replaceState(null, "", "#/notes");
    void refresh(); // Camp pins, reminders and goal links live in the game state
  };

  const cardAction = async (n: NoteCard, path: string, body?: object, method = "POST") => {
    try {
      const r = await notesApi.write<NoteCard | null>(path, body ?? {}, method);
      if (r.data && "notebook_id" in r.data) upsert(r.data);
      else drop(n.id);
      if (r.fx.length) {
        fx.play(r.fx, state);
        void refresh();
      }
      return r;
    } catch (e) {
      fx.error((e as Error).message);
    }
  };

  if (err)
    return (
      <Panel>
        <Empty emoji="📡">
          Couldn't open the notebook: {err}
          <div>
            <button className="btn sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </Empty>
      </Panel>
    );
  if (!data) return <div className="empty">Opening your notebook…</div>;

  const all = data.notes;
  let list: NoteCard[];
  if (hits) list = all.filter((n) => hits.has(n.id));
  else if (special === "trash") list = all.filter((n) => n.trashed_at);
  else if (special === "archive") list = all.filter((n) => n.archived && !n.trashed_at);
  else if (special === "reminders") list = all.filter((n) => n.remind_at && !n.trashed_at).sort((a, b) => (a.remind_at! < b.remind_at! ? -1 : 1));
  else
    list = all.filter(
      (n) => !n.trashed_at && !n.archived && (view.nb === "all" || n.notebook_id === view.nb) && (view.label === null || parseIds(n.labels).includes(view.label)),
    );
  const dueCount = all.filter((n) => !n.trashed_at && reminderDue(n.remind_at)).length;
  const counts = new Map<number, number>();
  for (const n of all) if (!n.trashed_at && !n.archived && n.notebook_id) counts.set(n.notebook_id, (counts.get(n.notebook_id) ?? 0) + 1);

  const tile = (n: NoteCard) => (
    <NoteTile
      key={n.id}
      n={n}
      data={data}
      snippet={hits?.get(n.id)}
      trash={special === "trash"}
      onOpen={() => void openNote(n.id)}
      onPin={() => void cardAction(n, `notes/${n.id}`, { pinned: n.pinned ? 0 : 1 }, "PUT")}
      onRestore={() => void cardAction(n, `notes/${n.id}/restore`)}
      onDelete={() => confirm("Delete this note forever?") && void cardAction(n, `notes/${n.id}`, {}, "DELETE")}
      onDone={() => void cardAction(n, `notes/${n.id}/remind-done`)}
    />
  );

  return (
    <>
      <div className="page-head">
        <h1>📒 Notebook <HelpLink to="notebook" /></h1>
        <div className="row note-search">
          <input className="input" type="search" placeholder="🔍 Search notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        </div>
      </div>

      {/* binder tabs */}
      <div className="binder-tabs" role="tablist" aria-label="Notebooks">
        <button role="tab" aria-selected={view.nb === "all" && !special} className={`binder-tab nb-violet ${view.nb === "all" && !special ? "on" : ""}`} onClick={() => (setView({ nb: "all", label: view.label }), setSpecial(null))}>
          📚 All
        </button>
        {notebooks.map((n) => (
          <button
            key={n.id}
            role="tab"
            aria-selected={view.nb === n.id && !special}
            className={`binder-tab nb-${n.color} ${view.nb === n.id && !special ? "on" : ""}`}
            onClick={() => (view.nb === n.id && !special ? setNbEdit(n) : (setView({ nb: n.id, label: view.label }), setSpecial(null)))}
            title={view.nb === n.id ? "Tap again to edit this notebook" : n.name}
          >
            {n.emoji} {n.name}
            {!!counts.get(n.id) && <span className="tab-count">{counts.get(n.id)}</span>}
            {view.nb === n.id && !special && <span className="tab-edit">✎</span>}
          </button>
        ))}
        <button className="binder-tab add" onClick={() => setNbEdit("new")} aria-label="New notebook" title="New notebook">
          ＋
        </button>
      </div>

      {/* filters */}
      <div className="note-filters">
        <button className={`chip-btn ${special === "reminders" ? "on" : ""}`} onClick={() => setSpecial(special === "reminders" ? null : "reminders")}>
          ⏰ Reminders{dueCount ? <span className="badge-inline">{dueCount}</span> : null}
        </button>
        {data.labels.map((l) => (
          <button key={l.id} className={`chip-btn nc-${l.color ?? "none"} ${view.label === l.id && !special ? "on" : ""}`} onClick={() => (setView({ ...view, label: view.label === l.id ? null : l.id }), setSpecial(null))}>
            🏷 {l.name}
          </button>
        ))}
        <button className="chip-btn" onClick={() => setLabelsEdit(true)} title="Edit labels">
          ✎ Labels
        </button>
        <span className="grow" />
        <button className={`chip-btn ${special === "archive" ? "on" : ""}`} onClick={() => setSpecial(special === "archive" ? null : "archive")}>
          🗄️ Archive
        </button>
        <button className={`chip-btn ${special === "trash" ? "on" : ""}`} onClick={() => setSpecial(special === "trash" ? null : "trash")}>
          🗑️ Trash
        </button>
      </div>

      {!special && !hits && journalNb && <JournalHeader book={journalNb} onWrite={() => todaysEntry(journalNb)} />}

      {!special && !hits && !journalNb && (
        <div className="take-note panel tight">
          <button className="take-note-text" onClick={() => newNote()}>
            Take a note…
          </button>
          <button className="btn xs" title="New checklist" aria-label="New checklist" onClick={() => newNote({ doc: CHECKLIST })}>
            ☑
          </button>
          <button className="btn xs" title="New sketch" aria-label="New sketch" onClick={() => newNote({}, "sketch")}>
            ✏️
          </button>
          <button className="btn xs" title="New voice memo" aria-label="New voice memo" onClick={() => newNote({}, "voice")}>
            🎙️
          </button>
          <button className="btn xs" title="New photo note" aria-label="New photo note" onClick={() => photoIn.current?.click()}>
            📷
          </button>
          <input
            ref={photoIn}
            type="file"
            accept="image/*"
            multiple
            className="hide"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) newNote({}, { files });
            }}
          />
        </div>
      )}

      {special === "trash" && (
        <div className="row between wrap" style={{ margin: "0 4px 10px" }}>
          <span className="small ink2">Notes in the trash are deleted after {data.trash_days} days.</span>
          {list.length > 0 && (
            <button className="btn sm danger" onClick={() => confirm("Delete everything in the trash forever?") && void cardAction(list[0], "notes/empty-trash").then(() => load())}>
              Empty trash
            </button>
          )}
        </div>
      )}
      {hits && <p className="small ink2" style={{ margin: "0 4px 10px" }}>{list.length ? `${list.length} note(s) match “${q.trim()}”` : `Nothing matches “${q.trim()}”`}</p>}

      {journalNb && !special && !hits ? (
        <JournalList list={list} render={tile} />
      ) : special || hits ? (
        <div className="note-board">{list.map(tile)}</div>
      ) : (
        <>
          {list.some((n) => n.pinned) && <h2 className="board-label">📌 Pinned</h2>}
          <div className="note-board">{list.filter((n) => n.pinned).map(tile)}</div>
          {list.some((n) => n.pinned) && list.some((n) => !n.pinned) && <h2 className="board-label">Others</h2>}
          <div className="note-board">{list.filter((n) => !n.pinned).map(tile)}</div>
        </>
      )}
      {!list.length && !hits && (
        <Panel>
          <Empty emoji={special === "trash" ? "🗑️" : special === "archive" ? "🗄️" : special === "reminders" ? "⏰" : journalNb ? "📔" : "📝"}>
            {special === "trash"
              ? "The trash is empty."
              : special === "archive"
                ? "Archived notes rest here, out of the way."
                : special === "reminders"
                  ? "Notes with a reminder show up here (⏰ in a note)."
                  : journalNb
                    ? "Your journal is waiting for its first entry. Every day you write counts toward your journal quest!"
                    : "No notes here yet. Take a note: ideas, timetables, meeting minutes, lists…"}
          </Empty>
        </Panel>
      )}

      {loadingNote && <div className="overlay center"><div className="panel">Opening…</div></div>}
      {open && (
        <Suspense fallback={<div className="overlay"><div className="panel">Loading the editor…</div></div>}>
          <NoteEditor
            key={open.note?.id ?? "new"}
            data={data}
            note={open.note}
            init={open.init}
            start={open.start}
            onSaved={upsert}
            onRemoved={drop}
            onLabels={(labels) => setData((d) => (d ? { ...d, labels } : d))}
            onClose={closeEditor}
          />
        </Suspense>
      )}
      {nbEdit && (
        <NotebookModal
          book={nbEdit === "new" ? null : nbEdit}
          books={notebooks}
          onClose={() => setNbEdit(null)}
          onChanged={async (sel) => {
            await load();
            if (sel !== undefined) setView({ nb: sel ?? "all", label: view.label });
            void refresh();
          }}
        />
      )}
      {labelsEdit && <LabelsModal labels={data.labels} onClose={() => setLabelsEdit(false)} onChanged={load} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
function NoteTile({
  n,
  data,
  snippet,
  trash,
  onOpen,
  onPin,
  onRestore,
  onDelete,
  onDone,
}: {
  n: NoteCard;
  data: NotesData;
  snippet?: string;
  trash?: boolean;
  onOpen: () => void;
  onPin: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const doc = useMemo(() => parseDoc(n.preview), [n.preview]);
  const ex = parseExtras(n.extras);
  const labels = data.labels.filter((l) => parseIds(n.labels).includes(l.id));
  const book = data.notebooks.find((b) => b.id === n.notebook_id);
  const due = reminderDue(n.remind_at);
  const title = n.title || (n.journal_date ? prettyDate(n.journal_date) : "");
  return (
    <article
      className={`note-card nc-${n.color ?? "none"} paper-${n.paper} ${due ? "due" : ""}`}
      onClick={trash ? undefined : onOpen}
      onKeyDown={(e) => !trash && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      tabIndex={trash ? undefined : 0}
      role={trash ? undefined : "button"}
      aria-label={title || "Untitled note"}
    >
      {n.cover && (
        <div className="nc-cover">
          <MediaImg id={n.cover} size="100%" />
        </div>
      )}
      {!trash && (
        <button
          className={`nc-pin ${n.pinned ? "on" : ""}`}
          onClick={(e) => (e.stopPropagation(), onPin())}
          aria-label={n.pinned ? "Unpin" : "Pin"}
          title={n.pinned ? "Unpin" : "Pin"}
        >
          📌
        </button>
      )}
      {(title || n.mood) && (
        <h3 className={`nc-title font-${n.font}`}>
          {n.mood && <span className="nc-mood">{n.mood}</span>} {title}
        </h3>
      )}
      {snippet ? <p className="small nc-snippet">…{snippet}…</p> : <NoteView doc={doc} compact font={n.font} className="nc-body" />}
      <div className="nc-chips">
        {n.journal_date && n.title && <span className="chip">📅 {prettyDate(n.journal_date)}</span>}
        {ex.tasks[1] > 0 && (
          <span className={`chip ${ex.tasks[0] === ex.tasks[1] ? "good" : ""}`}>
            ☑ {ex.tasks[0]}/{ex.tasks[1]}
          </span>
        )}
        {ex.audio > 0 && <span className="chip">🎙️ {ex.audio}</span>}
        {ex.images > 1 && <span className="chip">📷 {ex.images}</span>}
        {n.remind_at && (
          <span className={`chip ${due ? "bad" : "xp"}`}>
            ⏰ {reminderLabel(n.remind_at)}
            {n.remind_repeat ? " 🔁" : ""}
          </span>
        )}
        {!!n.pin_today && <span className="chip warn">☀️</span>}
        {(n.goal_id || n.sprint_id || n.event_id) && <span className="chip good">🔗</span>}
        {labels.map((l) => (
          <span key={l.id} className={`chip label-chip nc-${l.color ?? "none"}`}>
            {l.name}
          </span>
        ))}
        {book && <span className="chip nc-book">{book.emoji}</span>}
      </div>
      {due && !trash && (
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn xs good" onClick={(e) => (e.stopPropagation(), onDone())}>
            ✓ Done{n.remind_repeat ? " (next)" : ""}
          </button>
        </div>
      )}
      {trash && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn xs good" onClick={onRestore}>
            ↩ Restore
          </button>
          <button className="btn xs danger" onClick={onDelete}>
            Delete forever
          </button>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------
function JournalHeader({ book, onWrite }: { book: Notebook; onWrite: () => void }) {
  const { state } = useGame();
  const j = journalStreak(state);
  const done = j.todayWords >= j.goal;
  return (
    <Panel className="journal-head">
      <div className="row wrap" style={{ gap: 12 }}>
        <div className="journal-flame" aria-hidden="true">
          {book.emoji}
        </div>
        <div className="grow">
          <div className="px-font" style={{ fontSize: 11, lineHeight: 1.6 }}>
            {book.name.toUpperCase()}
          </div>
          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
            <span className="chip warn">🔥 {j.streak}-day writing streak</span>
            <span className={`chip ${done ? "good" : ""}`}>
              ✍️ {j.todayWords}/{j.goal} words today {done ? "✓" : ""}
            </span>
            {j.quest && (
              <span className="chip ap">
                +{j.quest.ap} AP · +{j.quest.xp} XP
              </span>
            )}
          </div>
        </div>
        <button className="btn primary" onClick={onWrite}>
          ✍️ Today's entry
        </button>
      </div>
    </Panel>
  );
}

function JournalList({ list, render }: { list: NoteCard[]; render: (n: NoteCard) => ReactNode }) {
  const sorted = [...list].sort((a, b) => ((a.journal_date ?? a.created_at) < (b.journal_date ?? b.created_at) ? 1 : -1));
  const months = new Map<string, NoteCard[]>();
  for (const n of sorted) {
    const key = (n.journal_date ?? n.created_at).slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), n]);
  }
  return (
    <>
      {[...months.entries()].map(([m, notes]) => (
        <section key={m}>
          <h2 className="board-label">{new Date(`${m}-01T00:00:00`).toLocaleDateString("en-SG", { month: "long", year: "numeric" })}</h2>
          <div className="note-board">{notes.map(render)}</div>
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Managing notebooks and labels
// ---------------------------------------------------------------------------
function NotebookModal({ book, books, onClose, onChanged }: { book: Notebook | null; books: Notebook[]; onClose: () => void; onChanged: (select?: number | null) => Promise<void> }) {
  const fx = useFx();
  const [name, setName] = useState(book?.name ?? "");
  const [emoji, setEmoji] = useState(book?.emoji ?? "📒");
  const [color, setColor] = useState(book?.color ?? "sky");
  const [kind, setKind] = useState<"notes" | "journal">(book?.kind ?? "notes");
  const [busy, setBusy] = useState(false);
  /** fn may return the notebook to show afterwards (null = All) */
  const run = async (fn: () => Promise<number | null | void>) => {
    setBusy(true);
    try {
      const select = await fn();
      await onChanged(select === undefined ? undefined : select);
      onClose();
    } catch (e) {
      fx.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const idx = book ? books.findIndex((b) => b.id === book.id) : -1;
  const swap = (dir: -1 | 1) => {
    const other = books[idx + dir];
    if (!book || !other) return;
    void run(async () => {
      await notesApi.write(`notebooks/${book.id}`, { sort: other.sort }, "PUT");
      await notesApi.write(`notebooks/${other.id}`, { sort: book.sort === other.sort ? book.sort - dir : book.sort }, "PUT");
    });
  };
  return (
    <Modal
      title={book ? `✎ ${book.emoji} ${book.name}` : "＋ New notebook"}
      onClose={onClose}
      actions={
        <>
          {book && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                confirm(`Delete “${book.name}”? Its notes move to another notebook (nothing is lost).`) &&
                void run(async () => {
                  const r = await notesApi.write<{ name: string }>(`notebooks/${book.id}`, {}, "DELETE");
                  fx.toast(`Notes moved to ${r.data.name}`, "📦");
                  return null;
                })
              }
            >
              Delete
            </button>
          )}
          <button
            className="btn primary"
            disabled={busy || !name.trim()}
            onClick={() =>
              void run(async () => {
                if (book) await notesApi.write(`notebooks/${book.id}`, { name, emoji, color }, "PUT");
                else return (await notesApi.write<Notebook>("notebooks", { name, emoji, color, kind })).data.id;
              })
            }
          >
            {book ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. CET timetable, Work, Ideas" />
      </Field>
      <Field label="Icon">
        <EmojiInput value={emoji} onChange={setEmoji} />
      </Field>
      <Field label="Tab colour">
        <div className="row wrap">
          {NOTEBOOK_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch-btn nb-${c} binder-swatch ${color === c ? "on" : ""}`} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
      </Field>
      {!book && (
        <Field label="Kind" help="Journal entries are dated, and writing in them every day powers your journal quest and writing trophies.">
          <div className="row wrap">
            <label className="check">
              <input type="radio" checked={kind === "notes"} onChange={() => setKind("notes")} /> 📒 Notes
            </label>
            <label className="check">
              <input type="radio" checked={kind === "journal"} onChange={() => setKind("journal")} /> 📔 Journal
            </label>
          </div>
        </Field>
      )}
      {book && books.length > 1 && (
        <Field label="Position">
          <div className="row">
            <button className="btn sm" disabled={busy || idx <= 0} onClick={() => swap(-1)}>
              ◀ Move left
            </button>
            <button className="btn sm" disabled={busy || idx >= books.length - 1} onClick={() => swap(1)}>
              Move right ▶
            </button>
          </div>
        </Field>
      )}
    </Modal>
  );
}

function LabelsModal({ labels, onClose, onChanged }: { labels: NoteLabel[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const fx = useFx();
  const [name, setName] = useState("");
  const call = async (path: string, body: object, method = "POST") => {
    try {
      await notesApi.write(path, body, method);
      await onChanged();
    } catch (e) {
      fx.error((e as Error).message);
    }
  };
  return (
    <Modal title="🏷 Labels" onClose={onClose}>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void call("note-labels", { name: name.trim() }).then(() => setName(""));
        }}
      >
        <input className="input" placeholder="New label (e.g. Work, CET, Ideas)" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button className="btn good sm" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>
      <div className="list" style={{ marginTop: 8 }}>
        {labels.map((l) => (
          <div className="li" key={l.id}>
            <input
              className="input grow"
              defaultValue={l.name}
              maxLength={30}
              aria-label="Label name"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.name && void call(`note-labels/${l.id}`, { name: e.target.value.trim() }, "PUT")}
            />
            <select className="input" style={{ width: 110 }} value={l.color ?? ""} onChange={(e) => void call(`note-labels/${l.id}`, { color: e.target.value || null }, "PUT")} aria-label="Label colour">
              <option value="">No colour</option>
              {NOTE_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="btn xs danger" onClick={() => confirm(`Delete the label “${l.name}”? Notes keep their content.`) && void call(`note-labels/${l.id}`, {}, "DELETE")} aria-label={`Delete ${l.name}`}>
              ✕
            </button>
          </div>
        ))}
        {!labels.length && <Empty emoji="🏷">Labels work across notebooks, like tags.</Empty>}
      </div>
    </Modal>
  );
}
