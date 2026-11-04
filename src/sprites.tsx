// Pixel art: a tiny sprite renderer, the pets, hats, chests and icons.
import { memo, useEffect, useState, type ReactElement } from "react";
import { formName, STAGES } from "../shared/levels";
import { buildPet, PET_COLORS, petPalette, petSize, type Mood } from "../shared/petgrid";
import "./pets.css";

export { PET_COLORS, type Mood };

type Palette = Record<string, string>;

const BASE: Palette = {
  o: "#2d2142",
  k: "#2d2142",
  w: "#ffffff",
  p: "#ff7aa8",
  r: "#e0436b",
  t: "#5ab8ff",
  y: "#ffe066",
  g: "#ffb703",
  G: "#d98a00",
  R: "#ff5d6c",
  B: "#5ab8ff",
  V: "#7c5cff",
  v: "#b9a6ff",
  P: "#ff8fc1",
  n: "#3fbf8a",
  s: "#1b1530",
  S: "#6d5fa8",
  T: "#b9a991",
  b: "#c07a3e",
  d: "#8a5428",
  c: "#fff1d6",
  K: "#4b2e35",
  f: "#ff8a3d",
  F: "#ffd166",
};

/** Every letter in one dark colour: a not-yet-discovered form. */
const SILHOUETTE: Palette = Object.fromEntries([...Object.keys(BASE), "l", "e"].map((k) => [k, "#4a3f6b"]));

/** Renders rows of characters as crisp SVG rects (horizontal runs merged). */
export const Sprite = memo(function Sprite({
  grid,
  palette = {},
  scale = 4,
  className,
  title,
}: {
  grid: string[];
  palette?: Palette;
  scale?: number;
  className?: string;
  title?: string;
}) {
  const pal = { ...BASE, ...palette };
  const w = Math.max(...grid.map((r) => r.length));
  const h = grid.length;
  const rects: ReactElement[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || ch === " " || !pal[ch]) {
        x++;
        continue;
      }
      let len = 1;
      while (row[x + len] === ch) len++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={len} height={1} fill={pal[ch]} />);
      x += len;
    }
  });
  return (
    <svg
      className={`px-art ${className ?? ""}`}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
});

export interface PetLook {
  color?: string;
  hat?: string | null;
  species?: string;
  eyes?: string;
  face?: string | null;
}

/** The look props for a Pet from a character's settings. */
export const lookOf = (s: { pet_color: string; hat: string | null; pet_species: string; pet_eyes: string; face: string | null }): PetLook => ({
  color: s.pet_color,
  hat: s.hat,
  species: s.pet_species,
  eyes: s.pet_eyes,
  face: s.face,
});

/**
 * The pet. Later forms are bigger drawings, so `scale` is pixels per sprite pixel, shrunk if needed
 * so the body (not counting a hat) fits `maxW` × `maxH` CSS pixels.
 */
export function Pet({
  stage,
  mood,
  color = "pink",
  hat = null,
  species = "cat",
  eyes = "dot",
  face = null,
  scale = 6,
  maxW,
  maxH,
  silhouette = false,
  className,
}: PetLook & { stage: number; mood: Mood; scale?: number; maxW?: number; maxH?: number; silhouette?: boolean; className?: string }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (silhouette || mood === "sleep" || mood === "fainted") return;
    let t2: ReturnType<typeof setTimeout>;
    const t = setInterval(() => {
      setBlink(true);
      t2 = setTimeout(() => setBlink(false), 160);
    }, 3200 + Math.random() * 1500);
    return () => {
      clearInterval(t);
      clearTimeout(t2);
    };
  }, [mood, silhouette]);
  const c = petPalette(color);
  const eggPal = { b: "#fff6e0", l: "#ffffff", d: "#ead7b4", e: c.d };
  const pal = silhouette ? SILHOUETTE : stage === 0 ? eggPal : { b: c.b, l: c.l, d: c.d };
  const grid = buildPet(stage, blink && mood !== "sad" ? "blink" : mood, hat, { species, eyes, face });
  const size = petSize(stage, species);
  const fit = Math.min(scale, maxW ? maxW / size.w : scale, maxH ? maxH / size.h : scale);
  const px = Math.max(1, Math.floor(fit * 4) / 4); // quarter steps keep the pixels even
  return <Sprite grid={grid} palette={pal} scale={px} className={className} title={silhouette ? "Not discovered yet" : "Your pet"} />;
}

/** Pokédex-style row: every form of a species, with the ones not reached yet as silhouettes. */
export function EvolutionLine({ species, stage, look }: { species: string; stage: number; look: PetLook }) {
  return (
    <div className="evo-line" role="list" aria-label="Evolution line">
      {STAGES.map((st, i) => {
        const known = i <= stage;
        return (
          <div key={i} className={`evo-step ${i === stage ? "now" : ""} ${known ? "" : "unknown"}`} role="listitem">
            <div className="evo-pet">
              <Pet stage={i} mood="content" {...look} species={species} hat={null} face={null} scale={2} maxW={56} silhouette={!known} />
            </div>
            <span className="evo-name">{known ? formName(species, i) : "???"}</span>
            <span className="tiny muted">{i === 0 ? "start" : `Lv ${st.level}`}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Items & icons
// ---------------------------------------------------------------------------
const CHEST = [
  "..oooooooo..",
  ".obbbbbbbbo.",
  "obbbbbbbbbbo",
  "oTTTTTTTTTTo",
  "oooooyyooooo",
  "obbbbyybbbbo",
  "oddbboobbddo",
  "odbbbbbbbbdo",
  "oTTTTTTTTTTo",
  "oooooooooooo",
];
const RARITY_TRIM: Record<string, string> = { common: "#c9b48f", rare: "#5ab8ff", epic: "#b57bff", legendary: "#ffc93c" };

export function Chest({ rarity, scale = 5, className }: { rarity: string; scale?: number; className?: string }) {
  return <Sprite grid={CHEST} palette={{ T: RARITY_TRIM[rarity] ?? RARITY_TRIM.common }} scale={scale} className={className} title={`${rarity} chest`} />;
}

const COIN = ["..oooo..", ".oyyyyo.", "oyywwyGo", "oywyyyGo", "oyyyyyGo", "oyyyyGGo", ".oGGGGo.", "..oooo.."];
const HEART = [".oo...oo.", "oRRo.oRRo", "oRwRoRRRo", "oRRRRRRRo", ".oRRRRRo.", "..oRRRo..", "...oRo...", "....o...."];
const STAR = ["....o....", "...oyo...", "oooyyyooo", "oyyywyyyo", ".oyyyyyo.", "..oyyyo..", ".oyyoyyo.", ".oyo.oyo.", ".oo...oo."];
const CHECK = [".......oo", "......ooo", "oo...ooo.", "ooo.ooo..", ".ooooo...", "..ooo....", "...o....."];

export const Coin = ({ scale = 2 }: { scale?: number }) => <Sprite grid={COIN} scale={scale} title="AP" />;
export const Heart = ({ scale = 2 }: { scale?: number }) => <Sprite grid={HEART} scale={scale} title="HP" />;
export const Star = ({ scale = 2 }: { scale?: number }) => <Sprite grid={STAR} palette={{ y: "#b9a6ff" }} scale={scale} title="XP" />;
export const Check = ({ scale = 3 }: { scale?: number }) => <Sprite grid={CHECK} scale={scale} />;

/** Preview of a hat on its own (for the wardrobe). */
export function HatPreview({ hat, look }: { hat: string; look: PetLook }) {
  return <Pet stage={2} mood="content" {...look} hat={hat} scale={3} />;
}
