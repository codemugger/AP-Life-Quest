// Sticky top HUD, the big pet scene on the Camp page, and the wardrobe.
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { COSMETICS, EYES, isUnlocked, SPECIES, type Slot } from "../../shared/levels";
import { PET_COLORS } from "../../shared/petgrid";
import { petBus } from "../fx";
import { useGame } from "../store";
import { Coin, Heart, lookOf, Pet, Star } from "../sprites";
import { fmtAP, isNight, petLine, petMood } from "../util";
import { Bar, Modal, Tabs } from "./ui";

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
  const mood = petMood(state);
  const anim = usePetAnim();
  return (
    <header className="hud">
      <div className="hud-inner">
        <div className="pet-mini" onClick={() => (location.hash = "#/")} style={{ cursor: "pointer" }}>
          <Pet stage={p.stage} mood={mood} {...lookOf(state.settings)} scale={2} className={`pet-sprite ${anim} ${mood === "fainted" ? "fainted" : ""}`} />
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

/** Background decorations for each camp scene. */
function SceneDeco({ scene }: { scene: string }) {
  if (scene === "beach")
    return (
      <>
        <div className="sea" />
        <div className="palm" />
      </>
    );
  if (scene === "city") return <div className="skyline" />;
  if (scene === "sakura")
    return (
      <>
        <div className="tree t1" />
        <div className="tree t2" />
        {[8, 22, 37, 55, 71, 86].map((l, i) => (
          <i key={i} className="petal" style={{ left: `${l}%`, animationDelay: `${i * 1.3}s` }} />
        ))}
      </>
    );
  if (scene === "space") return <div className="planet" />;
  return null;
}

export function PetStage() {
  const { state } = useGame();
  const p = state.player;
  const s = state.settings;
  const mood = petMood(state);
  const anim = usePetAnim();
  const scene = s.scene || "meadow";
  const night = isNight(state) || scene === "space" || scene === "city";
  const [wardrobe, setWardrobe] = useState(false);
  const stars = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ l: (i * 53) % 100, t: (i * 37) % 55, d: (i % 5) * 0.6 })), []);
  return (
    <>
      <div className={`stage scene-${scene} ${night ? "night" : ""}`}>
        <div className="stars">
          {stars.map((st, i) => (
            <i key={i} style={{ left: `${st.l}%`, top: `${st.t}%`, animationDelay: `${st.d}s` }} />
          ))}
        </div>
        {scene !== "space" && <div className="sun" />}
        {scene !== "space" && scene !== "city" && (
          <>
            <div className="cloud" style={{ top: 40, animationDuration: "55s" }} />
            <div className="cloud" style={{ top: 86, animationDuration: "75s", animationDelay: "-30s" }} />
          </>
        )}
        <SceneDeco scene={scene} />
        <div className="speech">{petLine(state)}</div>
        <div className="ground" />
        <div className="shadow" />
        <button className="pet-wrap" onClick={() => setWardrobe(true)} aria-label="Open wardrobe" style={{ background: "none", border: 0, padding: 0 }}>
          <Pet stage={p.stage} mood={mood} {...lookOf(s)} scale={6} className={`pet-sprite ${anim} ${mood === "sleep" ? "sleeping" : ""} ${mood === "fainted" ? "fainted" : ""}`} />
        </button>
        {mood === "sleep" && (
          <span className="zzz" style={{ left: "58%", bottom: 150 }}>
            z
          </span>
        )}
        <button className="btn xs wardrobe-btn" onClick={() => setWardrobe(true)}>
          🎀 Wardrobe
        </button>
      </div>
      {wardrobe && <Wardrobe onClose={() => setWardrobe(false)} />}
    </>
  );
}

type WTab = "pet" | "colour" | Slot;

