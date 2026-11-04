// Hand-drawn pixel pets (pure data — used by the UI and by scripts/make-icons.mjs).
// Every species has an egg and 4 evolved forms. A form is drawn as its left half (mirrored),
// plus one-sided bits like tails; the face, hats and accessories are drawn on top so every
// mood, eye style and cosmetic fits every form.

export const PET_COLORS: Record<string, { b: string; l: string; d: string; name: string }> = {
  pink: { b: "#ffb3d1", l: "#ffe0ee", d: "#f07aa9", name: "Strawberry" },
  mint: { b: "#9ff0cf", l: "#dcfff0", d: "#53c99b", name: "Matcha" },
  sky: { b: "#a8d8ff", l: "#e2f2ff", d: "#62a9ea", name: "Soda" },
  lemon: { b: "#ffe58a", l: "#fff6cc", d: "#efbd45", name: "Custard" },
  lavender: { b: "#cdb8ff", l: "#ece4ff", d: "#9a7ff0", name: "Taro" },
  peach: { b: "#ffc6a8", l: "#ffe6d9", d: "#f0956a", name: "Peach" },
  cloud: { b: "#f1f0f7", l: "#ffffff", d: "#c4c1d8", name: "Mochi" },
  cocoa: { b: "#c9a27e", l: "#ead6c2", d: "#9c7350", name: "Cocoa" },
  ink: { b: "#6e6290", l: "#9a8fbd", d: "#4a3f6b", name: "Midnight" },
  ash: { b: "#bdb7d1", l: "#e6e3f0", d: "#8e87a8", name: "Ash" },
  shiba: { b: "#f4a75c", l: "#ffd3a1", d: "#d27a32", name: "Shiba" },
  rust: { b: "#e0703f", l: "#f7a77c", d: "#b04a25", name: "Ember" },
  navy: { b: "#56679e", l: "#8495c9", d: "#3a4676", name: "Navy" },
};

const HEX = /^#[0-9a-f]{6}$/i;

function mix(hex: string, to: string, t: number) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Body / light / dark shades for a preset name or any "#rrggbb" colour. */
export function petPalette(color: string) {
  if (PET_COLORS[color]) return PET_COLORS[color];
  if (HEX.test(color)) return { b: color, l: mix(color, "#ffffff", 0.6), d: mix(color, "#2d2142", 0.28), name: "Custom" };
  return PET_COLORS.pink;
}

export const isPetColor = (c: string) => !!PET_COLORS[c] || HEX.test(c);

export type Mood = "happy" | "content" | "meh" | "sad" | "fainted" | "sleep" | "blink";

export interface Look {
  species?: string;
  eyes?: string;
  face?: string | null;
}

/**
 * One drawing. `art` rows are the LEFT half (w/2 characters) and get mirrored; in them
 * "L" is light on the left and body colour on the right, "D" body colour on the left and dark on the right.
 * `over` paints one-sided bits on the full canvas ("." = leave, "_" = erase).
 * Letters: o outline · b/l/d body colour · w white · c cream · p pink · g/G gold · y yellow · K dark fur ·
 * R red · f/F flame · e egg spots · n leaf.
 */
interface Form {
  w: number;
  art: string[];
  over?: [number, number, string[]][];
  /** left eye's left column and top row (the right eye is mirrored) */
  eye: [number, number];
  /** mouth row (the nose, if any, is drawn in the art just above it) */
  mouth: number;
  /** the row the top of the head is on (hats sit here) */
  hat: number;
  /** penguins: the beak shows the mood instead of a mouth */
  beak?: boolean;
}

// The egg: the same shell for everyone, with each species' own markings.
const EGG: Form = {
  w: 14,
  art: [
    "....ooo",
    "...oLLb",
    "..obLbb",
    "..oLbbb",
    ".obbbbb",
    ".oLbbbb",
    ".obbbbb",
    "obbbbbb",
    "obbbbbb",
    "obbbbbb",
    "obbbbbb",
    "obbbbbb",
    "odbbbbb",
    ".odbbbb",
    "..odddd",
    "...oooo",
  ],
  eye: [3, 8],
  mouth: 11,
  hat: 1,
};

const EGG_MARKS: Record<string, [number, number, string[]][]> = {
  cat: [[2, 4, ["e.....e", ".......", "......ee", "e"]]],
  bear: [[1, 12, ["eeeeeeeeeeee", ".eeeeeeeeee"]]],
  shiba: [[4, 3, ["e....e", "ee..ee", ".eeee"]]],
  penguin: [[2, 12, ["eeeeeeeeee", ".eeeeeeee"]], [5, 2, ["eeee"]]],
  redpanda: [[2, 5, ["eeeeeeeeee"]], [1, 12, ["eeeeeeeeeeee"]]],
  blob: [[3, 4, ["e......e", "........", ".e....e"]]],
  bunny: [[3, 4, [".e.e", "eeeee", ".eee", "..e"]]],
  dino: [[2, 5, ["e.e.e.e.e.e"]], [1, 12, [".e.e.e.e.e.e"]]],
};

