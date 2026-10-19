// Procedural pixel pet (pure data — used by the UI and by scripts/make-icons.mjs).
// Body = geometry (5 evolution stages), species = ears/crest, plus eyes, face accessory and hat.

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

const N = 24;
const MID = 12;
const mirror = (x: number) => N - 1 - x;

interface Shape {
  cx: number;
  cy: number;
  rx: number;
  ryT: number;
  ryB: number;
  feet?: boolean;
  wings?: boolean;
  egg?: boolean;
  eyeY: number;
  gap: number;
}

const SHAPES: Shape[] = [
  { cx: MID, cy: 14.5, rx: 6.6, ryT: 8.6, ryB: 6.6, egg: true, eyeY: 14, gap: 2 },
  { cx: MID, cy: 16.5, rx: 7.2, ryT: 6.2, ryB: 5.2, eyeY: 16, gap: 2 },
  { cx: MID, cy: 15.5, rx: 8.4, ryT: 7.2, ryB: 5.8, eyeY: 15, gap: 2 },
  { cx: MID, cy: 14.5, rx: 9.6, ryT: 8.2, ryB: 6.4, feet: true, eyeY: 14, gap: 3 },
  { cx: MID, cy: 14.5, rx: 9.6, ryT: 8.2, ryB: 6.4, feet: true, wings: true, eyeY: 14, gap: 3 },
];

type Cell = string;
const grid2 = <T,>(v: T) => Array.from({ length: N }, () => Array<T>(N).fill(v));

