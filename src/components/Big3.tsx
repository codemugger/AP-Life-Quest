// Top N promises ("Big 3" in the code): promise up to N to-dos each morning. Kept promises pay
// extra; broken ones cost HP when the day closes, which is after the grace hours, so yesterday's
// promises can still be kept the next morning. The panel sits on Camp; the chip in the top bar.
import { useEffect, useState } from "react";
import { addDays, clockLabel, closesAt } from "../../shared/dates";
import { priorityOf } from "../../shared/priority";
import type { Promise3, Quest } from "../../shared/types";
import { useGame } from "../store";
import { sortTodos } from "../util";
import { QuestRow } from "./QuestRow";
import { HelpLink, Modal, Panel } from "./ui";

/** Minutes a promise can be taken back (matches the server's PROMISE_UNDO_MIN). */
const UNDO_MIN = 10;

function usePromises() {
  const { state } = useGame();
  // a promise is kept once its to-do is ticked on its day, or later while that day is still open
  const isKept = (p: Promise3) => state.log.some((l) => l.quest_id === p.quest_id && l.date >= p.date);
  const today = state.promises.filter((p) => p.date === state.today);
  const yesterday = addDays(state.today, -1);
  // yesterday's promises, while its grace hours last
  const carried = state.editable.includes(yesterday) ? state.promises.filter((p) => p.date === yesterday) : [];
  const done = new Set(state.log.map((l) => l.quest_id));
  const open = sortTodos(state.quests.filter((q) => q.type === "todo" && q.active && !done.has(q.id)));
  return { today, carried, isKept, kept: today.filter(isKept).length, open, max: state.settings.promise_max, yesterday };
}

/** "🎯 1/3" in the top bar while you have promises today. */
export function Big3Chip() {
  const { state } = useGame();
  const { today, kept } = usePromises();
  if (!today.length) return null;
  const all = kept === today.length;
  return (
    <a className={`chip ${all ? "good" : "warn"} big3-chip`} href="#/" title={`Today's top ${state.settings.promise_max} promises`}>
      🎯 {kept}/{today.length}
    </a>
  );
}

const askedKey = (date: string) => `aplq-big3-asked:${date}`;

/** A promised to-do (or what's left of one that was deleted). */
function PromiseRow({ pr, date }: { pr: Promise3; date: string }) {
  const { state, act, busy } = useGame();
  const q = state.quests.find((x) => x.id === pr.quest_id);
  const left = UNDO_MIN - Math.floor((Date.now() - pr.made_at) / 60_000);
  return (
    <div className="big3-row">
      {q ? (
        <QuestRow q={q} date={date} />
      ) : (
        <div className="quest faded">
          <div className="q-emoji">{pr.emoji ?? "🎯"}</div>
          <div className="q-body">
            <div className="q-title">{pr.title}</div>
            <div className="small muted">deleted, so it can't be kept</div>
          </div>
        </div>
      )}
      {pr.date === state.today && left > 0 && !state.log.some((l) => l.quest_id === pr.quest_id) && (
        <button className="linkbtn tiny" disabled={busy} onClick={() => act(`promises/${pr.quest_id}`, {}, "DELETE").catch(() => {})}>
          take back ({left} min left)
        </button>
      )}
    </div>
  );
}