const CAT: Form[] = [
  {
    w: 20,
    art: [
      "....o.....",
      "....oo....",
      "....opo...",
      "....oppooo",
      "...obbbbbb",
      "...obLLbbb",
      "...obLbbbb",
      "...obbbbbb",
      "...obbbbbb",
      "...obbbbbp",
      "...obbbbbb",
      "....obbbbb",
      "....odbbbb",
      "....odwwdb",
      ".....ooooo",
    ],
    over: [[16, 6, ["..oo", ".obo", ".obo", ".obo", ".obo", "obo.", "oo.."]]],
    eye: [6, 7],
    mouth: 10,
    hat: 3,
  },
  {
    w: 22,
    art: [
      "....o......",
      "....oo.....",
      "....opo....",
      "....oppo...",
      "....opppooo",
      "...obbbbbbd",
      "...obLLbdbb",
      "...obLbbbbb",
      "...obbbbbbb",
      "...obbbbbbb",
      "...obbbbbbp",
      "...obbbbbbb",
      "....obbbbbb",
      ".....oobbbb",
      "......obwww",
      "......obbww",
      "......odbwo",
      "......odwwo",
      ".......oooo",
    ],
    over: [[16, 11, ["...oo.", "..obbo", "..obo.", ".obo..", ".obo..", "obo...", "oo...."]]],
    eye: [6, 8],
    mouth: 11,
    hat: 4,
  },
  {
    w: 26,
    art: [
      ".....o.......",
      ".....oo......",
      ".....obo.....",
      ".....opbo....",
      ".....oppbo...",
      ".....obppbooo",
      "....obbbbbbbd",
      "....obLLbbdbd",
      "....obLbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "..obbbbbbbbbp",
      "...obbbbbbbbb",
      "....obbbbbbbb",
      ".....oRRRRRRy",
      "......obbwwwG",
      "......odbwwww",
      "......obbbwww",
      "......odbbbbo",
      "......obbbbbo",
      "......odbwwwo",
      ".......oooooo",
    ],
    over: [[20, 13, ["....oo", "...obo", "...odo", "..obo.", "..odo.", ".obo..", ".odo..", "obo...", "oo...."]]],
    eye: [7, 10],
    mouth: 13,
    hat: 5,
  },
  {
    w: 34,
    art: [
      ".......o.........",
      ".......oo........",
      ".......ogo.......",
      ".......obbo......",
      ".......opbbo.....",
      ".......oppbbo....",
      ".......obppbboooo",
      "......obbbbbbbbbb",
      "......obLLbbbbbby",
      "......obLbbbbbbyy",
      ".....obbbbbbbbbby",
      ".....obbbbbbbbbbb",
      ".....obbbbbbbbbbb",
      ".....obbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      ".F..obbbbbbbbbbbp",
      "FfF..obbbbbbbbbbb",
      "fff...obbbbbbbbbb",
      "ofo.....ogggggggR",
      "obo......obwwwwww",
      "obo......obbwwwww",
      "obbo.....obbwwwww",
      ".obbo....odbbwwww",
      "..obbooo.odbbbbbo",
      "...obbbboobbbbbbo",
      "....oooo.odwwwwbo",
      ".........oooooooo",
    ],
    eye: [10, 12],
    mouth: 16,
    hat: 6,
  },
];

const SHIBA: Form[] = [
  {
    w: 20,
    art: [
      "....oo....",
      "...obbo...",
      "...occbooo",
      "..obbbbbbb",
      "..obLLcbbb",
      "..obLbbbbb",
      "..obbbbbbb",
      "..obbbbbbb",
      "..occcbbck",
      "..occccccc",
      "...occcccc",
      "....obbccc",
      "....obbcco",
      "....odccbo",
      ".....ooooo",
    ],
    over: [[15, 10, ["..ooo", ".obco", "oobbo", "ooo.."]]],
    eye: [5, 6],
    mouth: 9,
    hat: 2,
  },
  {
    w: 22,
    art: [
      "....oo.....",
      "...obbo....",
      "...obcbo...",
      "...occcbooo",
      "..obbbbbbbb",
      "..obLLbbbbb",
      "..obLbbcbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..occcbbbck",
      "..occcccccc",
      "...occccccc",
      "....oobbccc",
      "......obccc",
      "......obccc",
      "......obcco",
      "......odcco",
      ".......oooo",
    ],
    over: [[16, 12, ["...ooo", "..obco", ".obbbo", "oobbo.", "oooo.."]]],
    eye: [6, 8],
    mouth: 11,
    hat: 3,
  },
  {
    w: 26,
    art: [
      ".....oo......",
      "....obbo.....",
      "....obcbo....",
      "....occcbo...",
      "....occccbooo",
      "...obbbbbbbbb",
      "...obLLbbbbbb",
      "...obLbbcbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "..occccbbbbck",
      "..occcccccccc",
      "...occccccccc",
      "....occcccccc",
      ".....oRRRRRRR",
      "......oRRwRRR",
      "......obbRRRR",
      "......obbcRRR",
      "......odbccRR",
      "......odbccco",
      "......obcccbo",
      ".......oooooo",
    ],
    over: [[20, 13, ["...ooo", "..obco", ".obbbo", "obbcbo", "obbbo.", ".ooo.."]]],
    eye: [7, 9],
    mouth: 12,
    hat: 4,
  },
  {
    w: 34,
    art: [
      ".......oo........",
      "......obbo.......",
      "......obcbo......",
      "......occcbo.....",
      "......occccbo....",
      "......oRcccbbo...",
      "......occcccbbooo",
      ".....obbbbbbbbbbb",
      ".....obLLbbbbbbbR",
      ".....obLbbbbbbbRR",
      "....obbbbbbcbbbbR",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "...obRRbbbbbbbbbb",
      "...occcccbbbbbcck",
      "...occccccccccccc",
      "....occcccccccccc",
      ".....oogRgRgRgRgR",
      ".........obcccccc",
      ".........obbccccc",
      ".........obRbcccc",
      ".........odbbcccc",
      ".........odbbbbbo",
      ".........obRbbbbo",
      ".........odccccbo",
      "..........ooooooo",
    ],
    over: [[25, 16, ["......FF.", ".....FfFF", ".....offo", "....obbbo", "...obbcbo", "..obbcbbo", ".obbcbbo.", "obbbbbo..", "ooooo...."]]],
    eye: [10, 12],
    mouth: 16,
    hat: 6,
  },
];

