// Big 3: promise up to a few to-dos each morning. Kept promises pay extra; broken ones cost HP
// when the day closes. The panel sits on Camp; the chip sits in the top bar.
import { useEffect, useState } from "react";
import { priorityOf } from "../../shared/priority";
import type { Quest } from "../../shared/types";
import { useGame } from "../store";
import { sortTodos } from "../util";
import { QuestRow } from "./QuestRow";
import { HelpLink, Modal, Panel } from "./ui";

/** Minutes a promise can be taken back (matches the server's PROMISE_UNDO_MIN). */
const UNDO_MIN = 10;

function usePromises() {
  const { state } = useGame();
  const today = state.promises.filter((p) => p.date === state.today);
  const kept = (questId: number, date: string) => state.log.some((l) => l.quest_id === questId && l.date === date);
  const done = new Set(state.log.map((l) => l.quest_id));
  const open = sortTodos(state.quests.filter((q) => q.type === "todo" && q.active && !done.has(q.id)));
  return { today, kept: today.filter((p) => kept(p.quest_id, p.date)).length, open, max: state.settings.promise_max };
}

/** "🎯 1/3" in the top bar while you have promises today. */
export function Big3Chip() {
  const { today, kept } = usePromises();
  if (!today.length) return null;
  const all = kept === today.length;
  return (
    <a className={`chip ${all ? "good" : "warn"} big3-chip`} href="#/" title="Today's Big 3 promises">
      🎯 {kept}/{today.length}
    </a>
  );
}

const askedKey = (date: string) => `aplq-big3-asked:${date}`;

export function Big3Panel() {
  const { state, act, busy } = useGame();
  const { today, kept, open, max } = usePromises();
  const [choose, setChoose] = useState(false);
  const [, tick] = useState(0);
  const s = state.settings;
  const p = state.player;
  // once a day, if nothing's promised yet, ask (before the evening)
  useEffect(() => {
    let asked = true;
    try {
      asked = !!localStorage.getItem(askedKey(state.today));
    } catch {}
    if (!asked && !today.length && open.length && new Date().getHours() < 18) setChoose(true);
  }, [state.today, today.length, open.length]);
  // the "take back" buttons expire
  useEffect(() => {
    if (!today.some((x) => Date.now() - x.made_at < UNDO_MIN * 60_000)) return;
    const t = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [today]);
  const closeChooser = () => {
    try {
      localStorage.setItem(askedKey(state.today), "1");
    } catch {}
    setChoose(false);
  };
  if (!today.length && !open.length) return null;
  return (
    <Panel
      title={
        <>
          🎯 Today's Big 3 <HelpLink to="big3" />
        </>
      }
      right={
        <span className="row" style={{ gap: 4 }}>
          {p.promise_streak > 0 && <span className="chip warn" title="Days in a row with every promise kept">🤝 {p.promise_streak}</span>}
          {today.length > 0 && <span className={`chip ${kept === today.length ? "good" : ""}`}>{kept}/{today.length} kept</span>}
        </span>
      }
    >
      {!today.length ? (
        <div className="big3-empty">
          <p className="small ink2" style={{ marginTop: 0 }}>
            Promise up to {max} to-dos you'll finish today. Kept: <b>+{Math.round(s.promise_bonus * 100)}% AP &amp; XP</b>. Broken: <b>−{s.promise_hp} HP</b> each when the day closes.
          </p>
          <button className="btn primary" onClick={() => setChoose(true)} disabled={busy}>
            🎯 Choose today's Big 3
          </button>
        </div>
      ) : (
        <div className="qlist">
          {today.map((pr) => {
            const q = state.quests.find((x) => x.id === pr.quest_id);
            const left = UNDO_MIN - Math.floor((Date.now() - pr.made_at) / 60_000);
            return (
              <div key={pr.quest_id} className="big3-row">
                {q ? (
                  <QuestRow q={q} date={state.today} />
                ) : (
                  <div className="quest faded">
                    <div className="q-emoji">{pr.emoji ?? "🎯"}</div>
                    <div className="q-body">
                      <div className="q-title">{pr.title}</div>
                      <div className="small muted">deleted, so it can't be kept</div>
                    </div>
                  </div>
                )}
                {left > 0 && !state.log.some((l) => l.quest_id === pr.quest_id) && (
                  <button className="linkbtn tiny" disabled={busy} onClick={() => act(`promises/${pr.quest_id}`, {}, "DELETE").catch(() => {})}>
                    take back ({left} min left)
                  </button>
                )}
              </div>
            );
          })}
          {today.length < max && open.some((q) => !today.some((x) => x.quest_id === q.id)) && (
            <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setChoose(true)}>
              ＋ Promise another
            </button>
          )}
        </div>
      )}
      {choose && <Chooser open={open.filter((q) => !today.some((x) => x.quest_id === q.id))} slots={max - today.length} first={!today.length} onClose={closeChooser} />}
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
      title={first ? "🎯 Lock in today's Big 3" : "🎯 Promise another"}
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
