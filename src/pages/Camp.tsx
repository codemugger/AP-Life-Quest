// Home: pet, status, alerts, one-tap logging and today's dailies.
import { useEffect, useState } from "react";
import { daysBetween, prettyDate } from "../../shared/dates";
import { useGame } from "../store";
import { Chest, Coin } from "../sprites";
import { PetStage } from "../components/Hud";
import { LogValue, QuestRow } from "../components/QuestRow";
import { IconOrEmoji, MediaImg } from "../components/Media";
import { NoteView } from "../components/NoteView";
import { HighwayStrip } from "../components/Highway";
import { Big3Panel } from "../components/Big3";
import { Bar, HelpLink, Modal, Panel, Seg } from "../components/ui";
import { useFx } from "../fx";
import { notesApi, parseDoc, reminderDue, reminderLabel } from "../notes";
import { dailiesFor, doneOn, fmt, fmtAP, relDay, sortTodos, valueOn } from "../util";
import { Editor } from "../components/Editor";
import type { Metric, Quest } from "../../shared/types";

export default function Camp() {
  const { state, logDate, setLogDate } = useGame();
  const p = state.player;
  const s = state.settings;
  const dailies = dailiesFor(state, logDate);
  const doneCount = dailies.filter((q) => doneOn(state, q.id, logDate).length).length;
  const upcoming = state.events.filter((e) => (e.end_date ?? e.date) >= state.today).slice(0, 3);
  const sprints = state.sprints.filter((x) => x.status === "active");
  const rest = state.rest_days.includes(state.today);

  return (
    <div className="grid2">
      <div>
        <Panel>
          <PetStage />
          <div className="row between wrap">
            <div>
              <div className="px-font" style={{ fontSize: 13 }}>
                {s.pet_name}
              </div>
              <div className="small ink2">
                {s.player_name} · Lv {p.level} {p.title}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="chip warn" title="Streak">🔥 {p.streak} day{p.streak === 1 ? "" : "s"}</span>
              {p.mult !== 1 && <span className="chip ap">×{p.mult.toFixed(2)} AP</span>}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="bar-label">
              <span>❤️ HP</span>
              <span className="num">
                {p.hp}/{p.max_hp}
              </span>
            </div>
            <Bar value={p.hp} max={p.max_hp} kind="hp" label="HP" />
            <div className="bar-label" style={{ marginTop: 8 }}>
              <span>⭐ XP to Lv {p.level + 1}</span>
              <span className="num">
                {p.into}/{p.needed}
              </span>
            </div>
            <Bar value={p.into} max={p.needed} label="XP" />
          </div>
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="coin-count" style={{ fontSize: 14 }}>
              <Coin scale={3} /> {fmtAP(p.ap)} AP
            </span>
            <span className="small ink2">+{fmtAP(p.earned_today)} AP today</span>
          </div>
        </Panel>
        <HighwayStrip />
        <Alerts />
        <PinnedNotes />
      </div>

      <div>
        <Big3Panel />
        {state.editable.length > 1 && (
          <div className="row between" style={{ margin: "0 4px 10px" }}>
            <span className="small ink2">Logging for</span>
            <Seg
              options={state.editable.map((d) => ({ id: d, label: d === state.today ? "Today" : "Yesterday" }))}
              value={logDate}
              onChange={setLogDate}
            />
          </div>
        )}
        <QuickLog />
        <Panel
          title={
            <>
              ⚔️ Daily quests <HelpLink to="start" />
            </>
          }
          right={<span className="chip">{doneCount}/{dailies.length}</span>}
        >
          {rest && <div className="alert info">🏖️ Rest day: no penalties today, streak frozen.</div>}
          <div style={{ margin: "0 2px 12px" }}>
            <Bar value={doneCount} max={Math.max(1, dailies.length)} kind="good" thin />
          </div>
          <div className="qlist">
            {dailies.map((q) => (
              <QuestRow key={q.id} q={q} date={logDate} />
            ))}
            {!dailies.length && <div className="empty">No dailies today. Add some in Quests!</div>}
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
            {state.quests.some((q) => q.metric_key === "journal" && q.active) && (
              <a className="linkbtn" href="#/notes/journal">
                ✍️ Write today's journal
              </a>
            )}
            <a className="linkbtn" href="#/quests">
              All quests →
            </a>
          </div>
        </Panel>
        <Todos />
      </div>

      {(upcoming.length > 0 || sprints.length > 0) && (
        <div className="span2">
          <Panel title="🗺️ On the horizon" right={<a className="linkbtn" href="#/journey">Journey →</a>}>
            <div className="list">
              {sprints.map((sp) => {
                const total = sp.tasks.reduce((a, t) => a + t.dmg, 0);
                const dealt = sp.tasks.filter((t) => t.done_at).reduce((a, t) => a + t.dmg, 0);
                return (
                  <div className="li" key={`s${sp.id}`}>
                    <span style={{ fontSize: 28 }}>{sp.boss_emoji}</span>
                    <div className="grow">
                      <b>{sp.boss}</b> <span className="small muted">· {sp.title} · ends {relDay(sp.end_date, state.today)}</span>
                      <Bar value={total - dealt} max={Math.max(1, total)} kind="bad" thin />
                    </div>
                  </div>
                );
              })}
              {upcoming.map((e) => (
                <div className="li" key={e.id}>
                  <IconOrEmoji images={e.images} emoji={e.emoji} size={32} className="ev-thumb" />
                  <div className="grow">
                    <b>{e.title}</b>
                  </div>
                  <span className="countdown">{e.date <= state.today ? "NOW!" : `${daysBetween(state.today, e.date)}d`}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/** Open to-dos, most pressing first (plus the ones you ticked today). */
function Todos() {
  const { state, logDate } = useGame();
  const [edit, setEdit] = useState<Partial<Quest> | null>(null);
  const todos = state.quests.filter((q) => q.type === "todo" && q.active);
  const done = new Set(state.log.map((l) => l.quest_id));
  const open = sortTodos(todos.filter((q) => !done.has(q.id)));
  const doneToday = todos.filter((q) => state.log.some((l) => l.quest_id === q.id && l.date === logDate));
  const overdue = open.filter((q) => q.due_date && q.due_date < state.today && q.priority && q.priority !== "later").length;
  const SHOW = 8;
  return (
    <Panel
      title={
        <>
          📋 To-do list <HelpLink to="todos" />
        </>
      }
      right={
        <span className="row" style={{ gap: 4 }}>
          {overdue > 0 && <span className="chip bad">⏰ {overdue} late</span>}
          <span className="chip">{open.length} open</span>
        </span>
      }
    >
      <div className="qlist">
        {open.slice(0, SHOW).map((q) => (
          <QuestRow key={q.id} q={q} date={logDate} onEdit={() => setEdit(q)} />
        ))}
        {doneToday.map((q) => (
          <QuestRow key={q.id} q={q} date={logDate} />
        ))}
        {!open.length && !doneToday.length && <div className="empty">No to-dos. Add one when something needs doing: 🔥 urgent ones cost HP if you miss the deadline.</div>}
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => setEdit({ type: "todo" })}>
          ＋ To-do
        </button>
        <a className="linkbtn" href="#/quests/todo">
          {open.length > SHOW ? `All ${open.length} to-dos →` : "Priority matrix →"}
        </a>
      </div>
      {edit && <Editor entity="quests" row={edit as Record<string, unknown>} onClose={() => setEdit(null)} />}
    </Panel>
  );
}

/** Notes you pinned to Camp (e.g. today's timetable). */
function PinnedNotes() {
  const { state } = useGame();
  const pins = state.notes.filter((n) => n.pin_today && !n.archived);
  if (!pins.length) return null;
  return (
    <Panel title="📌 Pinned notes" right={<a className="linkbtn" href="#/notes">Notebook →</a>}>
      <div className="camp-notes">
        {pins.map((n) => (
          <a key={n.id} href={`#/notes/${n.id}`} className={`note-card mini nc-${n.color ?? "none"} paper-${n.paper}`}>
            {n.cover && (
              <div className="nc-cover">
                <MediaImg id={n.cover} size="100%" />
              </div>
            )}
            {n.title && <h3 className={`nc-title font-${n.font}`}>{n.title}</h3>}
            <NoteView doc={parseDoc(n.preview)} compact font={n.font} className="nc-body" />
          </a>
        ))}
      </div>
    </Panel>
  );
}

function Alerts() {
  const { state, act, busy, refresh } = useGame();
  const fx = useFx();
  const p = state.player;
  const reminders = state.notes.filter((n) => reminderDue(n.remind_at));
  return (
    <>
      {reminders.map((n) => (
        <div className="alert violet" key={`r${n.id}`}>
          <span className="big">⏰</span>
          <div className="grow">
            <b>{n.title || "Note reminder"}</b>
            <div className="small">
              {reminderLabel(n.remind_at!)}
              {n.remind_repeat ? " · repeats" : ""}
            </div>
          </div>
          <a className="btn sm" href={`#/notes/${n.id}`}>
            Open
          </a>
          <button
            className="btn sm good"
            aria-label="Mark reminder done"
            onClick={() =>
              notesApi
                .write(`notes/${n.id}/remind-done`)
                .then(refresh)
                .catch((e) => fx.error((e as Error).message))
            }
          >
            ✓
          </button>
        </div>
      ))}
      {p.fainted ? (
        <div className="alert">
          <span className="big">😵</span>
          <div className="grow">
            <b>{state.settings.pet_name} has fainted.</b>
            <div className="small">
              Complete {state.settings.revive_quests - p.revive_progress} more quest(s) to revive. Quests pay half until then.
            </div>
          </div>
        </div>
      ) : null}
      {state.obligations.map((o) => {
        const item = state.shop.find((i) => i.id === o.item_id);
        return (
          <div className="alert" key={o.id}>
            <span className="big">⚖️</span>
            <div className="grow">
              <b>Calorie Court</b>
              <div className="small">
                {fmt(o.value)} kcal on {relDay(o.date, state.today)} requires {item?.emoji} {item?.name}.
              </div>
            </div>
            <a className="btn sm primary" href="#/shop/court">
              Settle
            </a>
          </div>
        );
      })}
      {state.chests.length > 0 && (
        <Panel title={`🎁 Chests (${state.chests.length})`}>
          <div className="row wrap" style={{ gap: 14 }}>
            {state.chests.slice(0, 6).map((c) => (
              <button
                key={c.id}
                className={`rarity-${c.rarity}`}
                disabled={busy}
                onClick={() => act(`chests/${c.id}/open`).catch(() => {})}
                style={{ background: "none", border: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                aria-label={`Open ${c.rarity} chest`}
              >
                <span className="wobble glow" style={{ display: "inline-block" }}>
                  <Chest rarity={c.rarity} scale={5} />
                </span>
                <span className="rarity-tag">{c.rarity}</span>
              </button>
            ))}
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Tap to open!
          </p>
        </Panel>
      )}
    </>
  );
}

/** One-tap logging for the trackers you picked (⚙), for today, yesterday or any older day. */
function QuickLog() {
  const { state, logDate } = useGame();
  // a day picked here; otherwise the "Logging for" day
  const [day, setDay] = useState<string | null>(null);
  const [choose, setChoose] = useState(false);
  useEffect(() => setDay(null), [logDate]);
  const date = day ?? logDate;
  const shown = state.metrics.filter((m) => m.quick_log > 0).sort((a, b) => a.quick_log - b.quick_log || a.sort - b.sort);
  return (
    <Panel
      title={
        <>
          📝 Quick log <HelpLink to="trackers" />
        </>
      }
      right={
        <span className="row" style={{ gap: 4 }}>
          <input
            className="input day-pick"
            type="date"
            max={state.today}
            value={date}
            onChange={(e) => e.target.value && e.target.value <= state.today && setDay(e.target.value === logDate ? null : e.target.value)}
            aria-label="Day to log for"
          />
          <button className="btn xs" onClick={() => setChoose(true)} aria-label="Choose what's in the Quick log" title="Choose trackers">
            ⚙
          </button>
        </span>
      }
    >
      {date <= state.closed && (
        <div className="alert info small">
          📜 {prettyDate(date)} is closed: values go into your history and charts (no quests or AP).{" "}
          <button className="linkbtn" onClick={() => setDay(null)}>
            Back to {logDate === state.today ? "today" : "yesterday"}
          </button>
        </div>
      )}
      <div className="col" style={{ gap: 12 }}>
        {shown.map((m) =>
          m.key === "fasting" ? (
            date === state.today ? <FastTimer key={m.key} /> : null
          ) : m.mode === "add" ? (
            <AddRow key={m.key} m={m} date={date} />
          ) : (
            <SetRow key={m.key} m={m} date={date} />
          ),
        )}
        {!shown.length && (
          <div className="empty">
            Nothing here yet.{" "}
            <button className="linkbtn" onClick={() => setChoose(true)}>
              Choose trackers
            </button>
          </div>
        )}
      </div>
      {choose && <QuickLogPicker onClose={() => setChoose(false)} />}
    </Panel>
  );
}

/** A one-value-a-day tracker (weight, calories, BP…): type and save. */
function SetRow({ m, date }: { m: Metric; date: string }) {
  const { state, act, busy } = useGame();
  const [v, setV] = useState("");
  useEffect(() => setV(""), [date]);
  const cur = valueOn(state, m.key, date);
  const save = async () => {
    if (v === "" || Number.isNaN(Number(v))) return;
    try {
      await act(`metrics/${m.key}/log`, { date, value: Number(v) });
      setV("");
    } catch {}
  };
  const budget = m.key === "calories" ? (m.target ?? 0) : 0;
  return (
    <div>
      <div className="row">
        <span style={{ fontSize: 22, width: 30 }}>{m.emoji}</span>
        <input
          className="input"
          type="number"
          inputMode={m.decimals ? "decimal" : "numeric"}
          step="any"
          placeholder={cur !== null ? `${fmt(cur, m.decimals)} ${m.unit} logged — type to change` : `${m.name}${m.unit ? ` (${m.unit})` : ""}`}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label={`${m.name}${m.unit ? ` in ${m.unit}` : ""}`}
        />
        <button className="btn good" onClick={save} disabled={!v || busy}>
          Save
        </button>
      </div>
      {budget > 0 && (
        <div style={{ marginLeft: 38, marginTop: 6 }}>
          <div className="bar-label">
            <span>{cur === null ? "not logged yet" : cur <= budget ? "within budget 🥗" : `${fmt(cur - budget)} over budget`}</span>
            <span className="num">
              {fmt(cur ?? 0)}/{fmt(budget)}
            </span>
          </div>
          <Bar value={cur ?? 0} max={budget} kind={cur !== null && cur > budget ? "bad" : "good"} thin seg={false} />
        </div>
      )}
    </div>
  );
}

/** An adds-up tracker (hours, glasses…): quick +buttons, or … for any amount. */
function AddRow({ m, date }: { m: Metric; date: string }) {
  const { state, act } = useGame();
  const [custom, setCustom] = useState(false);
  const h = valueOn(state, m.key, date);
  return (
    <div className="row wrap">
      <span style={{ fontSize: 22, width: 30 }}>{m.emoji}</span>
      <span className="grow">
        <b>{m.name}</b>{" "}
        <span className="small ink2">
          {fmt(h ?? 0, m.decimals)}
          {m.target ? `/${fmt(m.target, 0)}` : ""} {m.unit}
        </span>
      </span>
      {(m.quick ?? "1").split(",").map((n) => (
        <button key={n} className="btn sm" onClick={() => act(`metrics/${m.key}/log`, { date, value: Number(n) }).catch(() => {})}>
          +{n}
        </button>
      ))}
      <button className="btn sm" onClick={() => setCustom(true)} aria-label={`Custom ${m.name} amount`}>
        …
      </button>
      {custom && <LogValue metric={m} date={date} onClose={() => setCustom(false)} />}
    </div>
  );
}

/** Tick the trackers to show in the Quick log and put them in order. */
function QuickLogPicker({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [keys, setKeys] = useState(() =>
    state.metrics
      .filter((m) => m.quick_log > 0)
      .sort((a, b) => a.quick_log - b.quick_log || a.sort - b.sort)
      .map((m) => m.key),
  );
  const byKey = new Map(state.metrics.map((m) => [m.key, m]));
  const others = state.metrics.filter((m) => m.active && !keys.includes(m.key));
  const move = (i: number, d: number) =>
    setKeys((ks) => {
      const j = i + d;
      if (j < 0 || j >= ks.length) return ks;
      const n = [...ks];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const save = async () => {
    try {
      await act("quick-log", { keys }, "PUT");
      onClose();
    } catch {}
  };
  const row = (m: Metric, on: boolean, i = -1) => (
    <div className="li" key={m.key}>
      <label className="row grow" style={{ gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={on} onChange={() => setKeys((ks) => (on ? ks.filter((k) => k !== m.key) : [...ks, m.key]))} />
        <span style={{ fontSize: 20 }}>{m.emoji}</span>
        <span>
          {m.name}
          {m.unit && <span className="tiny muted"> · {m.unit}</span>}
          {!m.active && <span className="tiny muted"> · hidden tracker</span>}
        </span>
      </label>
      {on && (
        <span className="row" style={{ gap: 2 }}>
          <button className="btn xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${m.name} up`}>
            ▲
          </button>
          <button className="btn xs" disabled={i === keys.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${m.name} down`}>
            ▼
          </button>
        </span>
      )}
    </div>
  );
  return (
    <Modal
      title="📝 What's in the Quick log?"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <p className="small ink2" style={{ marginTop: 0 }}>
        Ticked trackers show on Camp, in this order. Make new trackers on the Body page.
      </p>
      <div className="list">
        {keys.map((k, i) => (byKey.get(k) ? row(byKey.get(k)!, true, i) : null))}
        {others.map((m) => row(m, false))}
      </div>
    </Modal>
  );
}

function FastTimer() {
  const { state, act, busy } = useGame();
  const start = state.player.fast_started_at;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [start]);
  const total = state.totals.fasting ?? 0;
  const hrs = start ? (Date.now() - start) / 3_600_000 : 0;
  const target = state.metrics.find((m) => m.key === "fasting")?.target ?? 16;
  return (
    <div>
      <div className="row wrap">
        <span style={{ fontSize: 22, width: 30 }}>⏳</span>
        <span className="grow">
          <b>Fasting</b>{" "}
          <span className="small ink2">{start ? `${Math.floor(hrs)}h ${Math.floor((hrs % 1) * 60)}m` : `${fmt(total, 0)}h lifetime`}</span>
        </span>
        {start ? (
          <>
            <button className="btn sm" disabled={busy} onClick={() => confirm("Cancel this fast without logging it?") && act("fast/stop", { cancel: true }).catch(() => {})}>
              ✕
            </button>
            <button className="btn sm gold" disabled={busy} onClick={() => act("fast/stop").catch(() => {})}>
              End fast
            </button>
          </>
        ) : (
          <button className="btn sm violet" disabled={busy} onClick={() => act("fast/start").catch(() => {})}>
            Start fast
          </button>
        )}
      </div>
      {start && (
        <div style={{ marginLeft: 38, marginTop: 6 }}>
          <Bar value={hrs} max={target} kind="gold" thin />
        </div>
      )}
    </div>
  );
}