const BEAR: Form[] = [
  {
    w: 20,
    art: [
      "..oooo....",
      ".obbbbo...",
      ".obccbbooo",
      ".obcbbbbbb",
      "..obLLbbbb",
      "..obLbbbbb",
      "..obbbbbbb",
      "..obbbbbbb",
      "..obbbbbcc",
      "..obbbbcck",
      "..obbbbccc",
      "...obbbbcc",
      "....obbbbb",
      "....odbbcc",
      ".....ooooo",
    ],
    eye: [5, 6],
    mouth: 10,
    hat: 2,
  },
  {
    w: 22,
    art: [
      "..oooo.....",
      ".obbbbo....",
      ".obccbboooo",
      ".obccbbbbbb",
      "..obbbbbbbb",
      "..obLLbbbbb",
      "..obLbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbcc",
      "..obbbbbcck",
      "...obbbbccc",
      "....obbbbcc",
      ".....oobbbb",
      "......obbcc",
      "......obccc",
      "......obcco",
      "......odbbo",
      ".......oooo",
    ],
    eye: [6, 8],
    mouth: 12,
    hat: 2,
  },
  {
    w: 26,
    art: [
      "...ooooo.....",
      "..obbbbbo....",
      ".obbcccbbo...",
      ".obcccbbbbooo",
      ".obbccbbbbbbb",
      "..obbbbbbbbbb",
      "...obLLbbbbbb",
      "...obLbbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbcc",
      "..obbbbbbbcck",
      "..obbbbbbcccc",
      "...obbbbbbccc",
      "....obbbbbbbb",
      ".....oobbbbbb",
      "......obcbbbb",
      "......obbcbbb",
      "......obbbccc",
      "......odbbbbo",
      "......odcbbbo",
      ".......oooooo",
    ],
    eye: [7, 9],
    mouth: 13,
    hat: 3,
  },
  {
    w: 34,
    art: [
      "...oooooo........",
      "..obbbbbbo.......",
      ".obbccccbbo......",
      ".obcccccbbo......",
      ".obccccbbbboooooo",
      "..obccbbbbbbbbbbb",
      "...obbbbbbbbbbbbb",
      "....obLLbbbbbbbbb",
      "....obLbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbcc",
      "...obbbbbbbbbccck",
      "...obbbbbbbbccccc",
      "....obbbbbbbbcccc",
      ".....obbbbbbbbbbb",
      "....owwwKwwwwKwww",
      "...owwKwwwwwKwwww",
      "......oRRobybbbbb",
      ".....oRRRobbybbbb",
      "....oRRRRobbbyyyy",
      "...oRRRRRobbbbbbb",
      "..oRRRRRRodbbbbbo",
      "..oggggggodcccbbo",
      "...oooooooooooooo",
    ],
    eye: [10, 11],
    mouth: 15,
    hat: 4,
  },
];

const PENGUIN: Form[] = [
  {
    w: 20,
    art: [
      ".........o",
      ".....ooooo",
      "...oobbbbb",
      "..obLLbbbb",
      ".obLbbbbbb",
      ".obbwwwbbb",
      ".obwwwwwbb",
      ".obwwwwwwb",
      "obbwwwwwwg",
      "obbwwwwwwG",
      "obbbwwwwww",
      ".obbwwwwww",
      ".obbwwwwww",
      "..obbbwwww",
      "...oggoooo",
    ],
    eye: [5, 6],
    mouth: 10,
    hat: 1,
    beak: true,
  },
  {
    w: 22,
    art: [
      ".......oooo",
      ".....oobbbb",
      "....obLLbbb",
      "...obLbbbbb",
      "...obbbbbbb",
      "...obwwwbbb",
      "...owwwwwbb",
      "...owwwwwwb",
      "...owwwwwwg",
      "..obwwwwwwG",
      ".obbwwwwwww",
      "obbbwwwwwww",
      "obbbwwwwwww",
      ".obbwwwwwww",
      ".obbwwwwwww",
      "..obbwwwwww",
      "...obbwwwww",
      "...oggooooo",
      "...ogggo...",
    ],
    eye: [6, 6],
    mouth: 10,
    hat: 0,
    beak: true,
  },
  {
    w: 26,
    art: [
      "........ooooo",
      "......oobbbbb",
      ".....obLLbbbb",
      "....obLbbbbbb",
      "....obbbbbbbb",
      "....obbwwwbbb",
      "....obwwwwwbb",
      "....owwwwwwwb",
      "....owwwwwwwb",
      "....owwwwwwwg",
      "....owwwwwwwG",
      "...oRRRRRRRRR",
      "..oRRRRRRRRRR",
      "..obbbwwwwwww",
      ".obbbwwwwwwww",
      "obbbbwwwwwwww",
      "obbbbwwwwwwww",
      ".obbbwwwwwwww",
      ".obbbwwwwwwww",
      "..obbbwwwwwww",
      "...obbbwwwwww",
      "....oggoooooo",
      "....oggggo...",
    ],
    over: [[6, 13, ["oRo", "oRo", "oRRo", ".oo"]]],
    eye: [7, 7],
    mouth: 11,
    hat: 0,
    beak: true,
  },
  {
    w: 34,
    art: [
      "..........y.y.y..",
      "..........ygygy.o",
      "...........ooooob",
      ".........oobbbbbb",
      "........obLLbbbbb",
      ".......obLbbbbbbb",
      ".......obbbbbbbbb",
      ".......obbbwwwbbb",
      ".......ogbwwwwwbb",
      ".......oggwwwwwwb",
      ".......oggwwwwwwb",
      ".......ogwwwwwwwg",
      ".......owwwwwwwwG",
      "......oVyyyyyyyyy",
      ".....oVVgwwwwwwww",
      "....oVVbbwwwwwwww",
      "...oVVbbbwwwwwwww",
      "...oVbbbbwwwwwwww",
      "...oVbbbbwwwwwwww",
      "...oVbbbbwwwwwwww",
      "...oVobbbwwwwwwww",
      "...oVobbbwwwwwwww",
      "...oVVobbbwwwwwww",
      "...oVVVobbbwwwwww",
      "...ooooooggoooooo",
      "........oggggo...",
    ],
    eye: [10, 9],
    mouth: 13,
    hat: 2,
    beak: true,
  },
];

