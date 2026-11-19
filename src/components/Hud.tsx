// Sticky top HUD, the big pet scene on the Camp page, and the wardrobe.
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { COSMETICS, EYES, formName, isUnlocked, SPECIES, STAGES, type Slot } from "../../shared/levels";
import { PET_COLORS } from "../../shared/petgrid";
import { petBus } from "../fx";
import { useGame } from "../store";
import { Coin, EvolutionLine, Heart, lookOf, Pet, Star } from "../sprites";
import { fmtAP, isNight, petLine, petMood } from "../util";
import { Bar, Modal, Tabs } from "./ui";
import { HighwayButton } from "./Highway";
import { Big3Chip } from "./Big3";
import { SeasonDeco } from "./SeasonDeco";
import { SceneArt } from "./SceneArt";
import { resolveTheme } from "../../shared/themes";

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
          <Big3Chip />
        </div>
        <HighwayButton />
      </div>
    </header>
  );
}

export function PetStage() {
  const { state } = useGame();
  const p = state.player;
  const s = state.settings;
  const mood = petMood(state);
  const anim = usePetAnim();
  const scene = s.scene || "meadow";
  const night = isNight(state) || scene === "space" || scene === "city";
  const look = resolveTheme(s.look ?? "original", state.today);
  const [wardrobe, setWardrobe] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const asleep = mood === "sleep";
  // at night it naps by the campfire; otherwise it potters about now and then
  const byFire = asleep && scene === "meadow";
  const alive = !asleep && mood !== "fainted";
  const pat = () => {
    petBus.dispatchEvent(new CustomEvent("anim", { detail: "jump" }));
    const id = Date.now();
    setHearts((h) => [...h.slice(-3), id]);
    setTimeout(() => setHearts((h) => h.filter((x) => x !== id)), 1000);
  };
  return (
    <>
      <div className={`stage scene-${scene} look-${look} ${night ? "night" : ""} ${alive ? "alive" : ""}`}>
        <SceneArt scene={scene} night={night} name={s.pet_name} hideSun={look === "cny"} />
        <SeasonDeco look={look} night={night} />
        <div className="speech">{petLine(state)}</div>
        <div className={`shadow ${byFire ? "by-fire" : ""}`} />
        <button className="pet-wrap" onClick={pat} aria-label={`Pat ${s.pet_name}`} style={{ background: "none", border: 0, padding: 0 }}>
          <span className={`pet-walk ${byFire ? "by-fire" : ""}`}>
            <Pet stage={p.stage} mood={mood} {...lookOf(s)} scale={6} maxH={140} className={`pet-sprite ${anim} ${asleep ? "sleeping" : ""} ${mood === "fainted" ? "fainted" : ""}`} />
          </span>
        </button>
        {hearts.map((id) => (
          <span key={id} className="pet-heart" aria-hidden="true">
            💗
          </span>
        ))}
        {asleep && (
          <span className="zzz" style={{ left: byFire ? "calc(50% + 46px)" : "calc(50% + 34px)", bottom: "calc(var(--stage-h) * 0.09 + 104px)" }}>
            z
          </span>
        )}
        <span className="form-tag" title="Your pet's form">
          {formName(s.pet_species, p.stage)}
        </span>
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
  // previews show the form you have now (an egg previews as a baby)
  const stage = Math.max(1, p.stage);
  const next = STAGES[p.stage + 1];
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
          <SceneArt scene={s.scene || "meadow"} night={isNight(state) || s.scene === "space" || s.scene === "city"} name={s.pet_name} />
          <div className="pet-wrap">
            <Pet stage={p.stage} mood="happy" {...look} scale={5} maxH={108} className="pet-sprite" />
          </div>
        </div>
        <div className="wardrobe-form">
          <b>{formName(s.pet_species, p.stage)}</b>{" "}
          <span className="small ink2">{next ? `· evolves at Lv ${next.level}` : "· final form"}</span>
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
      {tab === "pet" && <EvolutionLine species={s.pet_species} stage={p.stage} look={look} />}
      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 4 }}>
        {tab === "pet" &&
          SPECIES.map((sp) =>
            tile(
              sp.id,
              s.pet_species === sp.id,
              // each animal comes in its natural colour (the Colour tab can still change it)
              () => set({ pet_species: sp.id, pet_color: sp.color }),
              <Pet stage={stage} mood="content" {...look} species={sp.id} color={sp.color} hat={null} scale={3} maxW={76} />,
              sp.name,
            ),
          )}
        {tab === "pet" &&
          EYES.map((e) =>
            tile(`eyes-${e.id}`, s.pet_eyes === e.id, () => set({ pet_eyes: e.id }), <Pet stage={stage} mood="content" {...look} eyes={e.id} hat={null} face={null} scale={3} maxW={76} />, `${e.name} eyes`),
          )}
        {tab === "colour" &&
          Object.entries(PET_COLORS).map(([k, c]) =>
            tile(k, s.pet_color === k, () => set({ pet_color: k }), <Pet stage={stage} mood="content" {...look} color={k} scale={3} maxW={76} />, c.name),
          )}
        {(tab === "hat" || tab === "face") &&
          tile("none", !(tab === "hat" ? s.hat : s.face), () => set({ [tab]: null }), <Pet stage={stage} mood="content" {...look} {...{ [tab]: null }} scale={3} maxW={76} />, tab === "hat" ? "No hat" : "Nothing")}
        {(tab === "hat" || tab === "face" || tab === "scene") &&
          COSMETICS.filter((c) => c.slot === tab).map((c) =>
            tile(
              c.id,
              (tab === "hat" ? s.hat : tab === "face" ? s.face : s.scene || "meadow") === c.id,
              () => set({ [tab]: c.id }),
              tab === "scene" ? (
                <div className={`stage swatch scene-${c.id}`}>
                  <SceneArt scene={c.id} night={c.id === "space" || c.id === "city"} name={s.pet_name} />
                </div>
              ) : (
                <Pet stage={stage} mood="content" {...look} {...{ [tab]: c.id }} scale={3} maxW={76} />
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
        Animals, eyes and colours are free, and you can switch any time: your pet takes the new animal's form for your level. It evolves at levels{" "}
        {STAGES.slice(1)
          .map((st) => st.level)
          .join(", ")}
        . Hats, faces and scenes unlock as you level up, and some only drop from chests.
      </p>
    </Modal>
  );
}
