// Rich notes are stored as editor (TipTap / ProseMirror) JSON. The server keeps only the nodes,
// marks and attribute values listed here, so a note can never carry markup, scripts or odd styles,
// and the board renders previews from the same whitelist without loading the editor.

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

/** Fonts you can pick for a whole note or a selection. `css` is what the editor stores. */
export const NOTE_FONTS = [
  { id: "quest", label: "Pixel", css: "Quest, system-ui, sans-serif" },
  { id: "arcade", label: "Arcade", css: '"Press Start 2P", monospace' },
  { id: "sans", label: "Clean", css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "mono", label: "Mono", css: "ui-monospace, Consolas, monospace" },
  { id: "hand", label: "Handwritten", css: '"Patrick Hand", "Comic Sans MS", cursive' },
] as const;

export const FONT_SIZES = [
  { id: "0.85em", label: "Small" },
  { id: "1.25em", label: "Large" },
  { id: "1.6em", label: "Huge" },
  { id: "2.2em", label: "Giant" },
] as const;

/** Text colours and highlighter pens are CSS variables, so they adapt to day/night themes. */
export const TEXT_COLORS = ["red", "orange", "gold", "green", "teal", "blue", "violet", "pink", "gray"] as const;
export const HIGHLIGHTS = ["yellow", "green", "blue", "pink", "violet", "orange"] as const;
export const textColor = (c: string) => `var(--tc-${c})`;
export const highlightColor = (c: string) => `var(--hl-${c})`;

/** Card colours (Keep-style) and paper styles (OneNote-style). */
export const NOTE_COLORS = ["coral", "peach", "lemon", "mint", "sky", "violet", "pink", "sand", "slate"] as const;
export const PAPERS = ["plain", "lined", "grid", "dots"] as const;
export const NOTEBOOK_COLORS = ["lemon", "pink", "mint", "sky", "violet", "peach", "coral", "sand"] as const;
export const REPEATS = ["daily", "weekly", "monthly"] as const;
export const IMAGE_SIZES = ["s", "m", "l", "full"] as const;

export const MAX_DOC_CHARS = 100_000;
const MAX_DEPTH = 24;
const MAX_NODES = 20_000;

export const emptyDoc = (): PMNode => ({ type: "doc", content: [{ type: "paragraph" }] });

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------
type Clean = (v: unknown) => unknown;
const oneOf =
  (list: readonly string[]): Clean =>
  (v) =>
    typeof v === "string" && list.includes(v) ? v : undefined;
const int =
  (min: number, max: number): Clean =>
  (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  };
const bool: Clean = (v) => (v === true ? true : v === false ? false : undefined);
const align = oneOf(["left", "center", "right", "justify"]);
const cellAttrs = {
  colspan: int(1, 20),
  rowspan: int(1, 50),
  colwidth: (v: unknown) => (Array.isArray(v) && v.length <= 20 && v.every((x) => Number.isInteger(x) && x > 0 && x < 4000) ? v : undefined),
};

const NODES: Record<string, Record<string, Clean>> = {
  doc: {},
  paragraph: { textAlign: align },
  heading: { level: int(1, 3), textAlign: align },
  text: {},
  hardBreak: {},
  bulletList: {},
  orderedList: { start: int(0, 100000) },
  listItem: {},
  taskList: {},
  taskItem: { checked: bool },
  blockquote: {},
  codeBlock: {},
  horizontalRule: {},
  table: {},
  tableRow: {},
  tableHeader: cellAttrs,
  tableCell: cellAttrs,
  image: { media: int(1, 2 ** 31), size: oneOf(IMAGE_SIZES), sketch: bool, alt: (v) => (typeof v === "string" ? v.slice(0, 200) : undefined) },
  audio: { media: int(1, 2 ** 31), duration: (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 36000 ? Math.round(Number(v)) : undefined) },
};

/** Media nodes are useless without a picture / clip. */
const NEEDS: Record<string, string> = { image: "media", audio: "media" };

