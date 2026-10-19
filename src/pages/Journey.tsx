// Journey: life goals (milestones / tracker / manual), sprint boss raids, and life events.
import { useState } from "react";
import { daysBetween, prettyDate } from "../../shared/dates";
import type { Goal, Sprint } from "../../shared/types";
import { useGame } from "../store";
import { Editor } from "../components/Editor";
import { Bar, Empty, Panel, Tabs } from "../components/ui";
import { fmt, latest, relDay } from "../util";

type Tab = "goals" | "sprints" | "events";

export default function Journey({ sub }: { sub?: string }) {
  const [tab, setTab] = useState<Tab>((["goals", "sprints", "events"].includes(sub ?? "") ? sub : "goals") as Tab);
  const [edit, setEdit] = useState<{ entity: string; row: Record<string, unknown> } | null>(null);
  const open = (entity: string, row: object = {}) => setEdit({ entity, row: row as Record<string, unknown> });
  return (
    <>
      <div className="page-head">
        <h1>🗺️ Journey</h1>
        <button className="btn primary" onClick={() => open(tab === "goals" ? "goals" : tab === "sprints" ? "sprints" : "events")}>
          ＋ New {tab === "goals" ? "goal" : tab === "sprints" ? "sprint" : "event"}
        </button>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          history.replaceState(null, "", `#/journey/${t}`);
        }}
        tabs={[
          { id: "goals", label: "🎯 Goals" },
          { id: "sprints", label: "⚔️ Sprints" },
          { id: "events", label: "📅 Events" },
        ]}
      />
      {tab === "goals" && <Goals open={open} />}
      {tab === "sprints" && <Sprints open={open} />}
      {tab === "events" && <Events open={open} />}
      {edit && <Editor entity={edit.entity} row={edit.row} onClose={() => setEdit(null)} />}
    </>
  );
}

type Open = (entity: string, row?: object) => void;