function Wardrobe({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const s = state.settings;
  const p = state.player;
  const [tab, setTab] = useState<WTab>("pet");
  const look = lookOf(s);
  const stage = Math.max(2, p.stage);
  const set = (patch: Record<string, unknown>) => act("settings", patch, "PUT").catch(() => {});
  const [custom, setCustom] = useState(/^#/.test(s.pet_color) ? s.pet_color : "#7ec8a0");
  const tile = (key: string, selected: boolean, onClick: () => void, preview: ReactElement, label: string, locked?: string) => (
    <button
      key={key}
      className={`panel tight trophy ${selected ? "tinted selected" : ""} ${locked ? "locked" : ""}`}
      disabled={!!locked || busy}
      onClick={onClick}
      title={locked}
      style={{ margin: 4 }}
    >
      {preview}
      <span className="small">{label}</span>
      {locked && <span className="tiny muted">🔒 {locked}</span>}
    </button>
  );
  const lockText = (id: string) => {
    if (isUnlocked(id, s.hats, p.level)) return undefined;
    const c = COSMETICS.find((x) => x.id === id)!;
    return c.unlock === "chest" ? "chest drop" : `level ${c.unlock}`;
  };
  return (
    <Modal title="🎀 Wardrobe" onClose={onClose} wide>
      <div className="center" style={{ marginBottom: 6 }}>
        <div className={`stage mini scene-${s.scene || "meadow"}`}>
          <SceneDeco scene={s.scene || "meadow"} />
          <div className="ground" />
          <div className="pet-wrap">
            <Pet stage={p.stage} mood="happy" {...look} scale={5} className="pet-sprite" />
          </div>
        </div>
      </div>
      <Tabs<WTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "pet", label: "Pet" },
          { id: "colour", label: "Colour" },
          { id: "hat", label: "Hats" },
          { id: "face", label: "Face" },
          { id: "scene", label: "Scene" },
        ]}
      />
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 4 }}>
        {tab === "pet" &&
          SPECIES.map((sp) =>
            tile(sp.id, s.pet_species === sp.id, () => set({ pet_species: sp.id }), <Pet stage={stage} mood="content" {...look} species={sp.id} hat={null} scale={3} />, sp.name),
          )}
        {tab === "pet" &&
          EYES.map((e) =>
            tile(`eyes-${e.id}`, s.pet_eyes === e.id, () => set({ pet_eyes: e.id }), <Pet stage={stage} mood="content" {...look} eyes={e.id} hat={null} face={null} scale={3} />, `${e.name} eyes`),
          )}
        {tab === "colour" &&
          Object.entries(PET_COLORS).map(([k, c]) =>
            tile(k, s.pet_color === k, () => set({ pet_color: k }), <Pet stage={stage} mood="content" {...look} color={k} scale={3} />, c.name),
          )}
        {(tab === "hat" || tab === "face") &&
          tile("none", !(tab === "hat" ? s.hat : s.face), () => set({ [tab]: null }), <Pet stage={stage} mood="content" {...look} {...{ [tab]: null }} scale={3} />, tab === "hat" ? "No hat" : "Nothing")}
        {(tab === "hat" || tab === "face" || tab === "scene") &&
          COSMETICS.filter((c) => c.slot === tab).map((c) =>
            tile(
              c.id,
              (tab === "hat" ? s.hat : tab === "face" ? s.face : s.scene || "meadow") === c.id,
              () => set({ [tab]: c.id }),
              tab === "scene" ? (
                <div className={`stage swatch scene-${c.id}`}>
                  <SceneDeco scene={c.id} />
                  <div className="ground" />
                </div>
              ) : (
                <Pet stage={stage} mood="content" {...look} {...{ [tab]: c.id }} scale={3} />
              ),
              c.name,
              lockText(c.id),
            ),
          )}
      </div>
      {tab === "colour" && (
        <div className="row wrap" style={{ marginTop: 10 }}>
          <label className="row small">
            Any colour:
            <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ width: 54, height: 36, border: 0, background: "none" }} />
          </label>
          <button className="btn sm" disabled={busy} onClick={() => set({ pet_color: custom })}>
            Use this colour
          </button>
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Species, eyes and colours are free. Hats, faces and scenes unlock as you level up, and some only drop from chests.
      </p>
    </Modal>
  );
}
