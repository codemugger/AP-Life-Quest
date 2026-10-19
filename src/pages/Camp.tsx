// Home: pet, status, alerts, one-tap logging and today's dailies.
import { useEffect, useState } from "react";
import { daysBetween } from "../../shared/dates";
import { useGame } from "../store";
import { Chest, Coin } from "../sprites";
import { PetStage } from "../components/Hud";
import { LogValue, QuestRow } from "../components/QuestRow";
import { IconOrEmoji } from "../components/Media";
import { Bar, Panel, Seg } from "../components/ui";
import { dailiesFor, doneOn, fmt, fmtAP, relDay, valueOn } from "../util";

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
        <Alerts />
      </div>

      <div>
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
        <Panel title={<>⚔️ Daily quests</>} right={<span className="chip">{doneCount}/{dailies.length}</span>}>
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
            <a className="linkbtn" href="#/quests">
              All quests →
            </a>
          </div>
        </Panel>
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

function Alerts() {
  const { state, act, busy } = useGame();
  const p = state.player;
  return (
    <>
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

function QuickLog() {
  const { state, act, logDate, busy } = useGame();
  const weight = state.metrics.find((m) => m.key === "weight");
  const cal = state.metrics.find((m) => m.key === "calories");
  const csd = state.metrics.find((m) => m.key === "csd" && m.active);
  const fasting = state.metrics.find((m) => m.key === "fasting" && m.active);
  const w = valueOn(state, "weight", logDate);
  const c = valueOn(state, "calories", logDate);
  const h = valueOn(state, "csd", logDate);
  const [wv, setWv] = useState("");
  const [cv, setCv] = useState("");
  const [open, setOpen] = useState<null | "csd">(null);
  useEffect(() => {
    setWv("");
    setCv("");
  }, [logDate]);
  const save = async (key: string, v: string, clear: () => void) => {
    if (v === "" || Number.isNaN(Number(v))) return;
    try {
      await act(`metrics/${key}/log`, { date: logDate, value: Number(v) });
      clear();
    } catch {}
  };
  const budget = cal?.target ?? 0;
  return (
    <Panel title="📝 Quick log">
      <div className="col" style={{ gap: 12 }}>
        {weight && (
          <div className="row">
            <span style={{ fontSize: 22, width: 30 }}>⚖️</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={w !== null ? `${fmt(w, 1)} kg logged` : "Weight (kg)"}
              value={wv}
              onChange={(e) => setWv(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save("weight", wv, () => setWv(""))}
              aria-label="Weight in kg"
            />
            <button className="btn good" onClick={() => save("weight", wv, () => setWv(""))} disabled={!wv || busy}>
              Save
            </button>
          </div>
        )}
        {cal && (
          <div>
            <div className="row">
              <span style={{ fontSize: 22, width: 30 }}>🍱</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder={c !== null ? `${fmt(c)} kcal logged — type to change` : "Today's calories (kcal)"}
                value={cv}
                onChange={(e) => setCv(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save("calories", cv, () => setCv(""))}
                aria-label="Calories"
              />
              <button className="btn good" onClick={() => save("calories", cv, () => setCv(""))} disabled={!cv || busy}>
                Save
              </button>
            </div>
            {budget > 0 && (
              <div style={{ marginLeft: 38, marginTop: 6 }}>
                <div className="bar-label">
                  <span>{c === null ? "not logged yet" : c <= budget ? "within budget 🥗" : `${fmt(c - budget)} over budget`}</span>
                  <span className="num">
                    {fmt(c ?? 0)}/{fmt(budget)}
                  </span>
                </div>
                <Bar value={c ?? 0} max={budget} kind={c !== null && c > budget ? "bad" : "good"} thin seg={false} />
              </div>
            )}
          </div>
        )}
        {csd && (
          <div className="row wrap">
            <span style={{ fontSize: 22, width: 30 }}>{csd.emoji}</span>
            <span className="grow">
              <b>{csd.name}</b>{" "}
              <span className="small ink2">
                {fmt(h ?? 0, 1)}/{fmt(csd.target ?? 0, 0)} {csd.unit}
              </span>
            </span>
            {(csd.quick ?? "1").split(",").map((n) => (
              <button key={n} className="btn sm" onClick={() => act(`metrics/csd/log`, { date: logDate, value: Number(n) }).catch(() => {})}>
                +{n}
              </button>
            ))}
            <button className="btn sm" onClick={() => setOpen("csd")} aria-label="Custom amount">
              …
            </button>
          </div>
        )}
        {fasting && <FastTimer />}
      </div>
      {open === "csd" && csd && <LogValue metric={csd} date={logDate} onClose={() => setOpen(null)} />}
    </Panel>
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
