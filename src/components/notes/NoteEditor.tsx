// The note editor (loaded on demand). Rich text with fonts, sizes, colours, highlighter, headings,
// lists, checklists, tables, pictures, sketches and voice memos, plus everything around the note:
// binder, labels, colour, paper, pins, reminder and links. It saves itself as you type.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type NodeViewProps } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { prettyDate } from "../../../shared/dates";
import {
  countWords,
  emptyDoc,
  FONT_SIZES,
  HIGHLIGHTS,
  highlightColor,
  NOTE_COLORS,
  NOTE_FONTS,
  PAPERS,
  REPEATS,
  summarize,
  TEXT_COLORS,
  textColor,
  type PMNode,
} from "../../../shared/notedoc";
import type { Fx, Note, NoteCard, NoteLabel } from "../../../shared/types";
import { ApiError, uploadMedia } from "../../api";
import { useFx } from "../../fx";
import { prepareImage, type PicMode } from "../../media";
import { notesApi, parseDoc, parseIds, reminderLabel, type NotesData } from "../../notes";
import { useGame } from "../../store";
import { MediaImg } from "../Media";
import { AudioPlayer } from "./AudioPlayer";
import { SketchPad } from "./SketchPad";
import { VoiceRecorder } from "./VoiceRecorder";

// ---------------------------------------------------------------------------
// Picture and voice-memo blocks
// ---------------------------------------------------------------------------
interface MediaOptions {
  editSketch: (media: number, done: (media: number) => void) => void;
}

function ImageView({ node, updateAttributes, deleteNode, selected, extension }: NodeViewProps) {
  const a = node.attrs as { media: number; size: string; sketch: boolean };
  return (
    <NodeViewWrapper className={`note-img size-${a.size} ${selected ? "sel" : ""}`} data-drag-handle="">
      <MediaImg id={a.media} fit="contain" />
      {selected && (
        <div className="img-tools" contentEditable={false}>
          {(["s", "m", "l", "full"] as const).map((s) => (
            <button key={s} type="button" className={`btn xs ${a.size === s ? "gold" : ""}`} onClick={() => updateAttributes({ size: s })}>
              {s === "full" ? "↔" : s.toUpperCase()}
            </button>
          ))}
          {a.sketch && (
            <button type="button" className="btn xs" onClick={() => (extension.options as MediaOptions).editSketch(a.media, (m) => updateAttributes({ media: m }))}>
              ✏️
            </button>
          )}
          <button type="button" className="btn xs danger" onClick={deleteNode} aria-label="Remove picture">
            🗑
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

const MediaImage = Node.create<MediaOptions>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ editSketch: () => {} }),
  addAttributes() {
    return {
      media: { default: null, parseHTML: (el) => Number(el.getAttribute("data-media")) || null, renderHTML: (x) => ({ "data-media": x.media }) },
      size: { default: "m", parseHTML: (el) => el.getAttribute("data-size") || "m", renderHTML: (x) => ({ "data-size": x.size }) },
      sketch: { default: false, parseHTML: (el) => el.hasAttribute("data-sketch"), renderHTML: (x) => (x.sketch ? { "data-sketch": "" } : {}) },
    };
  },
  parseHTML: () => [{ tag: "figure[data-note-image]" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes({ "data-note-image": "" }, HTMLAttributes)],
  addNodeView: () => ReactNodeViewRenderer(ImageView),
});

function AudioView({ node, deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={`note-audio ${selected ? "sel" : ""}`} data-drag-handle="">
      <AudioPlayer id={Number(node.attrs.media)} duration={Number(node.attrs.duration) || 0} />
      <button type="button" className="btn xs danger" contentEditable={false} onClick={deleteNode} aria-label="Remove voice memo">
        🗑
      </button>
    </NodeViewWrapper>
  );
}

const AudioClip = Node.create({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      media: { default: null, parseHTML: (el) => Number(el.getAttribute("data-media")) || null, renderHTML: (x) => ({ "data-media": x.media }) },
      duration: { default: 0, parseHTML: (el) => Number(el.getAttribute("data-duration")) || 0, renderHTML: (x) => ({ "data-duration": x.duration }) },
    };
  },
  parseHTML: () => [{ tag: "div[data-note-audio]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes({ "data-note-audio": "" }, HTMLAttributes)],
  addNodeView: () => ReactNodeViewRenderer(AudioView),
});

// ---------------------------------------------------------------------------
// Little popover used by the toolbars (fixed-position so scrolling toolbars don't clip it)
// ---------------------------------------------------------------------------
function Pop({ label, title, up, wide, children, active }: { label: ReactNode; title: string; up?: boolean; wide?: boolean; active?: boolean; children: (close: () => void) => ReactNode }) {
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const away = (e: PointerEvent) => !panel.current?.contains(e.target as globalThis.Node) && !btn.current?.contains(e.target as globalThis.Node) && setAt(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setAt(null));
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key, true);
    };
  }, [at]);
  const toggle = () => {
    if (at) return setAt(null);
    const r = btn.current!.getBoundingClientRect();
    const w = wide ? 300 : 240;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setAt(up ? { left, bottom: window.innerHeight - r.top + 8 } : { left, top: r.bottom + 8 });
  };
  return (
    <>
      <button ref={btn} type="button" className={`btn xs ${at || active ? "pressed" : ""}`} title={title} aria-label={title} aria-expanded={!!at} onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
        {label}
      </button>
      {at && (
        <div ref={panel} className={`pop-panel panel ${wide ? "wide" : ""}`} style={{ position: "fixed", ...at }} onMouseDown={(e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.preventDefault()}>
          {children(() => setAt(null))}
        </div>
      )}
    </>
  );
}