function Goals({ open }: { open: Open }) {
  const { state } = useGame();
  const active = state.goals.filter((g) => g.status === "active");
  const done = state.goals.filter((g) => g.status !== "active");
  return (
    <>
      <div className="grid2">
        {active.map((g) => (
          <GoalCard key={g.id} g={g} open={open} />
        ))}
      </div>
      {!active.length && (
        <Panel>
          <Empty emoji="🎯">
            What do you want to achieve in life? Big dreams become goals; goals become milestones and sprints.
          </Empty>
        </Panel>
      )}
      {done.length > 0 && (
        <Panel title="🏁 Completed & dropped">
          <div className="list">
            {done.map((g) => (
              <div className="li" key={g.id}>
                <span style={{ fontSize: 24 }}>{g.emoji}</span>
                <div className="grow">
                  <b>{g.title}</b>
                  <div className="small ink2">{g.status === "done" ? `✅ done ${g.completed_at ? prettyDate(g.completed_at) : ""}` : "dropped"}</div>
                </div>
                <button className="btn xs" onClick={() => open("goals", g)}>
                  ✎
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

function GoalCard({ g, open }: { g: Goal; open: Open }) {
  const { state, act, busy } = useGame();
  const [ms, setMs] = useState("");
  const metric = g.metric_key ? state.metrics.find((m) => m.key === g.metric_key) : undefined;
  const now = g.metric_key ? latest(state, g.metric_key)?.value : undefined;
  const claimable = g.mode !== "metric" && g.pct >= 100;
  const addMilestone = async () => {
    if (!ms.trim()) return;
    try {
      await act("data/milestones", { goal_id: g.id, title: ms.trim(), ap: 20, sort: g.milestones.length });
      setMs("");
    } catch {}
  };
  return (
    <Panel
      title={
        <>
          {g.emoji} {g.title}
        </>
      }
      right={
        <button className="btn xs" onClick={() => open("goals", g)} aria-label="Edit goal">
          ✎
        </button>
      }
    >
      {g.description && <p className="small ink2" style={{ marginTop: -4 }}>{g.description}</p>}
      <div className="bar-label">
        <span>{Math.round(g.pct)}%</span>
        <span>{g.target_date ? `🎯 ${prettyDate(g.target_date)} (${relDay(g.target_date, state.today)})` : ""}</span>
      </div>
      <Bar value={g.pct} max={100} kind="gold" />
      {g.mode === "metric" && metric && (
        <p className="small">
          {metric.emoji} {g.start_value !== null ? fmt(g.start_value, metric.decimals) : "start"} → <b>{now !== undefined ? fmt(now, metric.decimals) : "?"}</b> → {fmt(g.target_value, metric.decimals)} {metric.unit}
        </p>
      )}
      {g.mode === "manual" && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          {[0, 25, 50, 75, 100].map((p) => (
            <button key={p} className={`btn xs ${g.progress === p ? "pressed" : ""}`} onClick={() => act(`data/goals/${g.id}`, { progress: p }, "PUT").catch(() => {})}>
              {p}%
            </button>
          ))}
        </div>
      )}
      {g.mode === "milestones" && (
        <div style={{ marginTop: 10 }}>
          {g.milestones.map((m) => (
            <label key={m.id} className="check" style={{ margin: "4px 0" }}>
              <input type="checkbox" checked={!!m.done_at} onChange={() => act(`milestones/${m.id}/toggle`).catch(() => {})} />
              <span className={m.done_at ? "muted" : ""} style={{ textDecoration: m.done_at ? "line-through" : undefined }}>
                {m.title}
              </span>
              <span className="chip ap">+{m.ap}</span>
              <button className="linkbtn" onClick={(e) => (e.preventDefault(), confirm(`Remove “${m.title}”?`) && act(`data/milestones/${m.id}`, {}, "DELETE").catch(() => {}))} aria-label="Remove milestone">
                ✕
              </button>
            </label>
          ))}
          <div className="row">
            <input className="input" placeholder="Add a milestone…" value={ms} onChange={(e) => setMs(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMilestone()} />
            <button className="btn sm" onClick={addMilestone}>
              Add
            </button>
          </div>
        </div>
      )}
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="small ink2">
          Reward: {g.ap} AP · {g.xp} XP · legendary chest
        </span>
        {claimable && (
          <button className="btn gold sm" disabled={busy} onClick={() => act(`goals/${g.id}/status`, { status: "done" }).catch(() => {})}>
            🏆 Claim goal!
          </button>
        )}
      </div>
    </Panel>
  );
}

function Sprints({ open }: { open: Open }) {
  const { state } = useGame();
  const active = state.sprints.filter((s) => s.status === "active");
  const past = state.sprints.filter((s) => s.status !== "active");
  return (
    <>
      <p className="small ink2" style={{ margin: "0 4px 12px" }}>
        A sprint is a 1–4 week boss raid. Every task you finish hits the boss. Defeat it before the end date for an epic chest; if time runs out, the boss escapes.
      </p>
      <div className="grid2">
        {active.map((sp) => (
          <BossCard key={sp.id} sp={sp} open={open} />
        ))}
      </div>
      {!active.length && (
        <Panel>
          <Empty emoji="👾">No boss to fight right now. Start a sprint to focus your next couple of weeks.</Empty>
        </Panel>
      )}
      {past.length > 0 && (
        <Panel title="📜 Battle history">
          <div className="list">
            {past.map((sp) => (
              <div className="li" key={sp.id}>
                <span style={{ fontSize: 24 }}>{sp.boss_emoji}</span>
                <div className="grow">
                  <b>{sp.title}</b> <span className="small muted">vs {sp.boss}</span>
                  <div className="small ink2">
                    {prettyDate(sp.start_date)} → {prettyDate(sp.end_date)}
                  </div>
                </div>
                <span className={`chip ${sp.status === "won" ? "good" : sp.status === "lost" ? "bad" : ""}`}>{sp.status === "won" ? "🏆 won" : sp.status === "lost" ? "💨 escaped" : sp.status}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

function BossCard({ sp, open }: { sp: Sprint; open: Open }) {
  const { state, act } = useGame();
  const [task, setTask] = useState("");
  const [hit, setHit] = useState(false);
  const total = sp.tasks.reduce((a, t) => a + t.dmg, 0);
  const dealt = sp.tasks.filter((t) => t.done_at).reduce((a, t) => a + t.dmg, 0);
  const left = daysBetween(state.today, sp.end_date);
  const add = async () => {
    if (!task.trim()) return;
    const t = task.trim();
    try {
      await act("data/sprint_tasks", { sprint_id: sp.id, title: t.replace(/\*+$/, "").trim(), dmg: t.endsWith("*") ? 2 : 1, sort: sp.tasks.length });
      setTask("");
    } catch {}
  };
  return (
    <Panel
      title={<>⚔️ {sp.title}</>}
      right={
        <button className="btn xs" onClick={() => open("sprints", sp)} aria-label="Edit sprint">
          ✎
        </button>
      }
    >
      <div className="row" style={{ gap: 14 }}>
        <div className={`boss-emoji ${hit ? "hit" : ""}`}>{sp.boss_emoji}</div>
        <div className="grow">
          <b>{sp.boss}</b>
          <div className="bar-label" style={{ marginTop: 4 }}>
            <span>Boss HP</span>
            <span className="num">
              {total - dealt}/{total}
            </span>
          </div>
          <Bar value={total - dealt} max={Math.max(1, total)} kind="bad" />
          <div className="small ink2" style={{ marginTop: 4 }}>
            {left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : left === 0 ? "Last day!" : "Overtime"} · reward {sp.ap} AP + epic chest
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        {sp.tasks.map((t) => (
          <label key={t.id} className="check" style={{ margin: "4px 0" }}>
            <input
              type="checkbox"
              checked={!!t.done_at}
              onChange={() => {
                if (!t.done_at) {
                  setHit(true);
                  setTimeout(() => setHit(false), 450);
                }
                act(`sprint_tasks/${t.id}/toggle`).catch(() => {});
              }}
            />
            <span style={{ textDecoration: t.done_at ? "line-through" : undefined }} className={t.done_at ? "muted" : ""}>
              {t.title}
            </span>
            <span className="chip bad">💥{t.dmg}</span>
          </label>
        ))}
        <div className="row">
          <input className="input" placeholder="Add a task (end with * for 2 damage)" value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn sm" onClick={add}>
            Add
          </button>
        </div>
      </div>
    </Panel>
  );
}

function Events({ open }: { open: Open }) {
  const { state } = useGame();
  const upcoming = state.events.filter((e) => (e.end_date ?? e.date) >= state.today);
  const past = state.events.filter((e) => (e.end_date ?? e.date) < state.today).reverse();
  return (
    <div className="grid2">
      <Panel title="⏳ Coming up">
        {upcoming.length ? (
          <div className="list">
            {upcoming.map((e) => (
              <button key={e.id} className="li" onClick={() => open("events", e)} style={{ background: "none", border: 0, borderBottom: "2px dashed var(--grid)", width: "100%", textAlign: "left", cursor: "pointer" }}>
                <span style={{ fontSize: 26 }}>{e.emoji}</span>
                <div className="grow">
                  <b>{e.title}</b>
                  <div className="small ink2">
                    {prettyDate(e.date)}
                    {e.end_date ? ` → ${prettyDate(e.end_date)}` : ""}
                  </div>
                </div>
                <span className="countdown">{e.date <= state.today ? "NOW" : `${daysBetween(state.today, e.date)}d`}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty emoji="📅">Trips, birthdays, competitions, exams… add something to look forward to!</Empty>
        )}
      </Panel>
      <Panel title="📸 Timeline">
        {past.length ? (
          <div className="list">
            {past.map((e) => (
              <button key={e.id} className="li" onClick={() => open("events", e)} style={{ background: "none", border: 0, borderBottom: "2px dashed var(--grid)", width: "100%", textAlign: "left", cursor: "pointer" }}>
                <span style={{ fontSize: 22 }}>{e.emoji}</span>
                <div className="grow">
                  <b>{e.title}</b>
                  <div className="small ink2">
                    {prettyDate(e.date)} · {relDay(e.date, state.today)}
                  </div>
                  {e.notes && <div className="small">{e.notes}</div>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty emoji="📸">Past events and memories will collect here.</Empty>
        )}
      </Panel>
    </div>
  );
}
