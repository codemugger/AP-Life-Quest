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

/** Hats unlocked automatically when reaching a level (others drop from chests). */
export const LEVEL_HATS: Record<number, string> = {
  5: "headband",
  10: "party",
  15: "flower",
  25: "wizard",
  40: "crown",
};

export const HATS: { id: string; name: string }[] = [
  { id: "headband", name: "Sport Headband" },
  { id: "party", name: "Party Hat" },
  { id: "flower", name: "Flower Clip" },
  { id: "bow", name: "Big Bow" },
  { id: "sunnies", name: "Cool Shades" },
  { id: "wizard", name: "Wizard Hat" },
  { id: "crown", name: "Royal Crown" },
];

export const RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];
