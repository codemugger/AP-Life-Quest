// Import a tracker's past values (e.g. years of weigh-ins) from Excel, CSV or pasted cells.
import { useMemo, useState } from "react";
import { prettyDate } from "../../shared/dates";
import type { Metric } from "../../shared/types";
import { guessColumns, guessMonthFirst, parseText, parseXlsx, pickRows, type Table } from "../importer";
import { useGame } from "../store";
import { fmt } from "../util";
import { Field, Modal, Seg } from "./ui";

const MAX_ROWS = 5000;
const colName = (i: number) => String.fromCharCode(65 + (i % 26)).repeat(Math.floor(i / 26) + 1);

export function ImportHistory({ metric, onClose, onDone }: { metric: Metric; onClose: () => void; onDone?: () => void }) {
  const { state, act, busy } = useGame();
  const [table, setTable] = useState<Table | null>(null);
  const [source, setSource] = useState("");
  const [paste, setPaste] = useState("");
  const [cols, setCols] = useState({ date: 0, value: 1 });
  const [monthFirst, setMonthFirst] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = (t: Table, from: string) => {
    if (!t.length) return setErr("Nothing found in there");
    setErr(null);
    setTable(t);
    setSource(from);
    const c = guessColumns(t, [metric.name, metric.key, metric.unit, metric.key === "weight" ? "mass" : ""]);
    setCols(c);
    setMonthFirst(guessMonthFirst(t.map((r) => r[c.date] ?? "")));
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const zip = buf[0] === 0x50 && buf[1] === 0x4b;
      load(zip ? parseXlsx(buf) : parseText(new TextDecoder().decode(buf)), f.name);
    } catch (e) {
      setErr(/\.xls$/i.test(f.name) ? "Old .xls files aren't supported: save it as .xlsx or CSV first" : (e as Error).message || "Couldn't read that file");
    }
  };

  const picked = useMemo(() => (table ? pickRows(table, cols.date, cols.value, monthFirst, state.today) : null), [table, cols, monthFirst, state.today]);
  const rows = picked?.rows ?? [];
  const vals = rows.map((r) => r.value);
  const existing = new Set(state.values.filter((v) => v.metric_key === metric.key).map((v) => v.date));
  const clash = rows.filter((r) => existing.has(r.date)).length;
  const width = table ? Math.max(...table.map((r) => r.length)) : 0;
  const colOpts = Array.from({ length: width }, (_, i) => ({ i, label: `${colName(i)}: ${table!.find((r) => r[i])?.[i]?.slice(0, 18) ?? ""}` }));

  const run = async () => {
    try {
      await act(`metrics/${metric.key}/import`, { rows, overwrite });
      onDone?.();
      onClose();
    } catch {}
  };

  return (
    <Modal
      title={`📥 Import ${metric.emoji} ${metric.name} history`}
      onClose={onClose}
      wide
      actions={
        <>
          {table && (
            <button className="btn" style={{ marginRight: "auto" }} onClick={() => setTable(null)}>
              ← Start over
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn good" disabled={busy || !rows.length || rows.length > MAX_ROWS} onClick={run}>
            Import {rows.length ? rows.length.toLocaleString() : ""} days
          </button>
        </>
      }
    >
      {!table ? (
        <>
          <p className="small ink2" style={{ marginTop: 0 }}>
            Bring in past {metric.name.toLowerCase()} values from a spreadsheet: one row per day, with a date column and a {metric.unit || "value"} column. Headers, titles and notes are skipped. Old days go into your history and charts only (no AP or quests).
          </p>
          <Field label="Excel (.xlsx) or CSV file">
            <input className="input" type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
          </Field>
          <Field label="…or paste cells" help="Select the date and value columns in Excel or Google Sheets, copy, and paste here.">
            <textarea className="input" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"31/10/2016\t58\n07/11/2016\t57.5"} />
          </Field>
          <button className="btn sm" disabled={!paste.trim()} onClick={() => load(parseText(paste), "pasted cells")}>
            Read pasted cells
          </button>
        </>
      ) : (
        <>
          <div className="small ink2" style={{ marginBottom: 8 }}>
            From <b>{source}</b>
          </div>
          {width > 2 && (
            <div className="row wrap" style={{ gap: 10 }}>
              <Field label="Date column">
                <select className="input" value={cols.date} onChange={(e) => setCols({ ...cols, date: Number(e.target.value) })}>
                  {colOpts.map((o) => (
                    <option key={o.i} value={o.i}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`${metric.name} column`}>
                <select className="input" value={cols.value} onChange={(e) => setCols({ ...cols, value: Number(e.target.value) })}>
                  {colOpts.map((o) => (
                    <option key={o.i} value={o.i}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <Field label="Dates are written">
            <Seg options={[{ id: "dm", label: "day/month (31/10)" }, { id: "md", label: "month/day (10/31)" }]} value={monthFirst ? "md" : "dm"} onChange={(v) => setMonthFirst(v === "md")} />
          </Field>
          {rows.length ? (
            <div className="inset">
              <b>
                {rows.length.toLocaleString()} days · {prettyDate(rows[0].date)} → {prettyDate(rows[rows.length - 1].date)}
              </b>
              <div className="small ink2">
                {fmt(Math.min(...vals), metric.decimals)}–{fmt(Math.max(...vals), metric.decimals)} {metric.unit}
                {picked!.skipped > 0 && ` · ${picked!.skipped} line${picked!.skipped === 1 ? "" : "s"} skipped (no date or number)`}
                {picked!.repeats > 0 && ` · ${picked!.repeats} date${picked!.repeats === 1 ? "" : "s"} listed twice (the later row is used)`}
              </div>
              <table className="mini-table" style={{ marginTop: 6 }}>
                <tbody>
                  {(rows.length > 6 ? [...rows.slice(0, 3), null, ...rows.slice(-3)] : rows).map((r, i) =>
                    r ? (
                      <tr key={r.date}>
                        <td>{prettyDate(r.date)}</td>
                        <td className="num">
                          {fmt(r.value, metric.decimals)} {metric.unit}
                        </td>
                      </tr>
                    ) : (
                      <tr key={`gap${i}`}>
                        <td className="muted">⋮</td>
                        <td />
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {rows.length > MAX_ROWS && <div className="small neg">That's more than {MAX_ROWS.toLocaleString()} days: split it into smaller files.</div>}
            </div>
          ) : (
            <div className="alert">No rows with both a date and a number. Try the other columns or date order.</div>
          )}
          {clash > 0 && (
            <Field label={`${clash} of these days already have a value in the app`}>
              <Seg options={[{ id: "keep", label: "Keep the app's" }, { id: "replace", label: "Use the file's" }]} value={overwrite ? "replace" : "keep"} onChange={(v) => setOverwrite(v === "replace")} />
            </Field>
          )}
          {metric.key === "weight" && (
            <p className="tiny muted">
              BMI uses your height in Settings → Profile ({fmt(state.settings.height_m, 2)} m). Weight goals keep their current starting weight.
            </p>
          )}
        </>
      )}
      {err && <div className="alert">{err}</div>}
    </Modal>
  );
}