const REDPANDA: Form[] = [
  {
    w: 20,
    art: [
      "...oooo...",
      "..owwwwo..",
      "..owKKwooo",
      "..obbbbbbb",
      "..obLLwbbb",
      "..obLbbbbb",
      "..obbbbbbb",
      "..obbbbbbb",
      "..owwdbbww",
      "..owwwdwwk",
      "..owwwwwww",
      "...owwwwww",
      "....oKKbbb",
      "....oKKKKo",
      ".....ooooo",
    ],
    over: [[15, 9, ["..ooo", ".obbo", "oodbo", "obbbo", "oooo."]]],
    eye: [5, 6],
    mouth: 10,
    hat: 3,
  },
  {
    w: 22,
    art: [
      "...ooooo...",
      "..owwwwwo..",
      "..owKKKwooo",
      "..obbbbbbbb",
      "..obLLbbbbb",
      "..obLbbwbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..owwwdbbww",
      "..owwwwdwwk",
      "..owwwwwwww",
      "...owwwwwww",
      "....oobbbbb",
      "......oKbbb",
      "......oKKbb",
      "......oKKKo",
      "......oKKKo",
      ".......oooo",
    ],
    over: [[16, 10, ["...ooo", "..obbo", ".oddo.", ".obbo.", "oddo..", "obbo..", "ooo..."]]],
    eye: [6, 7],
    mouth: 11,
    hat: 3,
  },
  {
    w: 26,
    art: [
      "....ooooo....",
      "...owwwwwo...",
      "...owKKKwwooo",
      "...obbbbbbbbb",
      "...obLLbbbbbb",
      "...obLbbbwbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "...obbbbbbbbb",
      "..owwwdbbbbww",
      "..owwwwdbwwwk",
      "..owwwwwwwwww",
      "...owwwwwwwww",
      "....owwwwwwww",
      ".ooooobbbbbbb",
      "oKKKKoKbbbbbb",
      "oKKKKKKbbbbbb",
      ".oooooKKbbbbb",
      "......oKKbbbb",
      "......oKKKKKo",
      "......oKKKKKo",
      "......oKKKKKo",
      ".......oooooo",
    ],
    over: [[19, 11, ["....oo.", "...obbo", "...oddo", "..obbo.", "..oddo.", ".obbo..", ".oddo..", "obbo...", "oddo...", "ooo...."]]],
    eye: [7, 7],
    mouth: 11,
    hat: 2,
  },
  {
    w: 34,
    art: [
      "......FF.........",
      ".....FffF........",
      "......oooooo.....",
      ".....owwwwwwo....",
      ".....owKKKKwwoooo",
      "....obbbbbbbbbbbb",
      "....obLLbbbbbbbbb",
      "....obLbbbbwbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "....obbbbbbbbbbbb",
      "...owwwwdbbbbbbww",
      "...owwwwwdbbbwwwk",
      "...owwwwwwwwwwwww",
      "....owwwwwwwwwwww",
      ".....owwwwwwwwwww",
      "..ooooobbbbbbbbbb",
      ".oKKKKKoKbbbbbbbb",
      "oKKKKKKKKbbbbbbbb",
      ".ooooooKKKbbbbbbb",
      "........oKKbbbbbb",
      "........oKKKbbbbb",
      "........oKKKKKKKo",
      "........oKKKKKKKo",
      "........oKKKKKKKo",
      ".........oooooooo",
    ],
    over: [[25, 9, ["......FF.", ".....FfF.", ".....offo", "....obbo.", "....oddo.", "...obbo..", "...oddo..", "..obbo...", "..oddo...", ".obbo....", ".oddo....", "obbo.....", "ooo......"]]],
    eye: [10, 9],
    mouth: 13,
    hat: 4,
  },
];

