// Trophy room: achievements (with progress), lifetime stats and the Hall of Fame of past seasons.
import { useState } from "react";
import { prettyDate } from "../../shared/dates";
import type { Achievement } from "../../shared/types";
import { useGame } from "../store";
import { Editor } from "../components/Editor";
import { IconOrEmoji } from "../components/Media";
import { Bar, HelpLink, Panel } from "../components/ui";
import { fmt } from "../util";

export default function Trophies() {
  const { state, act } = useGame();
  const [edit, setEdit] = useState<Partial<Achievement> | null>(null);
  const list = state.achievements.filter((a) => a.active);
  const unlocked = list.filter((a) => a.unlocked_at).length;
  const st = state.stats;
  const p = state.player;
  return (
    <>
      <div className="page-head">
        <h1>🏆 Trophy room <HelpLink to="trophies" /></h1>
        <button className="btn primary" onClick={() => setEdit({})}>
          ＋ Custom achievement
        </button>
      </div>
      <Panel title={`${state.season.name}`} right={<span className="chip">since {prettyDate(state.season.started_at)}</span>}>
        <div className="grid3">
          {[
            ["🏅", "Achievements", `${unlocked}/${list.length}`],
            ["⭐", "Level", `${p.level} ${p.title}`],
            ["🔥", "Best streak", `${p.best_streak} days`],
            ["✅", "Quests done", fmt(st.quests_done)],
            ["🌟", "Perfect days", fmt(st.perfect_days)],
            ["🎁", "Chests opened", fmt(st.chests_opened)],
            ["🍀", "Critical hits", fmt(st.crits)],
            ["⚔️", "Bosses beaten", fmt(st.sprints_won)],
          ].map(([e, l, v]) => (
            <div className="stat-tile" key={l} style={{ padding: "6px 2px" }}>
              <span className="label">
                {e} {l}
              </span>
              <span className="value" style={{ fontSize: 20 }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        {list.map((a) => {
          const secret = a.hidden && !a.unlocked_at;
          const [cur, target] = a.progress ?? [1, 1];
          return (
            <div key={a.id} className={`panel tight trophy tier-${a.tier} ${a.unlocked_at ? "" : "locked"}`} style={{ margin: 4 }}>
              <div className="t-emoji">{secret ? "❓" : <IconOrEmoji images={a.images} emoji={a.emoji} size={40} />}</div>
              <div className="t-name">{secret ? "Secret" : a.name}</div>
              <div className="tiny ink2">{secret ? "Keep playing…" : a.description}</div>
              <div className="tier-bar" title={a.tier} />
              {a.unlocked_at ? (
                <span className="tiny muted">✓ {prettyDate(a.unlocked_at.slice(0, 10))}</span>
              ) : !secret && a.progress && target > 1 ? (
                <div style={{ width: "100%" }}>
                  <Bar value={cur} max={target} thin kind="gold" seg={false} />
                  <span className="tiny muted num">
                    {fmt(cur, cur % 1 ? 1 : 0)}/{fmt(target)}
                  </span>
                </div>
              ) : null}
              {!a.unlocked_at && a.rule.includes('"manual"') && (
                <button className="btn xs gold" onClick={() => confirm(`Claim “${a.name}”? Be honest!`) && act(`achievements/${a.id}/claim`).catch(() => {})}>
                  Claim
                </button>
              )}
              {a.past_seasons > 0 && <span className="tiny muted">×{a.past_seasons} past seasons</span>}
              <span className="tiny muted">
                +{a.ap} AP
                <button className="linkbtn tiny" onClick={() => setEdit(a)}>
                  edit
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <Panel title="🏛️ Hall of Fame">
        {state.seasons.filter((s) => s.ended_at).length ? (
          <div className="list">
            {state.seasons
              .filter((s) => s.ended_at)
              .reverse()
              .map((s) => {
                const sum = s.summary ? JSON.parse(s.summary) : {};
                return (
                  <div className="li" key={s.id} style={{ alignItems: "flex-start" }}>
                    <span style={{ fontSize: 26 }}>🏛️</span>
                    <div className="grow">
                      <b>{s.name}</b>{" "}
                      <span className="small muted">
                        {prettyDate(s.started_at)} → {prettyDate(s.ended_at!)}
                      </span>
                      <div className="small ink2">
                        Lv {sum.level} · {fmt(sum.ap_earned)} AP earned · {fmt(sum.quests_done)} quests · best streak {sum.best_streak} · {sum.achievements} achievements
                        {sum.weight_start ? ` · weight ${fmt(sum.weight_start, 1)} → ${fmt(sum.weight_end, 1)} kg` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            When you start a New Game+ (Settings), this season is archived here with its stats.
          </p>
        )}
      </Panel>
      {edit && <Editor entity="achievements" row={edit as Record<string, unknown>} onClose={() => setEdit(null)} />}
    </>
  );
}
