// The "juice": floating numbers, toasts, celebrations, confetti, sounds and pet reactions.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Fx, GameState } from "../shared/types";
import { COSMETICS } from "../shared/levels";
import { prettyDate } from "../shared/dates";
import { sfx } from "./sound";
import { Chest, lookOf, Pet, type PetLook } from "./sprites";

interface FxApi {
  play: (list: Fx[], state?: GameState) => void;
  toast: (msg: string, emoji?: string) => void;
  error: (msg: string) => void;
}

const FxCtx = createContext<FxApi | null>(null);
export const useFx = () => useContext(FxCtx)!;

/** Pet reactions are broadcast so any visible pet can animate. */
export const petBus = new EventTarget();
const petAnim = (kind: "jump" | "hurt") => petBus.dispatchEvent(new CustomEvent("anim", { detail: kind }));

type Float = { id: number; text: string; cls: string; x: number; y: number };
type Toast = { id: number; msg: string; emoji: string; tone: string };
type Modal =
  | { kind: "levelup"; level: number; title: string; stage: number; look: PetLook }
  | { kind: "loot"; fx: Extract<Fx, { t: "loot" }> }
  | { kind: "fainted"; ap: number; pet: string; need: number }
  | { kind: "revived"; pet: string; stage: number; look: PetLook }
  | { kind: "goal"; title: string; emoji: string }
  | { kind: "boss"; title: string; boss: string; won: boolean }
  | { kind: "court"; fx: Extract<Fx, { t: "obligation" }> }
  | { kind: "report"; days: Extract<Fx, { t: "report" }>[]; pet: string };

let uid = 1;
const lastPointer = { x: 0, y: 0, t: 0 };
if (typeof window !== "undefined")
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      lastPointer.t = Date.now();
    },
    { capture: true },
  );

const CONFETTI_COLORS = ["#ff8fc1", "#4fd1a5", "#5ab8ff", "#ffd84d", "#7c5cff", "#ffb08a"];