const BLOB: Form[] = [
  {
    w: 20,
    art: [
      "..........",
      "..........",
      "..........",
      "..........",
      "......oooo",
      "....oobbbb",
      "...obLLbbb",
      "..obLbbbbb",
      "..obbbbbbb",
      ".obbbbbbbb",
      ".obbbbbbbb",
      ".obbbbbbbb",
      ".obbbbbbbb",
      ".odbbbbbbb",
      "..oddddddd",
      "...ooooooo",
    ],
    over: [[9, 0, ["..oo.", ".onno", "onno.", ".o..."]]],
    eye: [5, 9],
    mouth: 12,
    hat: 4,
  },
  {
    w: 22,
    art: [
      "...........",
      "...........",
      "...........",
      "...........",
      "......ooooo",
      "....oobbbbb",
      "...obLLbbbb",
      "..obLbbbbbb",
      "..obbbbbbbb",
      ".obbbbbbbbb",
      ".obbbbbbbbb",
      ".obbbbbbbbb",
      "obbbbbbbbbb",
      "obbbbbbbbbb",
      "obbbbbbbbbb",
      "odbbbbbbbbb",
      ".odbbbbbbbb",
      "..odddddddd",
      "...oooooooo",
    ],
    over: [[6, 0, [".oo....oo.", "onno..onno", ".onnoonno.", "..oooooo.."]]],
    eye: [6, 10],
    mouth: 13,
    hat: 4,
  },
  {
    w: 26,
    art: [
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      ".......oooooo",
      ".....oobbbbbb",
      "....obLLbbbbb",
      "...obLbbbbbbb",
      "..obbbbbbbbbb",
      "..obbbbbbbbbb",
      ".obbbbbbbbbbb",
      ".obbbbbbbbbbb",
      "obbbbbbbbbbbb",
      "obbbbbbbbbbbb",
      "obbbbbbbbbbbb",
      "obbbbbbbbbbbb",
      "odbbbbbbbbbbb",
      ".odbbbbbbbbbb",
      "..odddddddddd",
      "...oooooooooo",
    ],
    over: [[9, 0, ["...oo...", ".onnnno.", "onnRRnno", "oRRyRRRo", "oRRRRyRo", ".oRyRRo.", "..oRRo.."]]],
    eye: [7, 12],
    mouth: 15,
    hat: 6,
  },
  {
    w: 34,
    art: [
      "..............ooo",
      "............ooggg",
      "...........ogyggg",
      "...........oggggg",
      "...........oGgggg",
      "............oGGgg",
      ".........oooooooo",
      ".......oobbbbbbbb",
      "......obLLbbbbbbb",
      "......obLbbbbbbbb",
      ".....obbbbbbbbbbb",
      ".....odbbbbbbbbbb",
      "...oooooooooooooo",
      "..obbbLLbbbbbbbbb",
      ".obLLbbbbbbbbbbbb",
      ".obLbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "obbbbbbbbbbbbbbbb",
      "odbbbbbbbbbbbbbbb",
      ".odbbbbbbbbbbbbbb",
      "..odddddddddddddd",
      "...oooooooooooooo",
    ],
    over: [[20, 0, ["ooo.", "onno", ".oo."]]],
    eye: [10, 17],
    mouth: 20,
    hat: 0,
  },
];

const BUNNY: Form[] = [
  {
    w: 20,
    art: [
      "...oo.....",
      "..obbo....",
      "..obpo....",
      "..obpo....",
      "..obpo....",
      "..obpo....",
      ".obbpboooo",
      "obbbbbbbbb",
      "obLLbbbbbb",
      "obLbbbbbbb",
      "obbbbbbbbb",
      "obbbbbbbbb",
      "obbbbbbbbp",
      "obbbbbbbbb",
      ".obbbbbbbb",
      "..odbbbbbb",
      "...ooooooo",
    ],
    eye: [4, 10],
    mouth: 13,
    hat: 6,
  },
  {
    w: 22,
    art: [
      "...oo......",
      "..obbo.....",
      "..obpo.....",
      "..obpo.....",
      "..obpo.....",
      "..obpo.....",
      "..obpbooooo",
      ".obbbbbbbbb",
      ".obLLbbbbbb",
      ".obLbbbbbbb",
      ".obbbbbbbbb",
      ".obbbbbbbbb",
      ".obbbbbbbbp",
      ".obbbbbbbbb",
      "..obbbbbbbb",
      "...oobbbbbb",
      ".....obbwww",
      ".....obbwww",
      ".....obbwwo",
      ".....odwwbo",
      "......ooooo",
    ],
    over: [[17, 15, [".oo.", "owwo", "owwo", ".oo."]]],
    eye: [5, 10],
    mouth: 13,
    hat: 6,
  },
  {
    w: 26,
    art: [
      "....oo.......",
      "...obbo......",
      "...obpbo.....",
      "...obppo.....",
      "...obppo.....",
      "...obppo.....",
      "...obppbo....",
      "...obpbbooooo",
      "..obbbbbbbbbb",
      "..obLLbbbbbbb",
      ".obLbbbbbbbbb",
      ".obbbbbbbbbbb",
      ".obbbbbbbbbbb",
      ".obbbbbbbbbbp",
      ".obbbbbbbbbbb",
      "..obbbbbbbbbb",
      "...obbbbbbbbb",
      "....oobbbwwww",
      "......obwwwww",
      "......obwwwww",
      "......obbwwwo",
      "......odwwwbo",
      ".......oooooo",
    ],
    over: [
      [15, 0, ["________", "________", "________", "________", "________", "...ooooo", "..obbbbbo", ".obbpppbbo", "...oobppbo", ".....obbo", "......oo"]],
    ],
    eye: [7, 11],
    mouth: 14,
    hat: 7,
  },
  {
    w: 34,
    art: [
      ".....oo..........",
      "....oggo.........",
      "....obbo.........",
      "....obpbo........",
      "....obppo........",
      "....obppo........",
      "....obppo........",
      "....obppbo.......",
      "....obpppo.......",
      "....obbppbo......",
      "...obbbbbbboooooo",
      "..obbbbbbbbbbbbbb",
      "..obLLbbbbbbbbbbb",
      ".obLbbbbbbbbbbbbb",
      ".obbbbbbbbbbbbbbb",
      ".obbbbbbbbbbbbbbb",
      ".obbbbbbbbbbbbbbb",
      ".obbbbbbbbbbbbbbp",
      ".obbbbbbbbbbbbbbb",
      "..obbbbbbbbbbbbbb",
      "...obbbbbbbbbbbbb",
      "....oobbbbbwwwwww",
      "......obbbwwwwwww",
      "......obbwwwwwwww",
      "......obbwwwwwwww",
      "......odbbwwwwwwo",
      "......odbwwwwwwbo",
      ".......oooooooooo",
    ],
    over: [
      [15, 11, [".yy.", "y...", ".yy."]],
      [0, 13, [".y.", "yyy", ".y."]],
      [30, 4, [".y.", "yyy", ".y."]],
      [31, 20, ["y"]],
      [2, 6, ["y"]],
    ],
    eye: [10, 15],
    mouth: 18,
    hat: 10,
  },
];