const Tb = ({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) => (
  <button type="button" className={`btn xs ${on ? "pressed gold" : ""}`} title={title} aria-label={title} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {children}
  </button>
);

// The editor instance can be replaced (React StrictMode re-creates it); components that read
// editor state are keyed by instance so they always subscribe to the live one.
const instances = new WeakMap<Editor, number>();
let lastInstance = 0;
function instanceKey(e: Editor) {
  if (!instances.has(e)) instances.set(e, ++lastInstance);
  return instances.get(e)!;
}

function WordsChip({ editor, goal }: { editor: Editor; goal: number }) {
  const words = useEditorState({ editor, selector: ({ editor: e }) => (e && !e.isDestroyed ? countWords(e.getText()) : 0) }) ?? 0;
  return (
    <span className={`chip ${words >= goal ? "good" : ""}`} title="Words today count toward your journal quest">
      ✍️ {words}/{goal} words
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formatting toolbar
// ---------------------------------------------------------------------------
function Toolbar({ editor, onPicture, onSketch, onVoice }: { editor: Editor; onPicture: (mode: PicMode) => void; onSketch: () => void; onVoice: () => void }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => e && !e.isDestroyed && ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      heading: [1, 2, 3].find((l) => e.isActive("heading", { level: l })) ?? 0,
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
      table: e.isActive("table"),
      align: (["center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
      font: (e.getAttributes("textStyle").fontFamily as string | undefined) ?? "",
      size: (e.getAttributes("textStyle").fontSize as string | undefined) ?? "",
      color: (e.getAttributes("textStyle").color as string | undefined) ?? "",
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const [href, setHref] = useState("");
  if (!st) return null;
  const s = st;
  const c = () => editor.chain().focus();
  const stamp = (opts: Intl.DateTimeFormatOptions) => c().insertContent(new Date().toLocaleString("en-SG", opts) + " ").run();
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-row">
        <Tb title="Undo" onClick={() => c().undo().run()} disabled={!s.undo}>
          ↶
        </Tb>
        <Tb title="Redo" onClick={() => c().redo().run()} disabled={!s.redo}>
          ↷
        </Tb>
        <span className="tb-sep" />
        <Pop title="Font" label={<span className="tb-font">Aa▾</span>} active={!!s.font}>
          {(close) => (
            <div className="col" style={{ gap: 2 }}>
              <button type="button" className="pop-item" onClick={() => (c().unsetFontFamily().run(), close())}>
                ⟲ Note's font
              </button>
              {NOTE_FONTS.map((f) => (
                <button key={f.id} type="button" className={`pop-item ${s.font === f.css ? "on" : ""}`} style={{ fontFamily: f.css, fontSize: f.id === "arcade" ? 11 : 17 }} onClick={() => (c().setFontFamily(f.css).run(), close())}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </Pop>
        <Pop title="Text size" label="↕▾" active={!!s.size}>
          {(close) => (
            <div className="col" style={{ gap: 2 }}>
              <button type="button" className={`pop-item ${!s.size ? "on" : ""}`} onClick={() => (c().unsetFontSize().run(), close())}>
                Normal
              </button>
              {FONT_SIZES.map((z) => (
                <button key={z.id} type="button" className={`pop-item ${s.size === z.id ? "on" : ""}`} style={{ fontSize: `calc(16px * ${parseFloat(z.id)})` }} onClick={() => (c().setFontSize(z.id).run(), close())}>
                  {z.label}
                </button>
              ))}
            </div>
          )}
        </Pop>
        <span className="tb-sep" />
        <Tb title="Bold" on={s.bold} onClick={() => c().toggleBold().run()}>
          <b>B</b>
        </Tb>
        <Tb title="Italic" on={s.italic} onClick={() => c().toggleItalic().run()}>
          <i>I</i>
        </Tb>
        <Tb title="Underline" on={s.underline} onClick={() => c().toggleUnderline().run()}>
          <u>U</u>
        </Tb>
        <Tb title="Strike through" on={s.strike} onClick={() => c().toggleStrike().run()}>
          <s>S</s>
        </Tb>
        <Pop title="Text colour" label={<span className="tb-color" style={{ color: s.color || undefined }}>A▾</span>} active={!!s.color}>
          {(close) => (
            <div className="swatches">
              <button type="button" className="swatch none" onClick={() => (c().unsetColor().run(), close())} aria-label="Default colour">
                ⟲
              </button>
              {TEXT_COLORS.map((t) => (
                <button key={t} type="button" className={`swatch ${s.color === textColor(t) ? "on" : ""}`} style={{ background: textColor(t) }} onClick={() => (c().setColor(textColor(t)).run(), close())} aria-label={t} />
              ))}
            </div>
          )}
        </Pop>
        <Pop title="Highlighter" label="🖍▾">
          {(close) => (
            <div className="swatches">
              <button type="button" className="swatch none" onClick={() => (c().unsetHighlight().run(), close())} aria-label="No highlight">
                ⟲
              </button>
              {HIGHLIGHTS.map((h) => (
                <button key={h} type="button" className="swatch" style={{ background: highlightColor(h) }} onClick={() => (c().setHighlight({ color: highlightColor(h) }).run(), close())} aria-label={h} />
              ))}
            </div>
          )}
        </Pop>
        <span className="tb-sep" />
        <Pop title="Heading" label={s.heading ? `H${s.heading}▾` : "¶▾"} active={!!s.heading}>
          {(close) => (
            <div className="col" style={{ gap: 2 }}>
              <button type="button" className={`pop-item ${!s.heading ? "on" : ""}`} onClick={() => (c().setParagraph().run(), close())}>
                Normal text
              </button>
              {([1, 2, 3] as const).map((l) => (
                <button key={l} type="button" className={`pop-item nh nh${l} ${s.heading === l ? "on" : ""}`} onClick={() => (c().toggleHeading({ level: l }).run(), close())}>
                  Heading {l}
                </button>
              ))}
            </div>
          )}
        </Pop>
        <Tb title="Bullet list" on={s.bullet} onClick={() => c().toggleBulletList().run()}>
          •≡
        </Tb>
        <Tb title="Numbered list" on={s.ordered} onClick={() => c().toggleOrderedList().run()}>
          1≡
        </Tb>
        <Tb title="Checklist" on={s.task} onClick={() => c().toggleTaskList().run()}>
          ☑
        </Tb>
        <Pop title="Align" label={{ left: "⇤", center: "↔", right: "⇥", justify: "☰" }[s.align] + "▾"}>
          {(close) => (
            <div className="row">
              {(["left", "center", "right", "justify"] as const).map((a) => (
                <button key={a} type="button" className={`btn xs ${s.align === a ? "gold" : ""}`} onClick={() => (c().setTextAlign(a).run(), close())} aria-label={`Align ${a}`}>
                  {{ left: "⇤", center: "↔", right: "⇥", justify: "☰" }[a]}
                </button>
              ))}
            </div>
          )}
        </Pop>
        <span className="tb-sep" />
        <Pop title="Link" label="🔗" active={s.link} wide>
          {(close) => (
            <form
              className="col"
              onSubmit={(e) => {
                e.preventDefault();
                const v = (href || s.href).trim();
                if (!v) c().extendMarkRange("link").unsetLink().run();
                else c().extendMarkRange("link").setLink({ href: /^[a-z]+:/i.test(v) ? v : `https://${v}` }).run();
                setHref("");
                close();
              }}
            >
              <input className="input" autoFocus placeholder="https://…" defaultValue={s.href} onChange={(e) => setHref(e.target.value)} />
              <div className="row">
                <button className="btn sm good" type="submit">
                  Apply
                </button>
                {s.link && (
                  <button className="btn sm" type="button" onClick={() => (c().extendMarkRange("link").unsetLink().run(), close())}>
                    Remove
                  </button>
                )}
              </div>
              <span className="tiny muted">Select some text first, or the address becomes the link text.</span>
            </form>
          )}
        </Pop>
        <Pop title="Insert" label="＋▾">
          {(close) => (
            <div className="col" style={{ gap: 2 }}>
              <button type="button" className="pop-item" onClick={() => (c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), close())}>
                ▦ Table
              </button>
              <button type="button" className="pop-item" onClick={() => (c().toggleBlockquote().run(), close())}>
                ❝ Quote
              </button>
              <button type="button" className="pop-item" onClick={() => (c().toggleCodeBlock().run(), close())}>
                {"</>"} Code block
              </button>
              <button type="button" className="pop-item" onClick={() => (c().toggleCode().run(), close())}>
                ` Inline code
              </button>
              <button type="button" className="pop-item" onClick={() => (c().setHorizontalRule().run(), close())}>
                ― Divider
              </button>
              <button type="button" className="pop-item" onClick={() => (stamp({ hour: "2-digit", minute: "2-digit", hour12: false }), close())}>
                🕐 Time now
              </button>
              <button type="button" className="pop-item" onClick={() => (stamp({ weekday: "short", day: "numeric", month: "short", year: "numeric" }), close())}>
                📅 Today's date
              </button>
              <button type="button" className="pop-item" onClick={() => (c().unsetAllMarks().clearNodes().run(), close())}>
                🧹 Clear formatting
              </button>
            </div>
          )}
        </Pop>
        <span className="tb-sep" />
        <Tb title="Add photo" onClick={() => onPicture("photo")}>
          📷
        </Tb>
        <Tb title="Add picture as pixel art" onClick={() => onPicture("pixel")}>
          👾
        </Tb>
        <Tb title="Sketch" onClick={onSketch}>
          ✏️
        </Tb>
        <Tb title="Voice memo" onClick={onVoice}>
          🎙️
        </Tb>
      </div>
      {s.table && (
        <div className="tb-row table-tools">
          <span className="tiny muted">Table:</span>
          <Tb title="Add row below" onClick={() => c().addRowAfter().run()}>
            ＋row
          </Tb>
          <Tb title="Add column right" onClick={() => c().addColumnAfter().run()}>
            ＋col
          </Tb>
          <Tb title="Delete row" onClick={() => c().deleteRow().run()}>
            −row
          </Tb>
          <Tb title="Delete column" onClick={() => c().deleteColumn().run()}>
            −col
          </Tb>
          <Tb title="Header row on/off" onClick={() => c().toggleHeaderRow().run()}>
            ▤
          </Tb>
          <Tb title="Merge / split cells" onClick={() => c().mergeOrSplit().run()}>
            ⊞
          </Tb>
          <Tb title="Delete table" onClick={() => c().deleteTable().run()}>
            🗑
          </Tb>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor sheet
// ---------------------------------------------------------------------------
const MOODS = ["🤩", "😄", "🙂", "😐", "😕", "😢", "😡", "😴", "🤒"];
const PAPER_LABEL: Record<string, string> = { plain: "Plain", lined: "Lined", grid: "Grid", dots: "Dots" };
const REPEAT_LABEL: Record<string, string> = { daily: "Every day", weekly: "Every week", monthly: "Every month" };

interface Meta {
  notebook_id: number | null;
  color: string | null;
  paper: string;
  font: string;
  mood: string | null;
  labels: number[];
  pinned: number;
  pin_today: number;
  archived: number;
  journal_date: string | null;
  goal_id: number | null;
  sprint_id: number | null;
  event_id: number | null;
  remind_at: string | null;
  remind_repeat: string | null;
}

export interface EditorInit extends Partial<Omit<Meta, "labels">> {
  labels?: number[];
  doc?: PMNode;
  title?: string;
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const at = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const PROMPT: PMNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "🌟 Today's wins" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "🙏 Grateful for" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "🌱 What I learned / felt" }] },
    { type: "paragraph" },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "🎯 Tomorrow I will" }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }] },
  ],
};

export default function NoteEditor({
  data,
  note,
  init,
  start,
  onSaved,
  onRemoved,
  onLabels,
  onClose,
}: {
  data: NotesData;
  note: Note | null;
  init?: EditorInit;
  /** open a tool straight away, or add pictures picked on the board */
  start?: "sketch" | "voice" | { files: File[] } | null;
  onSaved: (card: NoteCard) => void;
  onRemoved: (id: number) => void;
  onLabels: (labels: NoteLabel[]) => void;
  onClose: () => void;
}) {
  const fx = useFx();
  const { state, refresh } = useGame();
  const [meta, setMeta] = useState<Meta>(() => ({
    notebook_id: note?.notebook_id ?? init?.notebook_id ?? data.notebooks[0]?.id ?? null,
    color: note?.color ?? init?.color ?? null,
    paper: note?.paper ?? init?.paper ?? "plain",
    font: note?.font ?? init?.font ?? "quest",
    mood: note?.mood ?? null,
    labels: note ? parseIds(note.labels) : (init?.labels ?? []),
    pinned: note?.pinned ?? init?.pinned ?? 0,
    pin_today: note?.pin_today ?? init?.pin_today ?? 0,
    archived: note?.archived ?? 0,
    journal_date: note?.journal_date ?? init?.journal_date ?? null,
    goal_id: note?.goal_id ?? init?.goal_id ?? null,
    sprint_id: note?.sprint_id ?? init?.sprint_id ?? null,
    event_id: note?.event_id ?? init?.event_id ?? null,
    remind_at: note?.remind_at ?? null,
    remind_repeat: note?.remind_repeat ?? null,
  }));
  const [title, setTitle] = useState(note?.title ?? init?.title ?? "");
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error" | "conflict">("saved");
  const [tool, setTool] = useState<null | { kind: "sketch"; from?: number; done?: (m: number) => void } | { kind: "voice" }>(null);
  const notebook = data.notebooks.find((n) => n.id === meta.notebook_id);
  const journal = notebook?.kind === "journal";

  // ---- saving ----
  const idRef = useRef<number | null>(note?.id ?? null);
  const revRef = useRef<number | undefined>(note?.rev);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const statusRef = useRef(status);
  statusRef.current = status;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const titleRef = useRef(title);
  titleRef.current = title;
  const editorRef = useRef<Editor | null>(null);

  const played = useCallback(
    (list: NoteCard | null, fxList: Fx[]) => {
      if (list) {
        onSaved(list);
        // the server decides a journal entry's day; mirror it
        if (list.journal_date !== metaRef.current.journal_date) setMeta((m) => ({ ...m, journal_date: list.journal_date }));
      }
      if (fxList.length) {
        fx.play(fxList, state);
        void refresh();
      }
    },
    [fx, onSaved, refresh, state],
  );

  const save = useCallback(
    async (opts: { sync?: boolean } = {}) => {
      const ed = editorRef.current;
      if (!ed || statusRef.current === "conflict") return;
      const body = pending.current;
      pending.current = {};
      if (body.doc) body.doc = ed.getJSON();
      const id = idRef.current;
      try {
        if (id === null) {
          const sum = summarize(ed.getJSON() as PMNode);
          if (!titleRef.current.trim() && !sum.words && !sum.media.length) {
            setStatus("saved");
            return;
          }
          setStatus("saving");
          const m = metaRef.current;
          const r = await notesApi.write<Note>("notes", { ...m, title: titleRef.current, doc: ed.getJSON(), sync: opts.sync });
          idRef.current = r.data.id;
          revRef.current = r.data.rev;
          played(r.data, r.fx);
        } else {
          if (!Object.keys(body).length && !opts.sync) return;
          setStatus("saving");
          const content = "doc" in body || "title" in body;
          const r = await notesApi.write<NoteCard>(`notes/${id}`, { ...body, ...(content && revRef.current !== undefined ? { rev: revRef.current } : {}), ...(opts.sync ? { sync: true } : {}) }, "PUT");
          revRef.current = r.data.rev;
          played(r.data, r.fx);
        }
        setStatus(Object.keys(pending.current).length ? "dirty" : "saved");
      } catch (e) {
        pending.current = { ...body, ...pending.current }; // keep it for the next try (newer edits win)
        if (body.doc) pending.current.doc = true;
        if (e instanceof ApiError && e.status === 409) setStatus("conflict");
        else {
          setStatus("error");
          fx.error(`Couldn't save: ${(e as Error).message}`);
        }
      }
    },
    [fx, played],
  );

  const flush = useCallback(
    (opts: { sync?: boolean } = {}) => {
      clearTimeout(timer.current);
      chain.current = chain.current.then(() => save(opts));
      return chain.current;
    },
    [save],
  );

  const queue = useCallback(
    (fields: Record<string, unknown>) => {
      Object.assign(pending.current, fields);
      if (statusRef.current === "conflict") return;
      setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 900);
    },
    [flush],
  );

  const change = (fields: Partial<Meta>) => {
    setMeta((m) => ({ ...m, ...fields }));
    queue(fields);
  };

  // ---- media ----
  const fileIn = useRef<HTMLInputElement>(null);
  const picMode = useRef<PicMode>("photo");
  const [uploading, setUploading] = useState(false);
  const addPicture = useCallback(
    async (file: File, mode: PicMode) => {
      setUploading(true);
      try {
        const pic = await prepareImage(file, mode);
        const media = await uploadMedia(pic.blob, pic.width, pic.height);
        editorRef.current?.chain().focus().insertContent({ type: "image", attrs: { media, size: mode === "pixel" ? "s" : "m" } }).run();
      } catch (e) {
        fx.error((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [fx],
  );
  const addPictureRef = useRef(addPicture);
  addPictureRef.current = addPicture;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const journalRef = useRef(journal);
  journalRef.current = journal;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
        dropcursor: { color: "#7c5cff", width: 3 },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: () => (journalRef.current ? "Dear diary… how was today?" : "Write something…") }),
      MediaImage.configure({ editSketch: (media, done) => setTool({ kind: "sketch", from: media, done }) }),
      AudioClip,
    ],
    content: parseDoc(note?.doc) ?? init?.doc ?? emptyDoc(),
    editorProps: {
      attributes: { class: "note-body-pm", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        files.slice(0, 6).forEach((f) => void addPictureRef.current(f, "photo"));
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        files.slice(0, 6).forEach((f) => void addPictureRef.current(f, "photo"));
        return true;
      },
    },
    onUpdate: () => queueRef.current({ doc: true }),
  });
  editorRef.current = editor;


  // open a tool straight away (from the "take a note" bar)
  useEffect(() => {
    if (start === "sketch") setTool({ kind: "sketch" });
    else if (start === "voice") setTool({ kind: "voice" });
    else if (start) start.files.slice(0, 6).forEach((f) => void addPictureRef.current(f, "photo"));
    else if (!note) setTimeout(() => (init?.title ? editorRef.current?.commands.focus("end") : document.querySelector<HTMLInputElement>(".note-title")?.focus()), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // save when the app goes to the background; save + sync when the editor goes away
  useEffect(() => {
    const vis = () => document.visibilityState === "hidden" && void flush({ sync: true });
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      clearTimeout(timer.current);
    };
  }, [flush]);

  const close = async () => {
    await flush({ sync: true });
    if (Object.keys(pending.current).length && statusRef.current !== "saved" && !confirm("Some changes couldn't be saved. Close anyway?")) return;
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !tool && !document.querySelector(".pop-panel") && void closeRef.current();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [tool]);

  const resolveConflict = async (keepMine: boolean) => {
    if (keepMine) {
      revRef.current = undefined; // overwrite
      setStatus("dirty");
      statusRef.current = "dirty";
      pending.current.doc = true;
      pending.current.title = titleRef.current;
      await flush();
      return;
    }
    const fresh = await notesApi.get(idRef.current!);
    revRef.current = fresh.rev;
    pending.current = {};
    setTitle(fresh.title);
    editor?.commands.setContent(parseDoc(fresh.doc) ?? emptyDoc(), { emitUpdate: false });
    setStatus("saved");
  };

  const act = async (path: string, toast?: [string, string]) => {
    await flush();
    if (idRef.current === null) return null;
    const r = await notesApi.write<NoteCard>(`notes/${idRef.current}/${path}`);
    if (toast) fx.toast(toast[0], toast[1]);
    played(null, r.fx);
    return r.data;
  };

  const trash = async () => {
    if (idRef.current === null) return onClose();
    try {
      const card = await act("trash", [`Moved to the trash (kept ${data.trash_days} days)`, "🗑️"]);
      if (card) onRemoved(card.id);
      onClose();
    } catch (e) {
      fx.error((e as Error).message);
    }
  };
  const duplicate = async () => {
    try {
      const copy = await act("duplicate", ["Copied", "📑"]);
      if (copy) onSaved(copy);
    } catch (e) {
      fx.error((e as Error).message);
    }
  };
  const archive = async () => {
    change({ archived: meta.archived ? 0 : 1 });
    if (!meta.archived) {
      await flush({ sync: true });
      fx.toast("Archived", "🗄️");
      onClose();
    }
  };

  const createLabel = async (name: string) => {
    try {
      const r = await notesApi.write<NoteLabel>("note-labels", { name });
      onLabels([...data.labels, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      change({ labels: [...meta.labels, r.data.id] });
    } catch (e) {
      fx.error((e as Error).message);
    }
  };

  const labelsOn = data.labels.filter((l) => meta.labels.includes(l.id));
  const goal = state.goals.find((x) => x.id === meta.goal_id);
  const sprint = state.sprints.find((x) => x.id === meta.sprint_id);
  const event = state.events.find((x) => x.id === meta.event_id);
  const statusText = { saved: idRef.current ? "Saved ✓" : "", dirty: "Editing…", saving: "Saving…", error: "⚠ Not saved", conflict: "⚠ Changed elsewhere" }[status];
  const goalWords = state.quests.find((q) => q.metric_key === "journal" && q.active)?.metric_value ?? state.metrics.find((m) => m.key === "journal")?.target ?? 30;

  if (!editor) return null;
  return (
    <div className="overlay note-overlay" onMouseDown={(e) => e.target === e.currentTarget && void close()}>
      <div className={`note-sheet panel nc-${meta.color ?? "none"}`} role="dialog" aria-modal="true" aria-label={title || "Note"}>
        <div className="note-top">
          <button className="btn xs" onClick={() => void close()} aria-label="Done">
            ✓ Done
          </button>
          <select className="input nb-select" value={meta.notebook_id ?? ""} onChange={(e) => change({ notebook_id: Number(e.target.value) })} aria-label="Notebook">
            {data.notebooks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.emoji} {n.name}
              </option>
            ))}
          </select>
          <span className={`tiny save-state ${status}`}>{uploading ? "Uploading…" : statusText}</span>
          <span className="grow" />
          <Tb title={meta.pinned ? "Unpin" : "Pin to the top"} on={!!meta.pinned} onClick={() => change({ pinned: meta.pinned ? 0 : 1 })}>
            📌
          </Tb>
        </div>
        {status === "conflict" && (
          <div className="alert gold" style={{ margin: "6px 10px" }}>
            <span className="big">⚠️</span>
            <div className="grow small">This note was changed on another device. Which version do you want?</div>
            <button className="btn xs" onClick={() => void resolveConflict(false)}>
              Load theirs
            </button>
            <button className="btn xs gold" onClick={() => void resolveConflict(true)}>
              Keep mine
            </button>
          </div>
        )}
        <Toolbar key={instanceKey(editor)} editor={editor} onPicture={(m) => ((picMode.current = m), fileIn.current?.click())} onSketch={() => setTool({ kind: "sketch" })} onVoice={() => setTool({ kind: "voice" })} />
        <div className={`note-scroll paper-${meta.paper}`}>
          {journal && (
            <div className="journal-row">
              <input
                type="date"
                className="input journal-date"
                value={meta.journal_date ?? state.today}
                max={state.today}
                onChange={(e) => e.target.value && change({ journal_date: e.target.value })}
                aria-label="Journal date"
              />
              <span className="small ink2 hide-sm">{prettyDate(meta.journal_date ?? state.today)}</span>
              <span className="grow" />
              <WordsChip key={instanceKey(editor)} editor={editor} goal={goalWords} />
            </div>
          )}
          {journal && (
            <div className="mood-row" role="radiogroup" aria-label="Mood">
              {MOODS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={meta.mood === m} className={`mood ${meta.mood === m ? "on" : ""}`} onClick={() => change({ mood: meta.mood === m ? null : m })}>
                  {m}
                </button>
              ))}
              {editor.isEmpty && (
                <button
                  type="button"
                  className="btn xs violet"
                  onClick={() => {
                    editor.commands.setContent(PROMPT);
                    // start typing in the first empty bullet
                    let at: number | null = null;
                    editor.state.doc.descendants((n, pos) => {
                      if (at === null && n.type.name === "paragraph" && !n.content.size) at = pos + 1;
                      return at === null;
                    });
                    editor.chain().focus(at ?? "end").run();
                  }}
                >
                  ✨ Prompts
                </button>
              )}
            </div>
          )}
          <input
            className={`note-title font-${meta.font}`}
            value={title}
            placeholder={journal ? "Title (optional)" : "Title"}
            maxLength={200}
            onChange={(e) => (setTitle(e.target.value), queue({ title: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), editor.commands.focus("start"))}
          />
          <EditorContent editor={editor} className={`note-body font-${meta.font}`} />
          {!!(labelsOn.length || meta.remind_at || goal || sprint || event || meta.pin_today) && (
            <div className="note-chips">
              {meta.pin_today ? <span className="chip warn">☀️ On Camp</span> : null}
              {meta.remind_at && (
                <span className="chip xp">
                  ⏰ {reminderLabel(meta.remind_at)}
                  {meta.remind_repeat ? " 🔁" : ""}
                </span>
              )}
              {goal && <span className="chip good">🎯 {goal.title}</span>}
              {sprint && <span className="chip bad">⚔️ {sprint.title}</span>}
              {event && (
                <span className="chip">
                  {event.emoji} {event.title}
                </span>
              )}
              {labelsOn.map((l) => (
                <span key={l.id} className={`chip label-chip nc-${l.color ?? "none"}`}>
                  🏷 {l.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="note-bottom">
          <Pop title="Card colour" label="🎨" up>
            {(closeP) => (
              <div className="swatches">
                <button type="button" className={`swatch nc-none ${!meta.color ? "on" : ""}`} onClick={() => (change({ color: null }), closeP())} aria-label="No colour" />
                {NOTE_COLORS.map((c) => (
                  <button key={c} type="button" className={`swatch nc-${c} ${meta.color === c ? "on" : ""}`} onClick={() => (change({ color: c }), closeP())} aria-label={c} />
                ))}
              </div>
            )}
          </Pop>
          <Pop title="Paper" label="📄" up>
            {(closeP) => (
              <div className="row wrap">
                {PAPERS.map((p) => (
                  <button key={p} type="button" className={`paper-swatch paper-${p} ${meta.paper === p ? "on" : ""}`} onClick={() => (change({ paper: p }), closeP())}>
                    {PAPER_LABEL[p]}
                  </button>
                ))}
              </div>
            )}
          </Pop>
          <Pop title="Note font" label="🔤" up>
            {(closeP) => (
              <div className="col" style={{ gap: 2 }}>
                <span className="tiny muted">Font for the whole note</span>
                {NOTE_FONTS.map((f) => (
                  <button key={f.id} type="button" className={`pop-item ${meta.font === f.id ? "on" : ""}`} style={{ fontFamily: f.css, fontSize: f.id === "arcade" ? 11 : 17 }} onClick={() => (change({ font: f.id }), closeP())}>
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </Pop>
          <Pop title="Labels" label="🏷" up wide active={meta.labels.length > 0}>
            {() => <LabelPicker labels={data.labels} on={meta.labels} onToggle={(id) => change({ labels: meta.labels.includes(id) ? meta.labels.filter((x) => x !== id) : [...meta.labels, id] })} onCreate={createLabel} />}
          </Pop>
          <Pop title="Reminder" label="⏰" up wide active={!!meta.remind_at}>
            {(closeP) => (
              <div className="col">
                <b className="small">Remind me (in the app)</b>
                <div className="row wrap">
                  <button type="button" className="btn xs" onClick={() => change({ remind_at: at(0, 18) })}>
                    Today 6 pm
                  </button>
                  <button type="button" className="btn xs" onClick={() => change({ remind_at: at(1, 8) })}>
                    Tomorrow 8 am
                  </button>
                  <button type="button" className="btn xs" onClick={() => change({ remind_at: at(7, 9) })}>
                    In a week
                  </button>
                </div>
                <input type="datetime-local" className="input" value={toLocalInput(meta.remind_at)} onChange={(e) => change({ remind_at: e.target.value ? new Date(e.target.value).toISOString() : null })} aria-label="Reminder time" />
                <select className="input" value={meta.remind_repeat ?? ""} onChange={(e) => change({ remind_repeat: e.target.value || null })} aria-label="Repeat">
                  <option value="">Doesn't repeat</option>
                  {REPEATS.map((r) => (
                    <option key={r} value={r}>
                      {REPEAT_LABEL[r]}
                    </option>
                  ))}
                </select>
                {meta.remind_at && (
                  <button type="button" className="btn sm" onClick={() => (change({ remind_at: null, remind_repeat: null }), closeP())}>
                    Remove reminder
                  </button>
                )}
              </div>
            )}
          </Pop>
          <Pop title="Link to a goal, sprint or event" label="🔗" up wide active={!!(goal || sprint || event)}>
            {() => (
              <div className="col">
                <label className="field">
                  <span>🎯 Goal</span>
                  <select className="input" value={meta.goal_id ?? ""} onChange={(e) => change({ goal_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">—</option>
                    {state.goals.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.emoji} {x.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>⚔️ Sprint</span>
                  <select className="input" value={meta.sprint_id ?? ""} onChange={(e) => change({ sprint_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">—</option>
                    {state.sprints.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.boss_emoji} {x.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>📅 Event</span>
                  <select className="input" value={meta.event_id ?? ""} onChange={(e) => change({ event_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">—</option>
                    {[...state.events].reverse().map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.emoji} {x.title} ({x.date})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </Pop>
          <Tb title={meta.pin_today ? "Remove from Camp" : "Show on Camp (Today)"} on={!!meta.pin_today} onClick={() => change({ pin_today: meta.pin_today ? 0 : 1 })}>
            ☀️
          </Tb>
          <span className="grow" />
          <Pop title="More" label="⋯" up>
            {(closeP) => (
              <div className="col" style={{ gap: 2 }}>
                <span className="tiny muted" style={{ padding: "2px 6px" }}>
                  {countWords(editor.getText())} words{note ? ` · edited ${new Date(note.updated_at.replace(" ", "T") + "Z").toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                </span>
                <button type="button" className="pop-item" onClick={() => (closeP(), void archive())}>
                  {meta.archived ? "📤 Unarchive" : "🗄️ Archive"}
                </button>
                <button type="button" className="pop-item" disabled={idRef.current === null} onClick={() => (closeP(), void duplicate())}>
                  📑 Make a copy
                </button>
                <button type="button" className="pop-item danger" onClick={() => (closeP(), void trash())}>
                  🗑️ Move to trash
                </button>
              </div>
            )}
          </Pop>
        </div>
        <input
          ref={fileIn}
          type="file"
          accept="image/*"
          multiple
          className="hide"
          onChange={(e) => {
            [...(e.target.files ?? [])].slice(0, 6).forEach((f) => void addPicture(f, picMode.current));
            e.target.value = "";
          }}
        />
      </div>
      {tool?.kind === "sketch" && (
        <SketchPad
          from={tool.from}
          onClose={() => setTool(null)}
          onDone={(media) => {
            if (tool.done) tool.done(media);
            else editor.chain().focus().insertContent({ type: "image", attrs: { media, size: "l", sketch: true } }).run();
            setTool(null);
          }}
        />
      )}
      {tool?.kind === "voice" && (
        <VoiceRecorder
          onClose={() => setTool(null)}
          onDone={(media, duration) => {
            editor.chain().focus().insertContent({ type: "audio", attrs: { media, duration } }).run();
            setTool(null);
          }}
        />
      )}
    </div>
  );
}

function LabelPicker({ labels, on, onToggle, onCreate }: { labels: NoteLabel[]; on: number[]; onToggle: (id: number) => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const match = labels.filter((l) => l.name.toLowerCase().includes(name.trim().toLowerCase()));
  const exact = labels.some((l) => l.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <div className="col">
      <input className="input" placeholder="Find or create a label…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && !exact && (onCreate(name.trim()), setName(""))} />
      <div className="label-list">
        {match.map((l) => (
          <label key={l.id} className="check" style={{ margin: "2px 0" }}>
            <input type="checkbox" checked={on.includes(l.id)} onChange={() => onToggle(l.id)} />
            <span className={`label-dot nc-${l.color ?? "none"}`} /> {l.name}
          </label>
        ))}
        {!labels.length && !name && <span className="small muted">No labels yet. Type one above.</span>}
      </div>
      {name.trim() && !exact && (
        <button type="button" className="btn sm good" onClick={() => (onCreate(name.trim()), setName(""))}>
          ＋ Create “{name.trim()}”
        </button>
      )}
    </div>
  );
}
