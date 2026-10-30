// Export a character's data as an Excel workbook (.xlsx) or a .zip of CSV files, built in the
// browser from the full backup. Loaded on demand (Settings → Export).
import { strToU8, zipSync } from "fflate";
import { bmi } from "../shared/health";
import { sanitizeDoc, summarize } from "../shared/notedoc";
import { priorityOf } from "../shared/priority";
import { describeRepeat, parseRepeat } from "../shared/schedule";
import { api, g } from "./api";

type Cell = string | number | null | undefined | { date: string };
interface Sheet {
  name: string;
  head: string[];
  rows: Cell[][];
  /** column widths (characters) */
  widths?: number[];
}
type Row = Record<string, any>;

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const d = (v: unknown): Cell => (isDate(v) ? { date: v } : (v as Cell));
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return v ? (JSON.parse(String(v)) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Dates to export, inclusive ("YYYY-MM-DD"); null = everything. */
export interface Period {
  from: string;
  to: string;
}

/** Turns the backup's tables into friendly sheets (only rows inside `period` for dated sheets). */
function buildSheets(t: Record<string, Row[]>, period: Period | null = null): Sheet[] {
  const inP = (v: unknown) => {
    if (!period) return true;
    const s = typeof v === "string" ? v.slice(0, 10) : "";
    return isDate(s) && s >= period.from && s <= period.to;
  };
  /** something spanning a..b touches the period */
  const overlaps = (a?: string | null, b?: string | null) => !period || (!!a && a.slice(0, 10) <= period.to && (b ?? a).slice(0, 10) >= period.from);
  const settings = Object.fromEntries((t.settings ?? []).map((r) => [r.key, json(r.value, r.value)]));
  const seasons = new Map((t.seasons ?? []).map((s) => [s.id, s.name]));
  const quests = new Map((t.quests ?? []).map((q) => [q.id, q]));
  const metrics = [...(t.metrics ?? [])].sort((a, b) => a.sort - b.sort);
  const height = Number(settings.height_m) || 0;

  // Trackers, one column per tracker (plus BMI from weight), one row per date.
  const byDate = new Map<string, Record<string, number>>();
  for (const v of t.metric_values ?? []) {
    if (!byDate.has(v.date)) byDate.set(v.date, {});
    byDate.get(v.date)![v.metric_key] = v.value;
  }
  const dates = [...byDate.keys()].sort().filter(inP);
  const hasWeight = metrics.some((m) => m.key === "weight") && height > 0;

  const ledger = [...(t.ledger ?? [])].sort((a, b) => a.id - b.id);
  let bal = 0;

  // what happened in the chosen period
  const live = ledger.filter((l) => !l.voided && inP(l.date));
  const sum = (xs: Row[], k: string) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const weights = dates.map((x) => byDate.get(x)!.weight).filter((w): w is number => typeof w === "number");
  const cals = dates.map((x) => byDate.get(x)!.calories).filter((c): c is number => typeof c === "number");
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10 : null);
  const periodRows: Cell[][] = [
    ["Period", period ? `${period.from} to ${period.to}` : "Everything"],
    ["AP earned", sum(live.filter((l) => l.ap > 0), "ap")],
    ["AP spent / lost", -sum(live.filter((l) => l.ap < 0), "ap")],
    ["XP gained", sum(live, "xp")],
    ["Quests done", (t.quest_log ?? []).filter((l) => inP(l.date)).length],
    ["Days weighed", weights.length],
    ["Weight at start", weights[0] ?? null],
    ["Weight at end", weights.at(-1) ?? null],
    ["Weight change (kg)", weights.length > 1 ? Math.round((weights.at(-1)! - weights[0]) * 10) / 10 : null],
    ["Average calories", avg(cals)],
  ];
  const notebooks = new Map((t.notebooks ?? []).map((n) => [n.id, n.name]));
  const labels = new Map((t.note_labels ?? []).map((l) => [l.id, l.name]));
  const goals = new Map((t.goals ?? []).map((g) => [g.id, g]));
  const unlocks = t.achievement_unlocks ?? [];

  return [
    {
      name: "Summary",
      head: ["Item", "Value"],
      widths: [26, 40],
      rows: [
        ["Player", settings.player_name],
        ["Pet", settings.pet_name],
        ["Current season", seasons.get(settings.current_season) ?? settings.current_season],
        ["AP (current season)", ledger.filter((l) => !l.voided && l.season_id === settings.current_season).reduce((a, l) => a + l.ap, 0)],
        ["XP (current season)", ledger.filter((l) => !l.voided && l.season_id === settings.current_season).reduce((a, l) => a + l.xp, 0)],
        ["Best streak", t.player?.[0]?.best_streak],
        ["Height (m)", height || null],
        ["Exported", new Date().toLocaleString("en-SG")],
        [null, null],
        ...periodRows,
      ],
    },
    {
      name: "Trackers",
      head: ["Date", ...metrics.map((m) => `${m.name}${m.unit ? ` (${m.unit})` : ""}`), ...(hasWeight ? ["BMI"] : [])],
      widths: [12, ...metrics.map(() => 14), 8],
      rows: dates.map((date) => {
        const day = byDate.get(date)!;
        const w = day.weight;
        return [d(date), ...metrics.map((m) => day[m.key] ?? null), ...(hasWeight ? [w ? Math.round(bmi(w, height) * 10) / 10 : null] : [])];
      }),
    },
    {
      name: "AP ledger",
      head: ["Date", "Time (UTC)", "Season", "Kind", "What", "AP", "XP", "HP", "Balance", "Source", "Voided"],
      widths: [12, 18, 12, 10, 48, 8, 8, 8, 10, 12, 8],
      // the running balance counts everything before the period too, so it matches the game
      rows: ledger
        .map((l): [string, Cell[]] => {
          if (!l.voided && l.season_id === settings.current_season) bal += l.ap;
          return [l.date, [d(l.date), l.ts, seasons.get(l.season_id) ?? l.season_id, l.kind, l.description, l.ap, l.xp, l.hp, l.voided || l.season_id !== settings.current_season ? null : bal, l.source, l.voided ? "yes" : ""]];
        })
        .filter(([date]) => inP(date))
        .map(([, row]) => row),
    },
    {
      name: "Quests done",
      head: ["Date", "Quest", "Type", "Qty", "Auto", "Season"],
      widths: [12, 40, 10, 6, 6, 12],
      rows: [...(t.quest_log ?? [])]
        .filter((l) => inP(l.date))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
        .map((l) => {
          const q = quests.get(l.quest_id);
          return [d(l.date), q ? `${q.emoji} ${q.title}` : "(deleted quest)", q?.type, l.qty, l.auto ? "yes" : "", seasons.get(l.season_id) ?? l.season_id];
        }),
    },
    {
      name: "Quests",
      head: ["Quest", "Type", "Priority", "Schedule", "Due", "AP", "XP", "HP penalty", "Active", "Area", "Notes"],
      widths: [36, 8, 12, 30, 12, 6, 6, 10, 7, 10, 40],
      rows: [...(t.quests ?? [])].map((q) => {
        const rep = parseRepeat(q.repeat_rule);
        const sched = rep ? describeRepeat(rep) : q.type === "daily" ? (q.days === "1111111" ? "Every day" : q.days) : q.type === "weekly" ? `${q.weekly_target}× a week` : "";
        return [`${q.emoji} ${q.title}`, q.type, priorityOf(q.priority)?.label ?? "", sched, d(q.due_date), q.ap, q.xp, q.hp_penalty, q.active ? "yes" : "no", q.area, q.notes];
      }),
    },
    {
      name: "Purchases",
      head: ["Date", "Item", "Qty", "Unit price", "Total AP", "Voucher", "Note", "Season"],
      widths: [12, 36, 6, 10, 10, 24, 40, 12],
      rows: [...(t.purchases ?? [])].filter((p) => inP(p.date)).sort((a, b) => a.id - b.id).map((p) => [d(p.date), p.item_name, p.qty, p.unit_price, p.total, p.voucher_name, p.note, seasons.get(p.season_id) ?? p.season_id]),
    },
    {
      name: "Goals",
      head: ["Goal", "Status", "Mode", "Progress %", "Target date", "Completed", "AP", "XP"],
      widths: [36, 10, 12, 10, 12, 12, 8, 8],
      rows: [...(t.goals ?? [])].map((x) => [`${x.emoji} ${x.title}`, x.status, x.mode, x.progress, d(x.target_date), d(x.completed_at?.slice(0, 10)), x.ap, x.xp]),
    },
    {
      name: "Sprints",
      head: ["Sprint", "Boss", "Start", "End", "Status", "Tasks done", "Tasks", "Goal"],
      widths: [30, 22, 12, 12, 10, 10, 8, 30],
      rows: [...(t.sprints ?? [])].filter((s) => overlaps(s.start_date, s.end_date)).map((s) => {
        const tasks = (t.sprint_tasks ?? []).filter((x) => x.sprint_id === s.id);
        return [s.title, `${s.boss_emoji} ${s.boss}`, d(s.start_date), d(s.end_date), s.status, tasks.filter((x) => x.done_at).length, tasks.length, goals.get(s.goal_id)?.title];
      }),
    },
    {
      name: "Trophies",
      head: ["Trophy", "Tier", "Description", "Unlocked (UTC)", "Season"],
      widths: [30, 10, 44, 20, 12],
      // everything: all trophies (unlocked or not); a period: the ones unlocked in it
      rows: (t.achievements ?? []).flatMap((a) => {
        const got = unlocks.filter((u) => u.achievement_id === a.id && inP(u.unlocked_at));
        if (got.length) return got.map((u) => [`${a.emoji} ${a.name}`, a.tier, a.description, u.unlocked_at, seasons.get(u.season_id) ?? u.season_id]);
        return period ? [] : [[`${a.emoji} ${a.name}`, a.tier, a.description, "", ""]];
      }),
    },
    {
      name: "Events",
      head: ["Date", "Until", "Event", "Kind", "Notes"],
      widths: [12, 12, 36, 10, 60],
      rows: [...(t.events ?? [])].filter((e) => overlaps(e.date, e.end_date)).sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => [d(e.date), d(e.end_date), `${e.emoji} ${e.title}`, e.kind, e.notes]),
    },
    {
      name: "Notes",
      head: ["Notebook", "Title", "Journal date", "Mood", "Labels", "Words", "Created (UTC)", "Edited (UTC)", "Archived", "In trash", "Text"],
      widths: [14, 30, 12, 6, 20, 7, 18, 18, 8, 8, 80],
      // a period: notes written, edited or dated (journal) in it
      rows: [...(t.notes ?? [])].filter((n) => inP(n.journal_date) || inP(n.created_at) || inP(n.updated_at)).map((n) => {
        const text = summarize(sanitizeDoc(json(n.doc, null))).text;
        const labelNames = json<number[]>(n.labels, []).map((id) => labels.get(id)).filter(Boolean).join(", ");
        return [notebooks.get(n.notebook_id), n.title, d(n.journal_date), n.mood, labelNames, n.words, n.created_at, n.updated_at, n.archived ? "yes" : "", n.trashed_at ? "yes" : "", text];
      }),
    },
    {
      name: "Seasons",
      head: ["Season", "Started", "Ended"],
      widths: [24, 12, 12],
      rows: (t.seasons ?? []).map((s) => [s.name, d(s.started_at), d(s.ended_at)]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
/** Excel stores dates as days since 1899-12-30. */
const serial = (date: string) => Math.round(Date.parse(date + "T00:00:00Z") / 86_400_000) + 25569;

function sheetXml(s: Sheet) {
  const cell = (v: Cell, ref: string, header = false) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "object") return `<c r="${ref}" s="2"><v>${serial(v.date)}</v></c>`;
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    const text = String(v).slice(0, 32000); // Excel's cell limit is 32,767 characters
    return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  };
  const rows = [s.head, ...s.rows].map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, `${colName(j)}${i + 1}`, i === 0)).join("")}</row>`);
  const cols = (s.widths ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const last = `${colName(Math.max(0, s.head.length - 1))}${s.rows.length + 1}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    (s.rows.length ? `<autoFilter ref="A1:${last}"/>` : "") +
    `</worksheet>`
  );
}