const DINO: Form[] = [
  {
    w: 20,
    art: [
      ".........o",
      "......o.od",
      ".....odood",
      "...ooooooo",
      "..obbbbbbb",
      "..obLLbbbb",
      ".obLbbbbbb",
      ".obbbbbbbb",
      ".obbbbbbbb",
      ".obbbbbbbb",
      ".obbbbbbbb",
      ".obbbccccc",
      "..obcccccc",
      "..odbbcccc",
      "...ooooooo",
    ],
    over: [[17, 9, [".oo", "obo", "obo", "oo."]]],
    eye: [5, 7],
    mouth: 10,
    hat: 3,
  },
  {
    w: 22,
    art: [
      "..........o",
      ".......o.od",
      "......odood",
      "....ooooooo",
      "...obbbbbbb",
      "..obLLbbbbb",
      "..obLbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "..obbbbbbbb",
      "...obbbbbbb",
      "....oobbbcc",
      "......obccc",
      "......obccc",
      "......obcco",
      "......odbbo",
      ".......oooo",
    ],
    over: [[16, 13, ["....o.", "oooodo", "bbbbbo", "bbbbo.", "oooo.."]]],
    eye: [6, 8],
    mouth: 11,
    hat: 3,
  },
  {
    w: 26,
    art: [
      "............o",
      ".........o.od",
      "........odood",
      ".....oooooooo",
      "....obbbbbbbb",
      "...obLLbbbbbb",
      "...obLbbbbbbb",
      "..obbbbbbbbbb",
      "..obbbbbbbbbb",
      "..obbbbbbbbbb",
      "..obbbbbbbbbb",
      "..obbbbbbbbbb",
      "..obbbbbbbbbb",
      "...obbbbbbbbb",
      "....obbbbbbbb",
      ".....oobbbbcc",
      "......obbbccc",
      "......obbbddd",
      "......obbcccc",
      "......obbdddd",
      "......odbbcco",
      "......odbbbbo",
      ".......oooooo",
    ],
    over: [[20, 14, ["....o.", "...odo", "oooobo", "bbbbbo", "bbbbo.", "bbbo..", "ooo..."]]],
    eye: [7, 8],
    mouth: 12,
    hat: 3,
  },
  {
    w: 34,
    art: [
      ".................",
      "....oo..........o",
      "....oco........od",
      "....occo...o..odd",
      ".....occo.odo.odd",
      "......ooooooooooo",
      ".....obbbbbbbbbbb",
      ".....obLLbbbbbbbb",
      "....obLbbbbbbbbbb",
      "o...obbbbbbbbbbbb",
      "oo..obbbbbbbbbbbb",
      "obo.obbbbbbbbbbbb",
      "obbo.obbbbbbbbbbb",
      "obbo.obbbbbbbbbbb",
      "obdo.obbbbbbbbbbb",
      "obbbo.obbbbbbbbbb",
      "obdbo.obbbbbbbbbb",
      "obbdbo.oobbbbcccc",
      "obbdbbo.obbbccccc",
      "obdbbbbbobbdddddd",
      ".obodbbbobbcccccc",
      "..o.obobobbdddddd",
      ".....o.oobbcccccc",
      "........odbbbbbbo",
      "........odbbbbbbo",
      ".........oooooooo",
    ],
    over: [[25, 17, ["....o....", "...odo...", "oooobo...", "bbbbbo...", "bbbbo....", "bbbo.....", "ooo......"]]],
    eye: [9, 11],
    mouth: 15,
    hat: 5,
  },
];

