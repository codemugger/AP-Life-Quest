// Quest board: dailies, weeklies, habits, to-dos (+ archive). Everything editable.
import { useState } from "react";
import { WEEKDAY_SHORT } from "../../shared/dates";
import type { Quest } from "../../shared/types";
import { useGame } from "../store";
import { Editor } from "../components/Editor";
import { QuestRow } from "../components/QuestRow";
import { Empty, Panel, Seg, Tabs } from "../components/ui";

type Tab = "daily" | "weekly" | "habit" | "todo" | "archived";

const BLURB: Record<Tab, string> = {
  daily: "Due on chosen days. Missing one costs HP when the day closes. Linked ones tick themselves when you log a tracker.",
  weekly: "Do them N times per week. Checked every Sunday night.",
  habit: "Tap any time. Good habits pay out; bad habits cost AP and HP. Habits with a unit (e.g. coaching hours) pay per unit.",
  todo: "One-off quests. No penalty, just loot.",
  archived: "Paused quests. Edit one and tick Active to bring it back.",
};

export default function Quests() {
  const { state, logDate, setLogDate, act } = useGame();
  const [tab, setTab] = useState<Tab>("daily");
  const [edit, setEdit] = useState<Partial<Quest> | null>(null);
  const active = state.quests.filter((q) => q.active);
  const list =
    tab === "archived"
      ? state.quests.filter((q) => !q.active)
      : active.filter((q) => q.type === tab).sort((a, b) => (tab === "todo" ? Number(isDone(a)) - Number(isDone(b)) : 0));
  function isDone(q: Quest) {
    return state.log.some((l) => l.quest_id === q.id);
  }
  const doneTodos = active.filter((q) => q.type === "todo" && isDone(q)).length;
  const count = (t: Tab) => active.filter((q) => q.type === t).length;

  return (
    <>
      <div className="page-head">
        <h1>⚔️ Quest board</h1>
        <div className="row">
          {state.editable.length > 1 && (
            <Seg options={state.editable.map((d) => ({ id: d, label: d === state.today ? "Today" : "Yesterday" }))} value={logDate} onChange={setLogDate} />
          )}
          <button className="btn primary" onClick={() => setEdit({ type: tab === "archived" ? "daily" : tab })}>
            ＋ New
          </button>
        </div>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "daily", label: `Dailies ${count("daily")}` },
          { id: "weekly", label: `Weeklies ${count("weekly")}` },
          { id: "habit", label: `Habits ${count("habit")}` },
          { id: "todo", label: `To-dos ${count("todo")}` },
          { id: "archived", label: "Archive" },
        ]}
      />
      <Panel>
        <p className="small ink2" style={{ marginTop: 0 }}>
          {BLURB[tab]}
        </p>
        <div className="qlist">
          {list.map((q) =>
            tab === "archived" ? (
              <div className="quest muted-row" key={q.id}>
                <div className="q-emoji">{q.emoji}</div>
                <div className="q-body">
                  <div className="q-title">{q.title}</div>
                  <div className="small muted">{q.type}</div>
                </div>
                <button className="btn sm" onClick={() => setEdit(q)}>
                  Edit
                </button>
              </div>
            ) : (
              <div key={q.id}>
                <QuestRow q={q} date={logDate} onEdit={() => setEdit(q)} />
                {q.type === "daily" && q.days !== "1111111" && (
                  <div className="tiny muted" style={{ margin: "2px 0 0 52px" }}>
                    {WEEKDAY_SHORT.filter((_, i) => q.days[i] === "1").join(" · ")}
                  </div>
                )}
              </div>
            ),
          )}
          {!list.length && (
            <Empty emoji={tab === "todo" ? "📜" : "🗡️"}>
              Nothing here yet.{" "}
              {tab !== "archived" && (
                <button className="linkbtn" onClick={() => setEdit({ type: tab })}>
                  Add one?
                </button>
              )}
            </Empty>
          )}
        </div>
        {tab === "todo" && doneTodos > 0 && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn sm" onClick={() => act("quests/clear-done").catch(() => {})}>
              Archive {doneTodos} finished
            </button>
          </div>
        )}
      </Panel>
      {edit && <Editor entity="quests" row={edit as Record<string, unknown>} onClose={() => setEdit(null)} />}
    </>
  );
}