const fontCss = (v: unknown) => {
  if (typeof v !== "string") return undefined;
  const firstFamily = v.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
  return NOTE_FONTS.find((f) => f.css.split(",")[0].replace(/["']/g, "").trim().toLowerCase() === firstFamily)?.css;
};

export function safeHref(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 1000) return undefined;
  const s = v.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) {
    try {
      const u = new URL(s);
      return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol) ? s : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const MARKS: Record<string, Record<string, Clean>> = {
  bold: {},
  italic: {},
  underline: {},
  strike: {},
  code: {},
  link: { href: safeHref },
  highlight: { color: oneOf(HIGHLIGHTS.map(highlightColor)) },
  textStyle: { color: oneOf(TEXT_COLORS.map(textColor)), fontFamily: fontCss, fontSize: oneOf(FONT_SIZES.map((s) => s.id)) },
};

function cleanAttrs(spec: Record<string, Clean>, raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, fn] of Object.entries(spec)) {
    const v = fn((raw as Record<string, unknown>)[k]);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanMarks(raw: unknown): PMMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PMMark[] = [];
  for (const m of raw.slice(0, 12)) {
    if (!m || typeof m !== "object" || !Object.hasOwn(MARKS, m.type) || out.some((x) => x.type === m.type)) continue;
    const attrs = cleanAttrs(MARKS[m.type], m.attrs);
    if (m.type === "link" && !attrs) continue; // a link without a safe address is just text
    if (m.type === "textStyle" && !attrs) continue;
    out.push(attrs ? { type: m.type, attrs } : { type: m.type });
  }
  return out.length ? out : undefined;
}

/** Returns a copy of `raw` with everything not on the whitelist removed. Never throws. */
export function sanitizeDoc(raw: unknown): PMNode {
  let count = 0;
  const walk = (n: unknown, depth: number): PMNode | null => {
    if (!n || typeof n !== "object" || depth > MAX_DEPTH || ++count > MAX_NODES) return null;
    const node = n as PMNode;
    if (typeof node.type !== "string" || !Object.hasOwn(NODES, node.type)) return null;
    if (node.type === "text") {
      if (typeof node.text !== "string" || !node.text) return null;
      const marks = cleanMarks(node.marks);
      return marks ? { type: "text", text: node.text.slice(0, 50_000), marks } : { type: "text", text: node.text.slice(0, 50_000) };
    }
    const out: PMNode = { type: node.type };
    const attrs = cleanAttrs(NODES[node.type], node.attrs);
    if (NEEDS[node.type] && attrs?.[NEEDS[node.type]] === undefined) return null;
    if (attrs) out.attrs = attrs;
    if (Array.isArray(node.content)) {
      const kids = node.content.map((c) => walk(c, depth + 1)).filter((c): c is PMNode => c !== null);
      if (kids.length) out.content = kids;
    }
    return out;
  };
  const root = raw && typeof raw === "object" && (raw as PMNode).type === "doc" ? walk(raw, 0) : null;
  if (!root?.content?.length) return emptyDoc();
  return root;
}

// ---------------------------------------------------------------------------
// Summaries for the board / search / journal word counts
// ---------------------------------------------------------------------------
const BLOCKS = new Set(["paragraph", "heading", "codeBlock", "blockquote", "listItem", "taskItem", "tableRow", "horizontalRule"]);

export interface DocSummary {
  text: string;
  words: number;
  media: number[];
  images: number[];
  audio: number;
  tasks: [number, number];
  preview: PMNode;
}

/** Plain text, word count, media used and a short preview, from a sanitised doc. */
export function summarize(doc: PMNode, opts: { blocks?: number; chars?: number } = {}): DocSummary {
  const parts: string[] = [];
  const media = new Set<number>();
  const images: number[] = [];
  let audio = 0;
  const tasks: [number, number] = [0, 0];
  const visit = (n: PMNode) => {
    if (n.type === "text") parts.push(n.text ?? "");
    else if (n.type === "hardBreak") parts.push("\n");
    else if (n.type === "image" || n.type === "audio") {
      const id = Number(n.attrs?.media);
      if (id) media.add(id);
      if (n.type === "image" && id && !images.includes(id)) images.push(id);
      if (n.type === "audio") audio++;
    } else if (n.type === "tableHeader" || n.type === "tableCell") parts.push(" ");
    if (n.type === "taskItem") {
      tasks[1]++;
      if (n.attrs?.checked) tasks[0]++;
    }
    for (const c of n.content ?? []) visit(c);
    if (BLOCKS.has(n.type)) parts.push("\n");
  };
  visit(doc);
  const text = parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text,
    words: (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length,
    media: [...media],
    images,
    audio,
    tasks,
    preview: previewOf(doc, opts.blocks ?? 9, opts.chars ?? 420),
  };
}

/** The first few blocks of a doc (text trimmed, tables cut down, pictures and clips left out). */
export function previewOf(doc: PMNode, maxBlocks: number, maxChars: number): PMNode {
  let blocks = maxBlocks;
  let chars = maxChars;
  const cut = (n: PMNode, inTable = false): PMNode | null => {
    if (blocks <= 0 || chars <= 0) return null;
    if (n.type === "image" || n.type === "audio") return null;
    if (n.type === "text") {
      const t = n.text ?? "";
      const take = t.length > chars ? `${t.slice(0, Math.max(1, chars)).trimEnd()}…` : t;
      chars -= t.length;
      return { ...n, text: take };
    }
    // a table row counts as one line, not one per cell
    if (n.type === "tableRow" || (!inTable && (n.type === "paragraph" || n.type === "heading" || n.type === "codeBlock" || n.type === "horizontalRule"))) blocks--;
    let kids = n.content;
    if (n.type === "table") kids = kids?.slice(0, 5);
    if (n.type === "tableRow") kids = kids?.slice(0, 4);
    const out: PMNode = { ...n };
    if (kids) {
      const c = kids.map((k) => cut(k, inTable || n.type === "table")).filter((x): x is PMNode => x !== null);
      if (c.length) out.content = c;
      else delete out.content;
    }
    if (n.type !== "doc" && n.type !== "paragraph" && n.type !== "tableCell" && n.type !== "tableHeader" && n.type !== "horizontalRule" && !out.content?.length)
      return null;
    return out;
  };
  return cut(doc) ?? emptyDoc();
}

/** Words in some plain text (used for titles). */
export const countWords = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length;
