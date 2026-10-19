// Procedural pixel pet (pure data — used by the UI and by scripts/make-icons.mjs).

export const PET_COLORS: Record<string, { b: string; l: string; d: string; name: string }> = {
  pink: { b: "#ffb3d1", l: "#ffe0ee", d: "#f07aa9", name: "Strawberry" },
  mint: { b: "#9ff0cf", l: "#dcfff0", d: "#53c99b", name: "Matcha" },
  sky: { b: "#a8d8ff", l: "#e2f2ff", d: "#62a9ea", name: "Soda" },
  lemon: { b: "#ffe58a", l: "#fff6cc", d: "#efbd45", name: "Custard" },
  lavender: { b: "#cdb8ff", l: "#ece4ff", d: "#9a7ff0", name: "Taro" },
  peach: { b: "#ffc6a8", l: "#ffe6d9", d: "#f0956a", name: "Peach" },
  cloud: { b: "#f1f0f7", l: "#ffffff", d: "#c4c1d8", name: "Mochi" },
};

export type Mood = "happy" | "content" | "meh" | "sad" | "fainted" | "sleep" | "blink";

const N = 24;
const MID = 12;
const mirror = (x: number) => N - 1 - x;

interface Shape {
  cx: number;
  cy: number;
  rx: number;
  ryT: number;
  ryB: number;
  ears?: boolean;
  feet?: boolean;
  wings?: boolean;
  egg?: boolean;
  eyeY: number;
  gap: number;
}

const SHAPES: Shape[] = [
  { cx: MID, cy: 14.5, rx: 6.6, ryT: 8.6, ryB: 6.6, egg: true, eyeY: 14, gap: 2 },
  { cx: MID, cy: 16.5, rx: 7.2, ryT: 6.2, ryB: 5.2, eyeY: 16, gap: 2 },
  { cx: MID, cy: 15.5, rx: 8.4, ryT: 7.2, ryB: 5.8, ears: true, eyeY: 15, gap: 2 },
  { cx: MID, cy: 14.5, rx: 9.6, ryT: 8.2, ryB: 6.4, ears: true, feet: true, eyeY: 14, gap: 3 },
  { cx: MID, cy: 14.5, rx: 9.6, ryT: 8.2, ryB: 6.4, ears: true, feet: true, wings: true, eyeY: 14, gap: 3 },
];

type Cell = string;

export function buildPet(stage: number, mood: Mood, hat: string | null): string[] {
  const sh = SHAPES[Math.max(0, Math.min(4, stage))];
  const g: Cell[][] = Array.from({ length: N }, () => Array(N).fill("."));
  const body: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
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
  const set = (x: number, y: number) => {
    if (x >= 0 && x < N && y >= 0 && y < N) {
      body[y][x] = true;
      body[y][mirror(x)] = true;
    }
  };
  const ear: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  if (sh.ears) {
    // anchor on the head's contour two rows below the top
    const L = body[top + 2].indexOf(true) + 1;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < i + 2; j++) {
        set(L + j, top - 2 + i);
        ear[top - 2 + i][L + j] = ear[top - 2 + i][mirror(L + j)] = true;
      }
  }
  if (sh.feet) {
    for (const dx of [-6, -5, -4]) set(MID + dx, bottom + 1);
  }
  const wings: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  if (sh.wings) {
    const left = Math.floor(sh.cx - sh.rx);
    const rows = [Math.round(sh.cy) - 3, Math.round(sh.cy) - 2, Math.round(sh.cy) - 1, Math.round(sh.cy)];
    rows.forEach((y, i) => {
      for (let k = 0; k <= 3 - i; k++) {
        const x = left - k;
        if (x >= 0) {
          wings[y][x] = true;
          wings[y][mirror(x)] = true;
        }
      }
    });
  }
  const inAny = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N && (body[y][x] || wings[y][x]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!body[y][x] && !wings[y][x]) continue;
      const edge = !inAny(x - 1, y) || !inAny(x + 1, y) || !inAny(x, y - 1) || !inAny(x, y + 1);
      if (edge) {
        g[y][x] = "o";
        continue;
      }
      if (wings[y][x] && !body[y][x]) {
        g[y][x] = "w";
        continue;
      }
      if (ear[y][x] && y < top + 1) {
        g[y][x] = "p";
        continue;
      }
      const [nx, ny] = norm(x, y);
      if (ny > 0.6) g[y][x] = "d";
      else if (nx < -0.3 && nx > -0.72 && ny < -0.38 && ny > -0.82) g[y][x] = "l";
      else g[y][x] = "b";
    }
  // body/wing seam
  if (sh.wings)
    for (let y = 0; y < N; y++)
      for (let x = 1; x < N - 1; x++)
        if (wings[y][x] && !body[y][x] && (body[y][x + 1] || body[y][x - 1]) && g[y][x] === "w") g[y][x] = "o";
  // specular
  const sx = Math.round(sh.cx - sh.rx * 0.5);
  const sy = Math.round(sh.cy - sh.ryT * 0.55);
  if (g[sy]?.[sx] && g[sy][sx] !== "o") g[sy][sx] = "w";
  if (sh.egg) {
    for (const [x, y] of [[8, 9], [9, 9], [15, 11], [14, 11], [15, 12], [10, 19], [9, 19], [16, 17]]) if (g[y][x] !== "o" && g[y][x] !== "w") g[y][x] = "e";
  }

  // face
  const ey = sh.eyeY;
  const Lx = MID - sh.gap - 2; // left eye's left column
  const Rx = mirror(Lx + 1); // right eye's left column
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c;
  };
  const eyeBoth = (pix: [number, number][], c = "k") => {
    for (const [dx, dy] of pix) {
      put(Lx + dx, ey + dy, c);
      put(mirror(Lx + dx), ey + dy, c);
    }
  };
  const my = ey + (stage >= 3 ? 3 : 2);
  const mouth = (pix: [number, number, string][]) => pix.forEach(([x, y, c]) => put(x, my + y, c));
  const blush = () => {
    put(Lx - 2, ey + 2, "p");
    put(Lx - 1, ey + 2, "p");
    put(mirror(Lx - 2), ey + 2, "p");
    put(mirror(Lx - 1), ey + 2, "p");
  };
  const openEyes = () => {
    eyeBoth([[0, 0], [1, 0], [0, 1], [1, 1]]);
    put(Lx, ey, "w");
    put(Rx, ey, "w");
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

  // procedural accessories
  if (hat === "headband") {
    const hb = ey - 3;
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
  if (hat === "sunnies") {
    const lens = (x0: number) => {
      for (let x = x0 - 1; x <= x0 + 2; x++) for (let y = ey - 1; y <= ey + 1; y++) put(x, y, "s");
      put(x0 - 1, ey - 1, "S");
    };
    lens(Lx);
    lens(Rx);
    for (let x = Lx + 3; x < Rx - 1; x++) put(x, ey - 1, "s");
  }

  const rows = g.map((r) => r.join(""));
  const hatSprite = hat ? HAT_SPRITES[hat] : undefined;
  if (hatSprite) {
    const hw = Math.max(...hatSprite.grid.map((r) => r.length));
    const x0 = hatSprite.dx !== undefined ? MID + hatSprite.dx : MID - Math.floor(hw / 2);
    const y0 = top - hatSprite.grid.length + (hatSprite.overlap ?? 2) + (stage >= 2 && hatSprite.earAware ? -1 : 0);
    const out = rows.map((r) => r.split(""));
    // grow canvas upward if the hat pokes out of the top
    const extra = Math.max(0, -y0);
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
};