const FORMS: Record<string, Form[]> = {
  cat: CAT,
  shiba: SHIBA,
  bear: BEAR,
  penguin: PENGUIN,
  redpanda: REDPANDA,
  blob: BLOB,
  bunny: BUNNY,
  dino: DINO,
};

/** Rows that are the wrong length (for tests). */
export function artProblems(): string[] {
  const out: string[] = [];
  for (const [sp, forms] of Object.entries(FORMS))
    forms.forEach((f, i) =>
      f.art.forEach((r, y) => {
        if (r.length !== f.w / 2) out.push(`${sp} stage ${i + 1} row ${y}: ${r.length} chars, want ${f.w / 2}`);
      }),
    );
  return out;
}

const DEFAULT_SPECIES = "cat";
const formsOf = (species: string) => FORMS[species] ?? FORMS[DEFAULT_SPECIES];

/** The drawing for a species at an evolution stage (0 = egg). */
function formFor(stage: number, species: string): Form {
  const s = Math.max(0, Math.min(4, Math.round(stage)));
  return s === 0 ? { ...EGG, over: EGG_MARKS[species] ?? EGG_MARKS[DEFAULT_SPECIES] } : formsOf(species)[s - 1];
}

/** Width and height of the body (without a hat) for sizing. */
export function petSize(stage: number, species = DEFAULT_SPECIES) {
  const f = formFor(stage, species);
  return { w: f.w, h: f.art.length };
}

// pixels that may touch the edge without an outline (sparkles, flames)
const GLOW = new Set(["f", "F", "y"]);

function paint(f: Form): string[][] {
  const g = f.art.map((half) => {
    const row = Array<string>(f.w).fill(".");
    for (let i = 0; i < half.length && i < f.w / 2; i++) {
      const c = half[i];
      row[i] = c === "L" ? "l" : c === "D" ? "b" : c;
      row[f.w - 1 - i] = c === "L" ? "b" : c === "D" ? "d" : c;
    }
    return row;
  });
  for (const [x, y, rows] of f.over ?? [])
    rows.forEach((line, j) =>
      line.split("").forEach((c, i) => {
        if (c === "." || !g[y + j] || x + i >= f.w) return;
        g[y + j][x + i] = c === "_" ? "." : c;
      }),
    );
  // close the outline wherever a coloured pixel touches the air
  const air = (x: number, y: number) => y < 0 || y >= g.length || x < 0 || x >= f.w || g[y][x] === ".";
  const edge: [number, number][] = [];
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < f.w; x++) {
      const c = g[y][x];
      if (c === "." || c === "o" || GLOW.has(c)) continue;
      if (air(x - 1, y) || air(x + 1, y) || air(x, y - 1) || air(x, y + 1)) edge.push([x, y]);
    }
  for (const [x, y] of edge) g[y][x] = "o";
  return g;
}