export function FxProvider({ children }: { children: ReactNode }) {
  const [floats, setFloats] = useState<Float[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modals, setModals] = useState<Modal[]>([]);
  const [confetti, setConfetti] = useState<{ id: number; left: number; color: string; dur: number; delay: number }[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const addToast = useCallback((msg: string, emoji = "✨", tone = "") => {
    const id = uid++;
    setToasts((t) => [...t.slice(-3), { id, msg, emoji, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 4500 : 3200);
  }, []);

  const float = useCallback((text: string, cls: string, i: number) => {
    const fresh = Date.now() - lastPointer.t < 2500;
    const x = fresh ? lastPointer.x : window.innerWidth / 2;
    const y = (fresh ? lastPointer.y : 120) - i * 26;
    const id = uid++;
    setTimeout(() => {
      setFloats((f) => [...f, { id, text, cls, x, y }]);
      setTimeout(() => setFloats((f) => f.filter((v) => v.id !== id)), 1400);
    }, i * 140);
  }, []);

  const boom = useCallback((n = 40) => {
    const pieces = Array.from({ length: n }, () => ({
      id: uid++,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      dur: 1.3 + Math.random() * 1.2,
      delay: Math.random() * 0.4,
    }));
    setConfetti((c) => [...c, ...pieces]);
    setTimeout(() => setConfetti((c) => c.filter((p) => !pieces.includes(p))), 3000);
  }, []);

  const shake = useCallback(() => {
    const el = document.getElementById("root");
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }, []);

  const play = useCallback(
    (list: Fx[], st?: GameState) => {
      let i = 0;
      const s = st?.settings;
      const reports: Extract<Fx, { t: "report" }>[] = [];
      const add: Modal[] = [];
      for (const f of list) {
        switch (f.t) {
          case "ap":
            float(`${f.v > 0 ? "+" : ""}${f.v} AP`, f.v < 0 ? "neg" : f.crit ? "crit" : "", i++);
            if (f.crit) {
              float("CRITICAL!", "crit", i++);
              sfx.crit();
              shake();
            } else if (f.v > 0) sfx.coin();
            else sfx.spend();
            if (f.v > 0) petAnim("jump");
            break;
          case "xp":
            float(`+${f.v} XP`, "xp", i++);
            break;
          case "hp":
            float(`${f.v > 0 ? "+" : ""}${f.v} HP`, f.v > 0 ? "heal" : "hp", i++);
            if (f.v < 0) {
              sfx.hurt();
              petAnim("hurt");
              shake();
            }
            break;
          case "levelup":
            add.push({ kind: "levelup", level: f.level, title: f.title, stage: st?.player.stage ?? 1, look: s ? lookOf(s) : {} });
            break;
          case "achievement":
            sfx.achievement();
            addToast(`Achievement unlocked: ${f.name}${f.ap ? ` (+${f.ap} AP)` : ""}`, f.emoji, "gold");
            break;
          case "chest":
            addToast(`You found a ${f.rarity} chest! (${f.source})`, "🎁", "gold");
            break;
          case "loot":
            add.push({ kind: "loot", fx: f });
            break;
          case "fainted":
            add.push({ kind: "fainted", ap: f.ap_lost, pet: s?.pet_name ?? "Your pet", need: s?.revive_quests ?? 3 });
            break;
          case "revived":
            add.push({ kind: "revived", pet: s?.pet_name ?? "Your pet", stage: st?.player.stage ?? 1, look: s ? lookOf(s) : {} });
            break;
          case "hat":
            addToast(`New look unlocked: ${COSMETICS.find((h) => h.id === f.hat)?.name ?? f.hat}! Try it in the Camp wardrobe.`, "🎀", "gold");
            break;
          case "boss":
            if (f.won) add.push({ kind: "boss", title: f.title, boss: f.boss, won: true });
            else addToast(`${f.boss} escaped… sprint "${f.title}" ended.`, "💨");
            break;
          case "goal":
            add.push({ kind: "goal", title: f.title, emoji: f.emoji });
            break;
          case "obligation":
            add.push({ kind: "court", fx: f });
            break;
          case "report":
            reports.push(f);
            break;
          case "toast":
            addToast(f.msg, f.emoji);
            break;
        }
      }
      if (reports.length) add.unshift({ kind: "report", days: reports, pet: s?.pet_name ?? "Mochi" });
      if (add.length) setModals((m) => [...m, ...add]);
    },
    [addToast, float, shake],
  );

  // celebrate when a modal appears
  const top = modals[0];
  useEffect(() => {
    if (!top) return;
    if (top.kind === "levelup") {
      sfx.levelUp();
      boom(60);
    } else if (top.kind === "goal" || (top.kind === "boss" && top.won)) {
      sfx.achievement();
      boom(70);
    } else if (top.kind === "loot") {
      sfx.chest();
      if (top.fx.rarity === "epic" || top.fx.rarity === "legendary") boom(50);
    } else if (top.kind === "fainted") sfx.faint();
    else if (top.kind === "revived") {
      sfx.levelUp();
      boom(30);
    }
  }, [top, boom]);

  const api = useMemo<FxApi>(
    () => ({
      play,
      toast: (m, e) => addToast(m, e),
      error: (m) => {
        sfx.error();
        addToast(m, "⚠️", "error");
      },
    }),
    [play, addToast],
  );

  const close = () => setModals((m) => m.slice(1));

  return (
    <FxCtx.Provider value={api}>
      <div ref={rootRef}>{children}</div>
      {floats.map((f) => (
        <div key={f.id} className={`float-num ${f.cls}`} style={{ left: f.x, top: f.y - 20 }}>
          {f.text}
        </div>
      ))}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`panel toast ${t.tone === "gold" ? "tinted" : ""}`} style={t.tone === "error" ? { background: "#ffe1e1", color: "#3b0d0d" } : undefined}>
            <span className="t-emoji">{t.emoji}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
      {confetti.map((p) => (
        <i key={p.id} className="confetti" style={{ left: `${p.left}vw`, background: p.color, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
      ))}
      {top && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="panel modal">
            <ModalBody m={top} close={close} />
          </div>
        </div>
      )}
    </FxCtx.Provider>
  );
}

function ModalBody({ m, close }: { m: Modal; close: () => void }) {
  const ok = (label = "Yay!") => (
    <div className="modal-actions" style={{ justifyContent: "center" }}>
      <button className="btn primary" onClick={close} autoFocus>
        {label}
      </button>
    </div>
  );
  switch (m.kind) {
    case "levelup":
      return (
        <div className="celebrate">
          <div className="px-font tiny muted">LEVEL UP!</div>
          <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
            <Pet stage={m.stage} mood="happy" {...m.look} scale={6} className="pet-sprite" />
          </div>
          <h3>Level {m.level}</h3>
          <p>
            You are now a <b>{m.title}</b>! HP fully restored and a chest dropped. 🎁
          </p>
          {ok("Let's go!")}
        </div>
      );
    case "loot": {
      const f = m.fx;
      return (
        <div className={`celebrate rarity-${f.rarity}`}>
          <span className="rarity-tag">{f.rarity} chest</span>
          <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }} className="glow">
            <Chest rarity={f.rarity} scale={8} />
          </div>
          <h3>+{f.ap} AP · +{f.xp} XP</h3>
          {f.item && <p>🎒 Bonus item: <b>{f.item}</b> (in your Bag)</p>}
          {f.hat && <p>🎀 New look: <b>{COSMETICS.find((h) => h.id === f.hat)?.name}</b>!</p>}
          {ok("Sweet!")}
        </div>
      );
    }
    case "fainted":
      return (
        <div className="celebrate">
          <div className="big">😵</div>
          <h3>{m.pet} fainted!</h3>
          <p>
            HP hit zero. You lost <b>{m.ap} AP</b> and your streak. While fainted, quests pay half.
          </p>
          <p className="ink2">
            Revive {m.pet} by completing <b>{m.need} quests</b>. You can do this. 💪
          </p>
          {ok("I'll get back up")}
        </div>
      );
    case "revived":
      return (
        <div className="celebrate">
          <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
            <Pet stage={m.stage} mood="happy" {...m.look} scale={6} className="pet-sprite" />
          </div>
          <h3>{m.pet} is back!</h3>
          <p>Revived with half HP. Welcome back, hero.</p>
          {ok()}
        </div>
      );
    case "goal":
      return (
        <div className="celebrate">
          <div className="big">{m.emoji}</div>
          <h3>Goal complete!</h3>
          <p>
            <b>{m.title}</b>, done. A legendary chest is waiting for you. 🌟
          </p>
          {ok("Legendary!")}
        </div>
      );
    case "boss":
      return (
        <div className="celebrate">
          <div className="big">⚔️</div>
          <h3>Boss defeated!</h3>
          <p>
            You beat <b>{m.boss}</b> and finished the sprint “{m.title}”. Epic chest dropped!
          </p>
          {ok("Victory!")}
        </div>
      );
    case "court":
      return (
        <div>
          <div className="modal-title">⚖️ Calorie Court summons</div>
          <p>
            {prettyDate(m.fx.date)} landed in the <b>{m.fx.item}</b> band. You must use one ({m.fx.price} AP at full price).
          </p>
          <p className="ink2 small">
            Settle it before the day closes to use a voucher or a ticket from your Bag. Otherwise it's auto-billed at full price.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={close}>
              Later
            </button>
            <button
              className="btn primary"
              onClick={() => {
                location.hash = "#/shop/court";
                close();
              }}
            >
              Settle now
            </button>
          </div>
        </div>
      );
    case "report": {
      const hp = m.days.reduce((a, d) => a + d.hp, 0);
      return (
        <div>
          <div className="modal-title">📜 While you were away</div>
          <div className="list">
            {m.days.map((d) => (
              <div className="li" key={d.date} style={{ alignItems: "flex-start" }}>
                <div style={{ fontSize: 24 }}>{d.rest ? "🏖️" : d.perfect && !d.late?.length ? "🌟" : d.missed.length || d.late?.length ? "😿" : "✅"}</div>
                <div className="grow">
                  <b>{prettyDate(d.date)}</b>{" "}
                  <span className="muted small">{d.rest ? "rest day" : `${d.done}/${d.due} dailies`}</span>
                  {d.missed.length > 0 && !d.rest && <div className="small ink2">Missed: {d.missed.join(", ")}</div>}
                  {!!d.late?.length && !d.rest && <div className="small neg">⏰ To-dos late: {d.late.join(", ")}</div>}
                  {d.billed.length > 0 && <div className="small neg">Auto-billed: {d.billed.join(", ")}</div>}
                </div>
                <div className="small num" style={{ textAlign: "right" }}>
                  {d.hp !== 0 && <div className={d.hp < 0 ? "neg" : "pos"}>{d.hp > 0 ? "+" : ""}{d.hp} HP</div>}
                  <div>🔥 {d.streak}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="small ink2" style={{ marginTop: 10 }}>
            {hp < 0 ? `${m.pet} took ${-hp} damage. Let's make today a good one!` : `${m.pet} is proud of you!`}
          </p>
          {ok("Onward!")}
        </div>
      );
    }
  }
}
