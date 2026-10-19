// XP curve, titles and pet evolution — shared by the Worker and the UI.

/** XP needed to go from `level` to `level + 1`. Lv1→2 = 100, then +50 per level. */
export const xpToNext = (level: number) => 100 + (level - 1) * 50;

export function levelInfo(totalXp: number) {
  let level = 1;
  let into = Math.max(0, Math.floor(totalXp));
  while (into >= xpToNext(level) && level < 999) {
    into -= xpToNext(level);
    level++;
  }
  return { level, into, needed: xpToNext(level) };
}

export const TITLES: [number, string][] = [
  [1, "Sprout"],
  [3, "Wanderer"],
  [5, "Apprentice"],
  [8, "Adventurer"],
  [12, "Knight"],
  [16, "Ranger"],
  [20, "Champion"],
  [25, "Hero"],
  [30, "Guardian"],
  [40, "Legend"],
  [50, "Mythic"],
  [75, "Ascended"],
  [100, "Eternal"],
];

export function titleFor(level: number) {
  let t = TITLES[0][1];
  for (const [lv, name] of TITLES) if (level >= lv) t = name;
  return t;
}

/** Pet evolution stage: 0 egg, 1 baby, 2 kid, 3 adult, 4 legend. */
export const STAGES = [
  { level: 1, name: "Egg" },
  { level: 3, name: "Baby" },
  { level: 10, name: "Kid" },
  { level: 20, name: "Adult" },
  { level: 35, name: "Legend" },
];

export function petStage(level: number) {
  let s = 0;
  STAGES.forEach((st, i) => {
    if (level >= st.level) s = i;
  });
  return s;
}

// ---------------------------------------------------------------------------
// Cosmetics: hats, face accessories and camp scenes.
// unlock: 0 = free, a number = reached at that level, "chest" = only from loot chests.
// (Chests can also drop level-locked ones early.)
// ---------------------------------------------------------------------------
export type Slot = "hat" | "face" | "scene";
export interface Cosmetic {
  id: string;
  slot: Slot;
  name: string;
  unlock: number | "chest";
}

export const COSMETICS: Cosmetic[] = [
  { id: "beanie", slot: "hat", name: "Cozy Beanie", unlock: 0 },
  { id: "headband", slot: "hat", name: "Sport Headband", unlock: 5 },
  { id: "party", slot: "hat", name: "Party Hat", unlock: 10 },
  { id: "flower", slot: "hat", name: "Flower Clip", unlock: 15 },
  { id: "wizard", slot: "hat", name: "Wizard Hat", unlock: 25 },
  { id: "crown", slot: "hat", name: "Royal Crown", unlock: 40 },
  { id: "bow", slot: "hat", name: "Big Bow", unlock: "chest" },
  { id: "cap", slot: "hat", name: "Coach Cap", unlock: "chest" },
  { id: "glasses", slot: "face", name: "Round Glasses", unlock: 0 },
  { id: "sunnies", slot: "face", name: "Cool Shades", unlock: "chest" },
  { id: "meadow", slot: "scene", name: "Meadow Camp", unlock: 0 },
  { id: "beach", slot: "scene", name: "Sunny Beach", unlock: 0 },
  { id: "city", slot: "scene", name: "City Lights", unlock: 8 },
  { id: "sakura", slot: "scene", name: "Sakura Park", unlock: 12 },
  { id: "space", slot: "scene", name: "Moon Base", unlock: 20 },
];

/** Kept for older code paths: the hat slot only. */
export const HATS = COSMETICS.filter((c) => c.slot === "hat");

/** Cosmetics that become available exactly at a level (for the level-up announcement). */
export const LEVEL_HATS: Record<number, string> = Object.fromEntries(
  COSMETICS.filter((c) => typeof c.unlock === "number" && c.unlock > 0).map((c) => [c.unlock as number, c.id]),
);

export function isUnlocked(id: string, owned: string[], level: number) {
  const c = COSMETICS.find((x) => x.id === id);
  if (!c) return false;
  return c.unlock === 0 || owned.includes(id) || (typeof c.unlock === "number" && level >= c.unlock);
}

export const SPECIES = [
  { id: "cat", name: "Neko" },
  { id: "blob", name: "Mochi blob" },
  { id: "bunny", name: "Usagi" },
  { id: "bear", name: "Kuma" },
  { id: "dino", name: "Dino" },
] as const;

export const EYES = [
  { id: "dot", name: "Classic" },
  { id: "big", name: "Big & shiny" },
  { id: "sparkle", name: "Sparkly" },
] as const;

export const RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];