function xlsx(sheets: Sheet[]): Uint8Array {
  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets.map((s, i) => `<sheet name="${esc(s.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;
  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  // styles: 0 = normal, 1 = bold header on yellow, 2 = date (yyyy-mm-dd)
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF0B8"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/styles.xml": strToU8(styles),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  return zipSync(files, { level: 6 });
}

function csv(s: Sheet) {
  const q = (v: Cell) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    let t = typeof v === "object" ? v.date : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // never let a spreadsheet run text as a formula
    return /[",\r\n']/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // BOM so Excel reads emoji and accents correctly
  return "﻿" + [s.head, ...s.rows].map((r) => r.map(q).join(",")).join("\r\n");
}

function save(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Downloads the character's data. Returns the number of rows written. */
export async function exportData(kind: "xlsx" | "csv", who: string, today: string, period: Period | null = null) {
  const backup = await api<{ tables: Record<string, Row[]> }>(g("export"));
  const sheets = buildSheets(backup.tables ?? {}, period);
  const stamp = period ? `${period.from} to ${period.to}` : today; // the game's dates, not UTC
  const base = `APES ${who.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "export"} ${stamp}`;
  if (kind === "xlsx") save(xlsx(sheets), `${base}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  else {
    const files: Record<string, Uint8Array> = {};
    for (const s of sheets) files[`${s.name}.csv`] = strToU8(csv(s));
    save(zipSync(files, { level: 6 }), `${base} (CSV).zip`, "application/zip");
  }
  return sheets.reduce((a, s) => a + s.rows.length, 0);
}

export const _forTests = { buildSheets, sheetXml, csv, serial, colName };
