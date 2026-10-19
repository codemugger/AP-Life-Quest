// A single quest row (daily / weekly / habit / to-do) with the right button for its type.
import { useState, type ReactElement } from "react";
import { addDays } from "../../shared/dates";
import type { Metric, Quest } from "../../shared/types";
import { useGame } from "../store";
import { Check } from "../sprites";
import { doneOn, fmt, relDay, valueOn, weekCount } from "../util";
import { Field, Modal, RewardChips } from "./ui";

function questStreak(log: { quest_id: number; date: string }[], qid: number, date: string) {
  const days = new Set(log.filter((l) => l.quest_id === qid).map((l) => l.date));
  let n = 0;
  let d = days.has(date) ? date : addDays(date, -1);
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function QuestRow({ q, date, onEdit }: { q: Quest; date: string; onEdit?: () => void }) {
  const { state, act, busy: storeBusy } = useGame();
  const [mine, setBusy] = useState(false);
  const busy = mine || storeBusy;
  const [prompt, setPrompt] = useState<null | "metric" | "qty">(null);
  const logs = q.type === "todo" ? state.log.filter((l) => l.quest_id === q.id) : doneOn(state, q.id, date);
  const done = logs.length > 0;
  const metric = q.metric_key ? state.metrics.find((m) => m.key === q.metric_key) : undefined;
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const complete = (qty?: number) => run(() => act(`quests/${q.id}/complete`, { date, qty }));
  const undo = () => run(() => act(`quests/${q.id}/undo`, { date: q.type === "todo" ? undefined : date }));
  const bad = q.type === "habit" && q.polarity < 0;
  const streak = q.type === "daily" ? questStreak(state.log, q.id, date) : 0;
  const threshold = q.metric_value ?? metric?.target;

  let button: ReactElement;
  if (q.type === "daily" || q.type === "todo") {
    if (metric && !done)
      button = (
        <button className={`qcheck ${mine ? "busy" : ""}`} disabled={busy} onClick={() => setPrompt("metric")} aria-label={`Log ${metric.name}`}>
          <span style={{ fontSize: 20 }}>{metric.emoji}</span>
        </button>
      );
    else
      button = (
        <button
          className={`qcheck ${done ? (logs[0]?.auto ? "auto" : "on") : ""} ${mine ? "busy" : ""}`}
          disabled={busy}
          onClick={() => (done ? (logs[0]?.auto ? setPrompt("metric") : undo()) : complete())}
          aria-label={done ? `Undo ${q.title}` : `Complete ${q.title}`}
          aria-pressed={done}
        >
          {done && <Check scale={3} />}
        </button>
      );
  } else if (q.type === "weekly") {
    button = (
      <div className="row" style={{ gap: 2 }}>
        {logs.length > 0 && (
          <button className="btn xs" onClick={undo} disabled={busy} aria-label="Undo one">
            ↩
          </button>
        )}
        <button className="btn sm good" onClick={() => complete()} disabled={busy}>
          +1
        </button>
      </div>
    );
  } else {
    button = (
      <div className="row" style={{ gap: 2 }}>
        {logs.length > 0 && (
          <button className="btn xs" onClick={undo} disabled={busy} aria-label="Undo last">
            ↩
          </button>
        )}
        <button className={`btn sm ${bad ? "danger" : "good"}`} onClick={() => (q.unit ? setPrompt("qty") : complete())} disabled={busy}>
          {bad ? "−" : "+"}
        </button>
      </div>
    );
  }

  const weekN = q.type === "weekly" ? weekCount(state, q.id, date) : 0;
  return (
    <div className={`quest ${done && (q.type === "daily" || q.type === "todo") ? "done" : ""} ${bad ? "bad-habit" : ""}`}>
      <div className="q-emoji">{q.emoji}</div>
      <div className="q-body">
        <div className="q-title">{q.title}</div>
        <div className="q-meta">
          {bad ? (
            <RewardChips ap={q.ap} hp={q.hp_penalty} bad />
          ) : (
            <RewardChips ap={q.ap} xp={q.xp} hp={q.type === "daily" || q.type === "weekly" ? q.hp_penalty : 0} />
          )}
          {q.unit && <span className="chip">per {q.unit}</span>}
          {metric && q.metric_op !== "logged" && threshold !== null && threshold !== undefined && (
            <span className="chip">
              {metric.emoji} {q.metric_op} {fmt(threshold, metric.decimals)} {metric.unit}
            </span>
          )}
          {metric && valueOn(state, metric.key, date) !== null && (
            <span className="chip good">
              {fmt(valueOn(state, metric.key, date), metric.decimals)} {metric.unit}
            </span>
          )}
          {q.type === "weekly" && (
            <span className={`chip ${weekN >= q.weekly_target ? "good" : ""}`}>
              {weekN}/{q.weekly_target} this week
            </span>
          )}
          {q.type === "habit" && logs.length > 0 && <span className="chip">×{logs.reduce((a, l) => a + l.qty, 0)} today</span>}
          {streak >= 2 && <span className="chip warn">🔥{streak}</span>}
          {q.type === "todo" && q.due_date && !done && <span className={`chip ${q.due_date < state.today ? "bad" : ""}`}>due {relDay(q.due_date, state.today)}</span>}
          {onEdit && (
            <button className="linkbtn" onClick={onEdit} aria-label={`Edit ${q.title}`}>
              edit
            </button>
          )}
        </div>
      </div>
      {button}
      {prompt === "metric" && metric && <LogValue metric={metric} date={date} onClose={() => setPrompt(null)} />}
      {prompt === "qty" && (
        <QtyPrompt
          q={q}
          onClose={() => setPrompt(null)}
          onSubmit={(n) => {
            setPrompt(null);
            void complete(n);
          }}
        />
      )}
    </div>
  );
}

function QtyPrompt({ q, onClose, onSubmit }: { q: Quest; onClose: () => void; onSubmit: (n: number) => void }) {
  const [v, setV] = useState("1");
  return (
    <Modal
      title={`${q.emoji} ${q.title}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn good" onClick={() => Number(v) > 0 && onSubmit(Number(v))}>
            Log it
          </button>
        </>
      }
    >
      <Field label={`How many ${q.unit}?`} help={`${q.ap} AP per ${q.unit}`}>
        <input className="input" type="number" inputMode="decimal" step="0.25" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      </Field>
      <div className="row wrap">
        {[0.5, 1, 1.5, 2, 3].map((n) => (
          <button key={n} className="btn sm" onClick={() => onSubmit(n)}>
            {n} {q.unit}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Modal to log (or fix) a tracker value for a date. */
export function LogValue({ metric, date, onClose }: { metric: Metric; date: string; onClose: () => void }) {
  const { state, act, busy } = useGame();
  const current = valueOn(state, metric.key, date);
  const add = metric.mode === "add";
  const [v, setV] = useState(add ? "" : current !== null ? String(current) : "");
  const save = async (val: number | null, mode?: string) => {
    try {
      await act(`metrics/${metric.key}/log`, { date, value: val, mode });
      onClose();
    } catch {}
  };
  return (
    <Modal
      title={`${metric.emoji} ${metric.name} · ${date === state.today ? "today" : relDay(date, state.today)}`}
      onClose={onClose}
      actions={
        <>
          {current !== null && (
            <button className="btn danger sm" style={{ marginRight: "auto" }} onClick={() => save(null)}>
              Clear
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn good" disabled={busy} onClick={() => v !== "" && save(Number(v))}>
            {add ? "Add" : "Save"}
          </button>
        </>
      }
    >
      {add && current !== null && (
        <p className="small ink2">
          So far: <b>{fmt(current, metric.decimals)} {metric.unit}</b>. Enter an amount to add (negative to correct).
        </p>
      )}
      <Field label={`${add ? "Add" : "Value"} (${metric.unit})`} help={metric.target ? `Target: ${fmt(metric.target, metric.decimals)} ${metric.unit}` : undefined}>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step="any"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && v !== "" && save(Number(v))}
          autoFocus
        />
      </Field>
      {add && metric.quick && (
        <div className="row wrap">
          {metric.quick.split(",").map((n) => (
            <button key={n} className="btn sm" onClick={() => save(Number(n))}>
              +{n} {metric.unit}
            </button>
          ))}
        </div>
      )}
      {add && current !== null && (
        <button className="linkbtn" onClick={() => save(Number(v || current), "set")}>
          Replace the day's total with this number instead
        </button>
      )}
    </Modal>
  );
}