export function buildPet(stage: number, mood: Mood, hat: string | null, look: Look = {}): string[] {
  const species = look.species ?? DEFAULT_SPECIES;
  const f = formFor(stage, species);
  // older saves had sunglasses in the hat slot
  const face = look.face ?? (hat === "sunnies" ? "sunnies" : null);
  if (hat === "sunnies") hat = null;
  const g = paint(f);
  const W = f.w;
  const cx = W / 2;
  const mirror = (x: number) => W - 1 - x;
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < g.length) g[y][x] = c;
  };
  const tint = (x: number, y: number, c: string) => {
    const cur = g[y]?.[x];
    if (cur && cur !== "." && cur !== "o") g[y][x] = c;
  };

  // ---- face ----
  const [Lx, ey] = f.eye;
  const Rx = mirror(Lx + 1); // right eye's left column
  const eyeBoth = (pix: [number, number][], c = "k") => {
    for (const [dx, dy] of pix) {
      put(Lx + dx, ey + dy, c);
      put(mirror(Lx + dx), ey + dy, c);
    }
  };
  const my = f.mouth;
  const mouth = (pix: [number, number, string][]) => {
    if (f.beak) {
      if (pix === HAPPY) {
        put(cx - 1, my, "r");
        put(cx, my, "r");
      }
      return;
    }
    pix.forEach(([dx, dy, c]) => put(cx + dx, my + dy, c));
  };
  const blush = () => {
    for (const x of [Lx - 2, Lx - 1]) {
      tint(x, ey + 2, "p");
      tint(mirror(x), ey + 2, "p");
    }
  };
  const tall = look.eyes === "big" || look.eyes === "sparkle";
  const openEyes = () => {
    if (tall) {
      eyeBoth([[0, -1], [1, -1], [0, 0], [1, 0], [0, 1], [1, 1]]);
      put(Lx, ey - 1, "w");
      put(Rx, ey - 1, "w");
      if (look.eyes === "sparkle") {
        put(Lx + 1, ey + 1, "w");
        put(Rx + 1, ey + 1, "w");
      }
    } else {
      eyeBoth([[0, 0], [1, 0], [0, 1], [1, 1]]);
      put(Lx, ey, "w");
      put(Rx, ey, "w");
    }
  };
  switch (mood) {
    case "happy":
      eyeBoth([[0, 0], [1, 0], [-1, 1], [2, 1]]);
      mouth(HAPPY);
      blush();
      break;
    case "content":
      openEyes();
      mouth(SMILE);
      blush();
      break;
    case "meh":
      openEyes();
      mouth([[-1, 0, "k"], [0, 0, "k"]]);
      break;
    case "sad":
      openEyes();
      put(Lx, ey + 2, "t");
      put(Lx, ey + 3, "t");
      mouth([[-1, 0, "k"], [0, 0, "k"], [-2, 1, "k"], [1, 1, "k"]]);
      break;
    case "fainted":
      eyeBoth([[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]);
      mouth([[-2, 0, "k"], [0, 0, "k"], [-1, 1, "k"], [1, 1, "k"]]);
      break;
    case "sleep":
    case "blink":
      eyeBoth([[-1, 0], [2, 0], [0, 1], [1, 1]]);
      if (mood === "sleep") mouth([[-1, 0, "k"], [0, 0, "k"]]);
      else mouth(SMILE);
      if (mood === "sleep") blush();
      break;
  }

  // ---- face accessory ----
  if (face === "sunnies") {
    const lens = (x0: number) => {
      for (let x = x0 - 1; x <= x0 + 2; x++) for (let y = ey - 1; y <= ey + 1; y++) put(x, y, "s");
      put(x0 - 1, ey - 1, "S");
    };
    lens(Lx);
    lens(Rx);
    for (let x = Lx + 3; x < Rx - 1; x++) put(x, ey - 1, "s");
  } else if (face === "glasses") {
    const y1 = ey - (tall ? 2 : 1);
    const y2 = ey + 2;
    const ring = (x0: number) => {
      for (let x = x0 - 1; x <= x0 + 2; x++) {
        put(x, y1, "o");
        put(x, y2, "o");
      }
      for (let y = y1; y <= y2; y++) {
        put(x0 - 1, y, "o");
        put(x0 + 2, y, "o");
      }
    };
    ring(Lx);
    ring(Rx);
    for (let x = Lx + 3; x < Rx - 1; x++) put(x, ey, "o");
  }

  // ---- hats ----
  if (hat === "headband") {
    const hb = ey - (tall ? 4 : 3);
    for (let x = 1; x < W - 1; x++) {
      tint(x, hb, "R");
      tint(x, hb + 1, x === cx - 1 || x === cx ? "w" : "R");
    }
    let right = 0;
    for (let x = W - 1; x >= 0; x--) if (g[hb]?.[x] && g[hb][x] !== ".") { right = x; break; }
    put(right + 1, hb, "R");
    put(right + 2, hb + 1, "R");
    put(right + 1, hb + 1, "o");
  }

  const rows = g.map((r) => r.join(""));
  const hatSprite = hat ? HAT_SPRITES[hat] : undefined;
  if (!hatSprite) return rows;
  const hw = Math.max(...hatSprite.grid.map((r) => r.length));
  const x0 = hatSprite.dx !== undefined ? cx + hatSprite.dx : cx - Math.floor(hw / 2);
  const y0 = f.hat - hatSprite.grid.length + (hatSprite.overlap ?? 2);
  const out = rows.map((r) => r.split(""));
  const extra = Math.max(0, -y0); // grow the canvas upward if the hat pokes out of the top
  for (let i = 0; i < extra; i++) out.unshift(Array(W).fill("."));
  hatSprite.grid.forEach((line, i) =>
    line.split("").forEach((c, j) => {
      if (c === ".") return;
      const yy = y0 + extra + i;
      const xx = x0 + j;
      if (yy >= 0 && xx >= 0 && xx < W) out[yy][xx] = c;
    }),
  );
  return out.map((r) => r.join(""));
}

const HAPPY: [number, number, string][] = [[-2, 0, "k"], [-1, 0, "r"], [0, 0, "r"], [1, 0, "k"], [-1, 1, "k"], [0, 1, "k"]];
const SMILE: [number, number, string][] = [[-2, 0, "k"], [1, 0, "k"], [-1, 1, "k"], [0, 1, "k"]];

const HAT_SPRITES: Record<string, { grid: string[]; overlap?: number; dx?: number }> = {
  party: {
    grid: ["...yy...", "...yy...", "...oo...", "..oPPo..", "..oPwo..", ".oPwPPo.", ".owPPwo.", "oPPwPPPo", "oooooooo"],
    overlap: 2,
  },
  crown: { grid: ["o..oo..o", "yo.yy.oy", "yyoyyoyy", "gggggggg", "gRgBBgRg", "oooooooo"], overlap: 2 },
  wizard: {
    grid: [
      "......oo....",
      ".....oVVo...",
      ".....oVVo...",
      "....oVVVVo..",
      "....oVyVVo..",
      "...oVVVVVVo.",
      "...oVVVVyVo.",
      "..oVVVVVVVVo",
      "oooooooooooo",
      "oVvVvVvVvVvo",
      "oooooooooooo",
    ],
    overlap: 3,
  },
  flower: { grid: ["..ooo..", ".owwwo.", "owwywwo", "owyyywo", "owwywwo", ".owwwo.", "..ooo.."], overlap: 4, dx: 3 },
  bow: { grid: ["oo.....oo", "oPPoooPPo", "oPwPoPwPo", "oPPoooPPo", "oo.....oo"], overlap: 3 },
  beanie: { grid: ["....yy....", "..oooooo..", ".oRRRRRRo.", "oRRwRRwRRo", "oooooooooo"], overlap: 2 },
  cap: { grid: ["..oooooo....", ".oBBBBBBo...", "oBBwBBBBBooo", "oooooooooooo"], overlap: 2 },
};
