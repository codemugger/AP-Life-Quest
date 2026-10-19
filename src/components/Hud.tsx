// Sticky top HUD and the big pet scene on the Camp page.
import { useEffect, useMemo, useState } from "react";
import { HATS } from "../../shared/levels";
import { petBus } from "../fx";
import { useGame } from "../store";
import { Coin, Heart, Pet, PET_COLORS, Star } from "../sprites";
import { fmtAP, isNight, petLine, petMood } from "../util";
import { Bar, Modal } from "./ui";

function usePetAnim() {
  const [anim, setAnim] = useState("");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const kind = (e as CustomEvent).detail as string;
      setAnim("");
      requestAnimationFrame(() => setAnim(kind));
      clearTimeout(t);
      t = setTimeout(() => setAnim(""), 600);
    };
    petBus.addEventListener("anim", on);
    return () => {
      petBus.removeEventListener("anim", on);
      clearTimeout(t);
    };
  }, []);
  return anim;
}

export function Hud() {
  const { state } = useGame();
  const p = state.player;
  const s = state.settings;
  const mood = petMood(state);
  const anim = usePetAnim();
  return (
    <header className="hud">
      <div className="hud-inner">
        <div className="pet-mini" onClick={() => (location.hash = "#/")} style={{ cursor: "pointer" }}>
          <Pet stage={p.stage} mood={mood} color={s.pet_color} hat={s.hat} scale={2} className={`pet-sprite ${anim} ${mood === "fainted" ? "fainted" : ""}`} />
        </div>
        <div className="hud-bars">
          <Heart scale={2} />
          <div>
            <Bar value={p.hp} max={p.max_hp} kind="hp" label="HP" />
          </div>
          <Star scale={2} />
          <div>
            <Bar value={p.into} max={p.needed} label="XP" />
          </div>
        </div>
        <div className="hud-stats">
          <span className="lv-badge">LV {p.level}</span>
          <span className={`coin-count ${p.ap < 0 ? "neg" : ""}`}>
            <Coin scale={2} /> {fmtAP(p.ap)}
          </span>
        </div>
      </div>
    </header>
  );
}

export function PetStage() {
  const { state, act } = useGame();
  const p = state.player;
  const s = state.settings;
  const mood = petMood(state);
  const anim = usePetAnim();
  const night = isNight(state);
  const [wardrobe, setWardrobe] = useState(false);
  const stars = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ l: (i * 53) % 100, t: (i * 37) % 55, d: (i % 5) * 0.6 })), []);
  return (
    <>
      <div className={`stage ${night ? "night" : ""}`}>
        <div className="stars">
          {stars.map((st, i) => (
            <i key={i} style={{ left: `${st.l}%`, top: `${st.t}%`, animationDelay: `${st.d}s` }} />
          ))}
        </div>
        <div className="sun" />
        <div className="cloud" style={{ top: 40, animationDuration: "55s" }} />
        <div className="cloud" style={{ top: 86, animationDuration: "75s", animationDelay: "-30s" }} />
        <div className="speech">{petLine(state)}</div>
        <div className="ground" />
        <div className="shadow" />
        <button className="pet-wrap" onClick={() => setWardrobe(true)} aria-label="Open wardrobe" style={{ background: "none", border: 0, padding: 0 }}>
          <Pet stage={p.stage} mood={mood} color={s.pet_color} hat={s.hat} scale={6} className={`pet-sprite ${anim} ${mood === "sleep" ? "sleeping" : ""} ${mood === "fainted" ? "fainted" : ""}`} />
        </button>
        {mood === "sleep" && (
          <span className="zzz" style={{ left: "58%", bottom: 150 }}>
            z
          </span>
        )}
      </div>
      {wardrobe && (
        <Modal title="🎀 Wardrobe" onClose={() => setWardrobe(false)}>
          <p className="small ink2">Hats drop from chests and unlock at levels 5, 10, 15, 25 and 40.</p>
          <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))" }}>
            <button className={`panel tight trophy ${!s.hat ? "tinted" : ""}`} onClick={() => act("settings", { hat: null }, "PUT")}>
              <Pet stage={Math.max(2, p.stage)} mood="content" color={s.pet_color} scale={3} />
              <span className="small">No hat</span>
            </button>
            {HATS.map((h) => {
              const owned = s.hats.includes(h.id);
              return (
                <button
                  key={h.id}
                  className={`panel tight trophy ${s.hat === h.id ? "tinted" : ""} ${owned ? "" : "locked"}`}
                  disabled={!owned}
                  onClick={() => act("settings", { hat: h.id }, "PUT")}
                  style={{ opacity: owned ? 1 : 0.4 }}
                >
                  <Pet stage={Math.max(2, p.stage)} mood="content" color={s.pet_color} hat={h.id} scale={3} />
                  <span className="small">{owned ? h.name : "???"}</span>
                </button>
              );
            })}
          </div>
          <div className="panel-title" style={{ marginTop: 10 }}>
            <h2>Colour</h2>
          </div>
          <div className="row wrap">
            {Object.entries(PET_COLORS).map(([k, c]) => (
              <button key={k} className={`btn sm ${s.pet_color === k ? "pressed" : ""}`} style={{ ["--b" as string]: c.b, ["--bi" as string]: "#2d2142" }} onClick={() => act("settings", { pet_color: k }, "PUT")}>
                {c.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
