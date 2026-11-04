// Turns pasted cells, a CSV file or an Excel workbook into (date, value) rows for a tracker's
// history import. Runs in the browser; nothing is uploaded until you press Import.
import { unzipSync, strFromU8 } from "fflate";

export type Table = string[][];

export interface Picked {
  rows: { date: string; value: number }[];
  /** lines with no usable date or number (headers, notes, blanks) */
  skipped: number;
  /** dates listed more than once (the last one wins) */
  repeats: number;
}

const iso = (y: number, m: number, d: number) => {
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const fullYear = (y: number) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);

/** A cell as a date: 2016-10-31, 31/10/2016 (day first unless `monthFirst`), 31-Oct-16, Oct 31 2016… */
export function parseDate(cell: string, monthFirst = false): string | null {
  const s = cell.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/);
  if (m) return monthFirst ? iso(fullYear(+m[3]), +m[1], +m[2]) : iso(fullYear(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ .,]*(\d{2,4})$/);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return iso(fullYear(+m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  m = s.match(/^([A-Za-z]{3,9})[ .-]+(\d{1,2})(?:st|nd|rd|th)?,?[ .-]+(\d{2,4})$/);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return iso(fullYear(+m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  return null;
}

/** A cell as a number ("58", "58.5 kg", "1,800"). */
export function parseNumber(cell: string): number | null {
  const m = cell.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Day-first unless some row only makes sense month-first (e.g. 10/31/2016). */
export function guessMonthFirst(cells: string[]) {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const c of cells) {
    const m = c.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dayFirst++;
    if (+m[2] > 12) monthFirst++;
  }
  return monthFirst > dayFirst;
}

/** Pasted cells (tabs from Excel/Sheets) or CSV text into rows of cells. */
export function parseText(text: string): Table {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const tabs = lines.some((l) => l.includes("\t"));
  const semi = !tabs && lines.filter((l) => l.includes(";")).length > lines.length / 2 && !lines.some((l) => l.includes(","));
  return lines.map((l) => (tabs ? l.split("\t") : splitCsv(l, semi ? ";" : ",")).map((c) => c.trim()));
}

function splitCsv(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const unxml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Built-in Excel number formats that are dates. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** The first sheet of an .xlsx workbook (dates come out as YYYY-MM-DD). */
export function parseXlsx(buf: Uint8Array): Table {
  const files = unzipSync(buf, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  // first sheet in the workbook's order
  const wb = text("xl/workbook.xml");
  const rid = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = text("xl/_rels/workbook.xml.rels");
  const target = rid ? rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : undefined;
  const sheetPath = target ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}` : Object.keys(files).find((f) => f.startsWith("xl/worksheets/"));
  const sheet = sheetPath ? text(sheetPath) : "";
  if (!sheet) throw new Error("Couldn't find a sheet in that workbook");
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml(m[1]));
  // which cell styles are dates
  const styles = text("xl/styles.xml");
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [+m[1], m[2]]));
  const isDateFmt = (id: number) => DATE_FORMATS.has(id) || /(^|[^"\\])[dmy]/i.test((custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, ""));
  const xfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const dateStyle = [...xfs.matchAll(/<xf\b([^>]*)\/?>/g)].map((m) => isDateFmt(+(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0)));

  const table: Table = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1] ?? "";
      const col = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length;
      const t = attrs.match(/\bt="(\w+)"/)?.[1];
      const s = +(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0);
      const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let out = "";
      if (t === "s" && v !== undefined) out = shared[+v] ?? "";
      else if (t === "inlineStr") out = unxml(c[2]?.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (v !== undefined) {
        out = unxml(v);
        const n = Number(out);
        // a date cell holds days since 1899-12-30
        if (t !== "str" && t !== "b" && dateStyle[s] && Number.isFinite(n) && n > 0) out = new Date(Math.round((n - 25569) * 86_400_000)).toISOString().slice(0, 10);
      }
      while (cells.length < col) cells.push("");
      cells[col] = out.trim();
    }
    if (cells.some(Boolean)) table.push(cells);
  }
  return table;
}

/** The likeliest date column and value column (preferring a header that names the tracker). */
export function guessColumns(table: Table, hints: string[]): { date: number; value: number } {
  const width = Math.max(0, ...table.map((r) => r.length));
  const score = (col: number, test: (c: string) => boolean) => table.reduce((a, r) => a + (r[col] && test(r[col]) ? 1 : 0), 0);
  let date = 0;
  for (let c = 1; c < width; c++) if (score(c, (x) => !!parseDate(x)) > score(date, (x) => !!parseDate(x))) date = c;
  const numeric = (x: string) => parseNumber(x) !== null && !parseDate(x);
  const words = hints.map((h) => h.toLowerCase()).filter(Boolean);
  let value = -1;
  for (let c = 0; c < width && value < 0; c++) {
    if (c === date) continue;
    const head = table.slice(0, 5).map((r) => (r[c] ?? "").toLowerCase());
    if (head.some((h) => words.some((w) => h.includes(w))) && score(c, numeric) > table.length / 3) value = c;
  }
  if (value < 0) {
    let best = -1;
    for (let c = 0; c < width; c++) if (c !== date && score(c, numeric) > best) (best = score(c, numeric)), (value = c);
  }
  return { date, value: Math.max(0, value) };
}

/** Rows with a real date (not in the future) and a number. */
export function pickRows(table: Table, dateCol: number, valueCol: number, monthFirst: boolean, today: string): Picked {
  const byDate = new Map<string, number>();
  let skipped = 0;
  let repeats = 0;
  for (const r of table) {
    const d = parseDate(r[dateCol] ?? "", monthFirst);
    const v = parseNumber(r[valueCol] ?? "");
    if (!d || v === null || d > today) {
      skipped++;
      continue;
    }
    if (byDate.has(d)) repeats++;
    byDate.set(d, v);
  }
  const rows = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
  return { rows, skipped, repeats };
}
