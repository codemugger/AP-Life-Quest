// Body: weight / BMI / calories at a glance, charts, and every tracker (built-in + custom).
import { useEffect, useMemo, useState } from "react";
import { addDays, prettyDate } from "../../shared/dates";
import { bmi, bmiBand, ema, healthyRange, sma } from "../../shared/health";
import type { Metric } from "../../shared/types";
import { api } from "../api";
import { useGame } from "../store";
import { BarChart, LineChart, Spark, type Pt } from "../components/charts";
import { Editor } from "../components/Editor";
import { LogValue } from "../components/QuestRow";
import { Empty, Panel, Seg } from "../components/ui";
import { fmt, latest, series, valueOn } from "../util";

type Range = "30" | "90" | "365" | "all";

export default function Body() {
  const { state, logDate } = useGame();
  const s = state.settings;
  const weightM = state.metrics.find((m) => m.key === "weight")!;
  const calM = state.metrics.find((m) => m.key === "calories")!;
  const w = latest(state, "weight");
  const wSeries = series(state, "weight");
  const weekAgo = [...wSeries].reverse().find((v) => v.date <= addDays(state.today, -7));
  const b = w ? bmi(w.value, s.height_m) : null;
  const band = b ? bmiBand(b) : null;
  const cals = series(state, "calories");
  const ema30 = useMemo(() => ema(cals.map((c) => c.value), 30), [cals]);
  const dma3 = useMemo(() => sma(cals.map((c) => c.value), 3), [cals]);
  const todayCal = valueOn(state, "calories", logDate);
  const [range, setRange] = useState<Range>("90");
  const [all, setAll] = useState<Pt[] | null>(null);
  const [edit, setEdit] = useState<Partial<Metric> | null>(null);
  const [logFor, setLogFor] = useState<Metric | null>(null);
  const [table, setTable] = useState<string | null>(null);

  useEffect(() => {
    if (range === "all" && !all) api<Pt[]>("history/weight").then(setAll).catch(() => setAll([]));
  }, [range, all]);

  const wData: Pt[] = range === "all" ? (all ?? wSeries) : wSeries.filter((v) => v.date >= addDays(state.today, -Number(range)));
  const [hLo, hHi] = healthyRange(s.height_m);
  const target = weightM?.target;

  return (
    <>
      <div className="page-head">
        <h1>💗 Body</h1>
        <span className="small ink2">Height {fmt(s.height_m, 2)} m · BMI uses Singapore (Asian) cut-offs</span>
      </div>
      <div className="grid3" style={{ marginBottom: 6 }}>
        <Panel className="tight">
          <div className="stat-tile">
            <span className="label">⚖️ Weight</span>
            <span className="value">{w ? `${fmt(w.value, 1)} kg` : "–"}</span>
            {w && weekAgo && (
              <span className={`delta ${w.value <= weekAgo.value ? "good" : "bad"}`}>
                {w.value - weekAgo.value <= 0 ? "▼" : "▲"} {fmt(Math.abs(w.value - weekAgo.value), 1)} kg vs a week ago
              </span>
            )}
            {target && w && <span className="delta muted">{fmt(Math.max(0, w.value - target), 1)} kg to goal ({target} kg)</span>}
          </div>
        </Panel>
        <Panel className="tight">
          <div className="stat-tile">
            <span className="label">🧮 BMI</span>
            <span className="value">{b ? fmt(b, 1) : "–"}</span>
            {band && (
              <span className={`chip ${band.tone === "good" ? "good" : band.tone === "bad" ? "bad" : "warn"}`} style={{ alignSelf: "flex-start" }}>
                {band.emoji} {band.label}
              </span>
            )}
            <span className="delta muted">Healthy: {fmt(hLo, 1)}–{fmt(hHi, 1)} kg</span>
          </div>
        </Panel>
        <Panel className="tight">
          <div className="stat-tile">
            <span className="label">🍱 Calories {logDate === state.today ? "today" : "yesterday"}</span>
            <span className="value">{todayCal !== null ? fmt(todayCal) : "–"}</span>
            {calM?.target && <span className={`delta ${todayCal !== null && todayCal > calM.target ? "bad" : "good"}`}>budget {fmt(calM.target)} kcal</span>}
          </div>
        </Panel>
        <Panel className="tight">
          <div className="stat-tile">
            <span className="label">📉 30-day EMA</span>
            <span className="value">{ema30.length ? fmt(ema30[ema30.length - 1]) : "–"}</span>
            <span className="delta muted">3DMA {dma3.length ? fmt(dma3[dma3.length - 1]) : "–"} kcal</span>
          </div>
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="⚖️ Weight" right={<Seg<Range> options={[{ id: "30", label: "30d" }, { id: "90", label: "90d" }, { id: "365", label: "1y" }, { id: "all", label: "All" }]} value={range} onChange={setRange} />}>
          {wData.length ? (
            <>
              <LineChart
                data={wData}
                color="var(--violet)"
                unit="kg"
                label="Weight over time"
                refs={target ? [{ value: target, label: `goal ${target} kg`, color: "var(--good)" }] : []}
                band={{ from: hLo, to: hHi, color: "var(--mint)", label: "healthy" }}
              />
              <div className="legend">
                <span><i className="line" style={{ background: "var(--violet)" }} /> Weight</span>
                <span><i style={{ background: "var(--mint)", opacity: 0.4 }} /> Healthy BMI range</span>
                {target && <span><i className="dash" /> Goal</span>}
              </div>
            </>
          ) : (
            <Empty emoji="⚖️">Log your first weigh-in on the Camp page.</Empty>
          )}
        </Panel>
        <Panel title="🍱 Calories · last 30 days">
          {cals.length ? (
            <>
              <BarChart
                data={cals}
                days={30}
                end={state.today}
                unit="kcal"
                target={calM?.target}
                label="Daily calories"
                colorOf={(v) => (calM?.target && v > calM.target ? "var(--coral)" : "var(--mint)")}
                trend={{ data: cals.map((c, i) => ({ date: c.date, value: ema30[i] })), color: "var(--violet)", label: "30EMA" }}
              />
              <div className="legend">
                <span><i style={{ background: "var(--mint)" }} /> Within budget</span>
                <span><i style={{ background: "var(--coral)" }} /> Over budget</span>
                <span><i className="line" style={{ background: "var(--violet)" }} /> 30-day EMA</span>
                <span><i className="dash" /> Budget</span>
              </div>
            </>
          ) : (
            <Empty emoji="🍱">No calories logged yet.</Empty>
          )}
        </Panel>
      </div>

      <Panel title="📈 Trackers" right={<button className="btn sm primary" onClick={() => setEdit({})}>＋ Tracker</button>}>
        <div className="list">
          {state.metrics
            .filter((m) => m.active)
            .map((m) => {
              const xs = series(state, m.key);
              const v = valueOn(state, m.key, logDate);
              const last = xs[xs.length - 1];
              return (
                <div className="li" key={m.key}>
                  <span style={{ fontSize: 24, width: 30 }}>{m.emoji}</span>
                  <div className="grow">
                    <div className="row" style={{ gap: 4 }}>
                      <b>{m.name}</b>
                      <button className="linkbtn tiny" onClick={() => setTable(table === m.key ? null : m.key)}>
                        history
                      </button>
                      <button className="linkbtn tiny" onClick={() => setEdit(m)} aria-label={`Edit ${m.name}`}>
                        edit
                      </button>
                    </div>
                    <div className="small ink2">
                      {v !== null ? `${fmt(v, m.decimals)} ${m.unit} ${logDate === state.today ? "today" : "yesterday"}` : last ? `last ${fmt(last.value, m.decimals)} ${m.unit} · ${prettyDate(last.date)}` : "no data yet"}
                      {m.target !== null && ` · target ${fmt(m.target, m.decimals)}`}
                      {m.mode === "add" && state.totals[m.key] ? ` · total ${fmt(state.totals[m.key], 0)} ${m.unit}` : ""}
                    </div>
                  </div>
                  <span className="hide-sm">
                    <Spark data={xs.slice(-14).map((x) => x.value)} />
                  </span>
                  <button className="btn sm good" onClick={() => setLogFor(m)}>
                    Log
                  </button>
                </div>
              );
            })}
        </div>
        {table && <HistoryTable metric={state.metrics.find((m) => m.key === table)!} />}
        {state.metrics.some((m) => !m.active) && (
          <details className="fold" style={{ marginTop: 8 }}>
            <summary className="small">Hidden trackers</summary>
            <div className="row wrap">
              {state.metrics
                .filter((m) => !m.active)
                .map((m) => (
                  <button key={m.key} className="btn sm" onClick={() => setEdit(m)}>
                    {m.emoji} {m.name}
                  </button>
                ))}
            </div>
          </details>
        )}
      </Panel>
      {edit && <Editor entity="metrics" row={edit as Record<string, unknown>} onClose={() => setEdit(null)} />}
      {logFor && <LogValue metric={logFor} date={logDate} onClose={() => setLogFor(null)} />}
    </>
  );
}

function HistoryTable({ metric }: { metric: Metric }) {
  const { state } = useGame();
  const [fix, setFix] = useState<string | null>(null);
  const rows = series(state, metric.key).slice(-60).reverse();
  return (
    <div className="inset" style={{ marginTop: 12 }}>
      <div className="row between">
        <b>
          {metric.emoji} {metric.name}: last {rows.length} entries
        </b>
        <span className="tiny muted">tap a row to fix it</span>
      </div>
      <div className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
        {rows.map((r) => (
          <button key={r.date} className="li" onClick={() => setFix(r.date)} style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left", width: "100%", borderBottom: "2px dashed var(--grid)" }}>
            <span className="grow">{prettyDate(r.date)}</span>
            <span className="num">
              {fmt(r.value, metric.decimals)} {metric.unit}
            </span>
          </button>
        ))}
        {!rows.length && <div className="muted small">No entries yet.</div>}
      </div>
      {fix && <LogValue metric={{ ...metric, mode: "set" }} date={fix} onClose={() => setFix(null)} />}
    </div>
  );
}