export function buildPet(stage: number, mood: Mood, hat: string | null, look: Look = {}): string[] {
  const sh = SHAPES[Math.max(0, Math.min(4, stage))];
  const species = look.species ?? "cat";
  // older saves had sunglasses in the hat slot
  const face = look.face ?? (hat === "sunnies" ? "sunnies" : null);
  if (hat === "sunnies") hat = null;
  const g: Cell[][] = grid2(".");
  const body: boolean[][] = grid2(false);
  const norm = (x: number, y: number) => {
    const ry = y + 0.5 < sh.cy ? sh.ryT : sh.ryB;
    return [(x + 0.5 - sh.cx) / sh.rx, (y + 0.5 - sh.cy) / ry];
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const [nx, ny] = norm(x, y);
      body[y][x] = nx * nx + ny * ny <= 1;
    }
  let top = N;
  for (let y = 0; y < N; y++) if (body[y].some(Boolean)) { top = y; break; }
  let bottom = 0;
  for (let y = N - 1; y >= 0; y--) if (body[y].some(Boolean)) { bottom = y; break; }
  const inner: boolean[][] = grid2(false); // pink inner-ear pixels
  const set = (x: number, y: number, isInner = false) => {
    if (x >= 0 && x < N && y >= 0 && y < N) {
      body[y][x] = body[y][mirror(x)] = true;
      if (isInner) inner[y][x] = inner[y][mirror(x)] = true;
    }
  };

  // ---- species features (from the baby stage on) ----
  const small = stage === 1;
  if (stage >= 1) {
    const edge = (row: number) => body[row].indexOf(true);
    if (species === "cat") {
      const L = edge(top + 2) + 1;
      const rows = small ? 2 : 3;
      for (let i = 0; i < rows; i++) for (let j = 0; j < i + 2; j++) set(L + j, top - rows + 1 + i, i > 0 && j > 0 && j < i + 1);
    } else if (species === "bunny") {
      const L = edge(top + 1) + (small ? 0 : 1);
      const h = small ? 4 : 6;
      for (let i = 0; i < h; i++)
        for (let j = 0; j < 3; j++) {
          if (i === 0 && j !== 1) continue;
          set(L + j, top - h + 1 + i, j === 1 && i > 0);
        }
    } else if (species === "bear") {
      const L = edge(top + 1) - (small ? 0 : 1);
      const pat = small ? ["xx.", "xxx"] : [".xx.", "xxxx", "xxxx"];
      pat.forEach((row, i) =>
        row.split("").forEach((ch, j) => {
          if (ch === "x") set(L + j, top - pat.length + 1 + i, !small && i === 1 && (j === 1 || j === 2));
        }),
      );
    }
  }
  if (sh.feet) for (const dx of [-6, -5, -4]) set(MID + dx, bottom + 1);
  const wings: boolean[][] = grid2(false);
  if (sh.wings) {
    const left = Math.floor(sh.cx - sh.rx);
    const rows = [Math.round(sh.cy) - 3, Math.round(sh.cy) - 2, Math.round(sh.cy) - 1, Math.round(sh.cy)];
    rows.forEach((y, i) => {
      for (let k = 0; k <= 3 - i; k++) {
        const x = left - k;
        if (x >= 0) wings[y][x] = wings[y][mirror(x)] = true;
      }
    });
  }

  // ---- shading + outline ----
  const inAny = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N && (body[y][x] || wings[y][x]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!body[y][x] && !wings[y][x]) continue;
      const isEdge = !inAny(x - 1, y) || !inAny(x + 1, y) || !inAny(x, y - 1) || !inAny(x, y + 1);
      if (isEdge) g[y][x] = "o";
      else if (wings[y][x] && !body[y][x]) g[y][x] = "w";
      else if (inner[y][x]) g[y][x] = "p";
      else {
        const [nx, ny] = norm(x, y);
        if (ny > 0.6) g[y][x] = "d";
        else if (nx < -0.3 && nx > -0.72 && ny < -0.38 && ny > -0.82) g[y][x] = "l";
        else g[y][x] = "b";
      }
    }
  if (sh.wings)
    for (let y = 0; y < N; y++)
      for (let x = 1; x < N - 1; x++)
        if (wings[y][x] && !body[y][x] && (body[y][x + 1] || body[y][x - 1]) && g[y][x] === "w") g[y][x] = "o";
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c;
  };
  const sx = Math.round(sh.cx - sh.rx * 0.5);
  const sy = Math.round(sh.cy - sh.ryT * 0.55);
  if (g[sy]?.[sx] && g[sy][sx] !== "o") g[sy][sx] = "w";
  if (sh.egg)
    for (const [x, y] of [[8, 9], [9, 9], [15, 11], [14, 11], [15, 12], [10, 19], [9, 19], [16, 17]])
      if (g[y][x] !== "o" && g[y][x] !== "w") g[y][x] = "e";

  // overlay species bits that sit outside the outline
  if (stage >= 1 && species === "blob") {
    put(12, top - 1, "n");
    put(12, top - 2, "n");
    put(13, top - 2, "n");
    put(13, top - 3, "n");
    put(14, top - 3, "n");
  }
  if (stage >= 1 && species === "dino") {
    for (const c of small ? [10, 13] : [8, 11, 14]) {
      put(c, top - 2, "o");
      put(c - 1, top - 1, "o");
      put(c, top - 1, "d");
      put(c + 1, top - 1, "o");
    }
    let r = 0;
    for (let x = N - 1; x >= 0; x--) if (body[bottom - 2][x]) { r = x; break; }
    put(r + 1, bottom - 3, "o");
    put(r + 1, bottom - 2, "d");
    put(r + 2, bottom - 2, "o");
    put(r + 1, bottom - 1, "o");
  }

  // ---- face ----
  const ey = sh.eyeY;
  const Lx = MID - sh.gap - 2; // left eye's left column
  const Rx = mirror(Lx + 1); // right eye's left column
  const eyeBoth = (pix: [number, number][], c = "k") => {
    for (const [dx, dy] of pix) {
      put(Lx + dx, ey + dy, c);
      put(mirror(Lx + dx), ey + dy, c);
    }
  };
  const my = ey + (stage >= 3 ? 3 : 2);
  const mouth = (pix: [number, number, string][]) => pix.forEach(([x, y, c]) => put(x, my + y, c));
  const blush = () => {
    for (const x of [Lx - 2, Lx - 1]) {
      put(x, ey + 2, "p");
      put(mirror(x), ey + 2, "p");
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
      mouth([[10, 0, "k"], [11, 0, "r"], [12, 0, "r"], [13, 0, "k"], [11, 1, "k"], [12, 1, "k"]]);
      blush();
      break;
    case "content":
      openEyes();
      mouth([[10, 0, "k"], [13, 0, "k"], [11, 1, "k"], [12, 1, "k"]]);
      blush();
      break;
    case "meh":
      openEyes();
      mouth([[11, 0, "k"], [12, 0, "k"]]);
      break;
    case "sad":
      openEyes();
      put(Lx, ey + 2, "t");
      put(Lx, ey + 3, "t");
      mouth([[11, 0, "k"], [12, 0, "k"], [10, 1, "k"], [13, 1, "k"]]);
      break;
    case "fainted":
      eyeBoth([[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]);
      mouth([[10, 0, "k"], [12, 0, "k"], [11, 1, "k"], [13, 1, "k"]]);
      break;
    case "sleep":
    case "blink":
      eyeBoth([[-1, 0], [2, 0], [0, 1], [1, 1]]);
      if (mood === "sleep") mouth([[11, 0, "k"], [12, 0, "k"]]);
      else mouth([[10, 0, "k"], [13, 0, "k"], [11, 1, "k"], [12, 1, "k"]]);
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
    for (let x = 0; x < N; x++) {
      if (g[hb][x] !== "." && g[hb][x] !== "o") g[hb][x] = "R";
      if (g[hb + 1]?.[x] && g[hb + 1][x] !== "." && g[hb + 1][x] !== "o") g[hb + 1][x] = x === 11 || x === 12 ? "w" : "R";
    }
    let right = 0;
    for (let x = N - 1; x >= 0; x--) if (g[hb][x] !== ".") { right = x; break; }
    put(right + 1, hb, "R");
    put(right + 2, hb + 1, "R");
    put(right + 1, hb + 1, "o");
  }

  const rows = g.map((r) => r.join(""));
  const hatSprite = hat ? HAT_SPRITES[hat] : undefined;
  if (hatSprite) {
    const hw = Math.max(...hatSprite.grid.map((r) => r.length));
    const x0 = hatSprite.dx !== undefined ? MID + hatSprite.dx : MID - Math.floor(hw / 2);
    // hats sit on the head; bunny ears simply poke through
    const lift = stage >= 2 && hatSprite.earAware && species !== "bunny" ? 1 : 0;
    const y0 = top - hatSprite.grid.length + (hatSprite.overlap ?? 2) - lift;
    const out = rows.map((r) => r.split(""));
    const extra = Math.max(0, -y0); // grow canvas upward if the hat pokes out of the top
    for (let i = 0; i < extra; i++) out.unshift(Array(N).fill("."));
    hatSprite.grid.forEach((line, i) =>
      line.split("").forEach((c, j) => {
        if (c === ".") return;
        const yy = y0 + extra + i;
        const xx = x0 + j;
        if (yy >= 0 && xx >= 0 && xx < N) out[yy][xx] = c;
      }),
    );
    return out.map((r) => r.join(""));
  }
  return rows;
}

const HAT_SPRITES: Record<string, { grid: string[]; overlap?: number; dx?: number; earAware?: boolean }> = {
  party: {
    grid: ["...yy...", "...yy...", "...oo...", "..oPPo..", "..oPwo..", ".oPwPPo.", ".owPPwo.", "oPPwPPPo", "oooooooo"],
    overlap: 2,
  },
  crown: { grid: ["o..oo..o", "yo.yy.oy", "yyoyyoyy", "gggggggg", "gRgBBgRg", "oooooooo"], overlap: 2, earAware: true },
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
    earAware: true,
  },
  flower: { grid: ["..ooo..", ".owwwo.", "owwywwo", "owyyywo", "owwywwo", ".owwwo.", "..ooo.."], overlap: 4, dx: 3 },
  bow: { grid: ["oo.....oo", "oPPoooPPo", "oPwPoPwPo", "oPPoooPPo", "oo.....oo"], overlap: 3 },
  beanie: { grid: ["....yy....", "..oooooo..", ".oRRRRRRo.", "oRRwRRwRRo", "oooooooooo"], overlap: 2, earAware: true },
  cap: { grid: ["..oooooo....", ".oBBBBBBo...", "oBBwBBBBBooo", "oooooooooooo"], overlap: 2, earAware: true },
};