export function Big3Panel() {
  const { state, busy } = useGame();
  const { today, carried, isKept, kept, open, max, yesterday } = usePromises();
  const [choose, setChoose] = useState(false);
  const [, tick] = useState(0);
  const s = state.settings;
  const p = state.player;
  const choosable = open.filter((q) => !today.some((x) => x.quest_id === q.id) && !carried.some((x) => x.quest_id === q.id));
  const carriedLeft = carried.filter((x) => !isKept(x));
  // once a day, if nothing's promised yet, ask (before the evening)
  useEffect(() => {
    let asked = true;
    try {
      asked = !!localStorage.getItem(askedKey(state.today));
    } catch {}
    if (!asked && !today.length && choosable.length && new Date().getHours() < 18) setChoose(true);
  }, [state.today, today.length, choosable.length]);
  // "take back" buttons and the grace countdown move on by themselves
  useEffect(() => {
    if (!carriedLeft.length && !today.some((x) => Date.now() - x.made_at < UNDO_MIN * 60_000)) return;
    const t = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [today, carriedLeft.length]);
  const closeChooser = () => {
    try {
      localStorage.setItem(askedKey(state.today), "1");
    } catch {}
    setChoose(false);
  };
  if (!today.length && !carried.length && !open.length) return null;
  const closes = closesAt(yesterday, s.timezone, s.day_start_hour, s.grace_hours);
  const hoursLeft = Math.max(0, (closes - Date.now()) / 3_600_000);
  const empty = Math.max(0, max - today.length);
  return (
    <Panel
      title={
        <>
          🎯 Today's Top {max} <HelpLink to="big3" />
        </>
      }
      right={
        <span className="row" style={{ gap: 4 }}>
          {p.promise_streak > 0 && <span className="chip warn" title="Days in a row with every promise kept">🤝 {p.promise_streak}</span>}
          <span className={`chip ${today.length && kept === today.length ? "good" : ""}`}>
            {kept}/{max} kept
          </span>
        </span>
      }
    >
      {carriedLeft.length > 0 && (
        <div className="big3-carried">
          <div className="small">
            <b>⏳ Yesterday's promises</b>{" "}
            <span className="ink2">
              still count until {clockLabel(closes, s.timezone)} ({hoursLeft >= 1 ? `${Math.floor(hoursLeft)} h` : `${Math.max(1, Math.round(hoursLeft * 60))} min`} left)
            </span>
          </div>
          <div className="qlist">
            {carriedLeft.map((pr) => (
              <PromiseRow key={`y${pr.quest_id}`} pr={pr} date={yesterday} />
            ))}
          </div>
        </div>
      )}
      {!today.length && (
        <p className="small ink2" style={{ marginTop: 0 }}>
          Promise up to {max} to-dos you'll finish today. Kept: <b>+{Math.round(s.promise_bonus * 100)}% AP &amp; XP</b>. Broken: <b>−{s.promise_hp} HP</b> each when the day closes.
        </p>
      )}
      <div className="qlist">
        {today.map((pr) => (
          <PromiseRow key={pr.quest_id} pr={pr} date={state.today} />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <button key={`slot${i}`} className="big3-slot" disabled={busy || !choosable.length} onClick={() => setChoose(true)}>
            <span className="big3-num">{today.length + i + 1}</span>
            {choosable.length ? "＋ Pick a to-do to promise" : "No open to-dos left to promise"}
          </button>
        ))}
      </div>
      {choose && <Chooser open={choosable} slots={empty} first={!today.length} onClose={closeChooser} />}
    </Panel>
  );
}

function Chooser({ open, slots, first, onClose }: { open: Quest[]; slots: number; first: boolean; onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [pick, setPick] = useState<number[]>([]);
  const toggle = (id: number) => setPick((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length < slots ? [...xs, id] : xs));
  const lock = async () => {
    try {
      for (const id of pick) await act(`promises/${id}`);
      onClose();
    } catch {}
  };
  return (
    <Modal
      title={first ? `🎯 Lock in today's top ${state.settings.promise_max}` : "🎯 Promise another"}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            {first ? "Not today" : "Cancel"}
          </button>
          <button className="btn primary" disabled={busy || !pick.length} onClick={lock}>
            🔒 Lock in {pick.length || ""}
          </button>
        </>
      }
    >
      <p className="small ink2" style={{ marginTop: 0 }}>
        Pick up to {slots} you <b>will</b> finish today. You can take one back for {UNDO_MIN} minutes; after that it's locked in.
      </p>
      <div className="list big3-pick">
        {open.map((q) => {
          const on = pick.includes(q.id);
          const p = priorityOf(q.priority);
          return (
            <button key={q.id} className={`li big3-option ${on ? "on" : ""}`} onClick={() => toggle(q.id)} aria-pressed={on} disabled={!on && pick.length >= slots}>
              <span className="big3-box">{on ? "🎯" : ""}</span>
              <span style={{ fontSize: 20 }}>{q.emoji}</span>
              <span className="grow" style={{ textAlign: "left" }}>
                {q.title}
                <span className="tiny muted">
                  {p ? ` · ${p.emoji} ${p.label}` : ""}
                  {q.due_date ? ` · due ${q.due_date === state.today ? "today" : q.due_date < state.today ? "(late)" : q.due_date}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!open.length && <p className="small muted">No open to-dos. Add some on the Quest board first.</p>}
    </Modal>
  );
}
