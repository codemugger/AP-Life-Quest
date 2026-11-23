// Seasonal and festive looks (Settings → Look). Each theme is a set of colour tokens for light and
// dark mode, applied over the base design in styles.css; "Original" can also take a palette or
// your own colour. Pure data + maths, so the Worker can validate settings and tests can check
// contrast for every theme.

export type ThemeId = "original" | "spring" | "summer" | "autumn" | "winter" | "cny";
export type ThemeChoice = ThemeId | "auto";
export type Tokens = Record<string, string>;

export const THEMES: { id: ThemeId; name: string; emoji: string; blurb: string }[] = [
  { id: "original", name: "Original", emoji: "🏕️", blurb: "Cosy cream and lavender (choose its colours below)" },
  { id: "spring", name: "Spring", emoji: "🌸", blurb: "Orchids of Gardens by the Bay: soft pink and orchid purple" },
  { id: "summer", name: "Summer", emoji: "🏖️", blurb: "Sentosa sand and sea, with National Day red-and-white bunting and fireworks" },
  { id: "autumn", name: "Autumn", emoji: "🏮", blurb: "Mid-Autumn lanterns floating up and a big full moon" },
  { id: "winter", name: "Winter", emoji: "❄️", blurb: "Orchard Road Christmas lights and gentle snow" },
  { id: "cny", name: "Lunar New Year", emoji: "🧧", blurb: "Red and gold: lanterns, mandarin oranges and ang baos" },
];
export const THEME_CHOICES: ThemeChoice[] = ["auto", ...THEMES.map((t) => t.id)];

// ---------------------------------------------------------------------------
// Auto: Lunar New Year around CNY (Singapore-style: decorations go up early and stay until
// Chap Goh Mei, the 15th day), otherwise the season by month.
// ---------------------------------------------------------------------------
export const CNY_DATES = [
  "2025-01-29",
  "2026-02-17",
  "2027-02-06",
  "2028-01-26",
  "2029-02-13",
  "2030-02-03",
  "2031-01-23",
  "2032-02-11",
  "2033-01-31",
  "2034-02-19",
  "2035-02-08",
  "2036-01-28",
];
const CNY_BEFORE = 10;
const CNY_AFTER = 14;

const shift = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export function seasonFor(date: string): ThemeId {
  if (CNY_DATES.some((d) => date >= shift(d, -CNY_BEFORE) && date <= shift(d, CNY_AFTER))) return "cny";
  const m = Number(date.slice(5, 7));
  return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}

// ---------------------------------------------------------------------------
// Light or dark on a schedule (e.g. dark from 20:00 until 07:00, across midnight).
// ---------------------------------------------------------------------------
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutes past midnight of an instant in a timezone. */
export function minutesIn(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Whether the scheduled dark window covers this moment (until is exclusive: 07:00 means light from 7:00). */
export function darkScheduled(from: string, until: string, now: Date, tz: string) {
  const f = toMinutes(from);
  const u = toMinutes(until);
  const m = minutesIn(now, tz);
  if (f === u) return false;
  return f < u ? m >= f && m < u : m >= f || m < u;
}

/** "day" / "night" / "auto" (follow the phone) for a moment, resolving a schedule. */
export function lightMode(s: { theme: string; dark_from?: string; dark_until?: string; timezone: string }, now: Date): "day" | "night" | "auto" {
  if (s.theme === "schedule") return darkScheduled(s.dark_from ?? "20:00", s.dark_until ?? "07:00", now, s.timezone) ? "night" : "day";
  return s.theme === "day" || s.theme === "night" ? s.theme : "auto";
}

export const resolveTheme = (choice: string, today: string): ThemeId =>
  choice === "auto" ? seasonFor(today) : THEMES.some((t) => t.id === choice) ? (choice as ThemeId) : "original";

// ---------------------------------------------------------------------------
// Palettes. Ink (#2d2142 / #f6f0ff) and the status colours (good / warn / bad / HP) never change,
// so text and meaning stay readable everywhere; themes recolour the paper, the two accents
// (buttons & highlights = "pink", links / level / XP = "violet") and the Camp sky.
// ---------------------------------------------------------------------------

/** Camp stage at night (time-of-day), independent of light/dark mode. */
const NIGHT_DEFAULT = { "--night-top": "#1a1745", "--night-bottom": "#4a3a7a", "--night-ground": "#2f6a4f", "--night-ground-d": "#1f4a38" };

interface Theme {
  light: Tokens;
  dark: Tokens;
}

const THEME_TOKENS: Record<Exclude<ThemeId, "original">, Theme> = {
  spring: {
    light: {
      "--bg": "#f7f0fb", "--bg-dot": "#e7d6f2", "--panel": "#fffbff", "--panel-2": "#f6ebfb", "--grid": "#eadcf3",
      "--pink": "#f6a3d2", "--pink-d": "#d96aa8", "--pink-l": "#fbdcef",
      "--violet": "#8e44c0", "--violet-l": "#ead9f8", "--xp": "#9a52cc", "--xp-track": "#ead9f8",
      "--sky-top": "#bfe7ff", "--sky-bottom": "#fde9f6", "--ground": "#8fdc8a", "--ground-d": "#5fb866",
      "--trim-a": "#f6a3d2", "--trim-b": "#b98ce0",
      ...NIGHT_DEFAULT, "--night-top": "#1f1a46", "--night-bottom": "#5a3a7a",
    },
    dark: {
      "--bg": "#1c1426", "--bg-dot": "#33244a", "--panel": "#281c36", "--panel-2": "#312242", "--grid": "#45305c",
      "--pink": "#f6a3d2", "--pink-d": "#d96aa8", "--pink-l": "#4c2547",
      "--violet": "#b77ae6", "--violet-l": "#3d2a5c", "--xp": "#b77ae6", "--xp-track": "#3a2a52",
      "--sky-top": "#1f1a46", "--sky-bottom": "#5a3a7a", "--ground": "#2f6a4f", "--ground-d": "#1f4a38",
      "--trim-a": "#d96aa8", "--trim-b": "#8e44c0",
      ...NIGHT_DEFAULT, "--night-top": "#1f1a46", "--night-bottom": "#5a3a7a",
    },
  },
  summer: {
    light: {
      "--bg": "#fff5df", "--bg-dot": "#f3dfae", "--panel": "#fffcf3", "--panel-2": "#fff0d3", "--grid": "#f0e0bd",
      "--pink": "#ff9a8a", "--pink-d": "#e85d4c", "--pink-l": "#ffdcd5",
      "--violet": "#d1293a", "--violet-l": "#ffd9dc", "--xp": "#2b8be0", "--xp-track": "#d3ecff",
      "--sky-top": "#6fd0ff", "--sky-bottom": "#fff4d6", "--ground": "#f2d38a", "--ground-d": "#e0b65f",
      "--trim-a": "#e0323c", "--trim-b": "#ffffff",
      ...NIGHT_DEFAULT, "--night-top": "#0f1d3d", "--night-bottom": "#2d4a7a", "--night-ground": "#5a5a4a", "--night-ground-d": "#3f3f33",
    },
    dark: {
      "--bg": "#0f1e29", "--bg-dot": "#1c3546", "--panel": "#162936", "--panel-2": "#1d3343", "--grid": "#294457",
      "--pink": "#ff9a8a", "--pink-d": "#e85d4c", "--pink-l": "#4a2a2c",
      "--violet": "#ff6b74", "--violet-l": "#4a1f27", "--xp": "#4fb0ff", "--xp-track": "#1f3a5c",
      "--sky-top": "#0f1d3d", "--sky-bottom": "#2d4a7a", "--ground": "#5a5a4a", "--ground-d": "#3f3f33",
      "--trim-a": "#e0323c", "--trim-b": "#f4f0e8",
      ...NIGHT_DEFAULT, "--night-top": "#0f1d3d", "--night-bottom": "#2d4a7a", "--night-ground": "#5a5a4a", "--night-ground-d": "#3f3f33",
    },
  },
  autumn: {
    light: {
      "--bg": "#fbf0e1", "--bg-dot": "#eed5b5", "--panel": "#fffaf2", "--panel-2": "#fbedd9", "--grid": "#eddac0",
      "--pink": "#f7ad66", "--pink-d": "#d97f2e", "--pink-l": "#fbdcc0",
      "--violet": "#b0432a", "--violet-l": "#f6d3c5", "--xp": "#c4651a", "--xp-track": "#f6dcc4",
      "--sky-top": "#ffd6a0", "--sky-bottom": "#fff0dc", "--ground": "#c9b067", "--ground-d": "#a98f48",
      "--trim-a": "#e2742a", "--trim-b": "#ffd166",
      ...NIGHT_DEFAULT, "--night-top": "#14183a", "--night-bottom": "#3b3060", "--night-ground": "#3d4a35", "--night-ground-d": "#2b3626",
    },
    dark: {
      "--bg": "#1b1520", "--bg-dot": "#33263a", "--panel": "#271d2b", "--panel-2": "#302434", "--grid": "#43324a",
      "--pink": "#f7ad66", "--pink-d": "#d97f2e", "--pink-l": "#4a3020",
      "--violet": "#f08a5d", "--violet-l": "#48261f", "--xp": "#f0a04b", "--xp-track": "#46301c",
      "--sky-top": "#14183a", "--sky-bottom": "#3b3060", "--ground": "#3d4a35", "--ground-d": "#2b3626",
      "--trim-a": "#e2742a", "--trim-b": "#ffd166",
      ...NIGHT_DEFAULT, "--night-top": "#14183a", "--night-bottom": "#3b3060", "--night-ground": "#3d4a35", "--night-ground-d": "#2b3626",
    },
  },
  winter: {
    light: {
      "--bg": "#eef4fb", "--bg-dot": "#d3e2f1", "--panel": "#fbfdff", "--panel-2": "#eaf2fb", "--grid": "#d8e4f1",
      "--pink": "#ff9fa8", "--pink-d": "#e0606e", "--pink-l": "#ffdfe3",
      "--violet": "#24775a", "--violet-l": "#d4eee2", "--xp": "#3f7fd6", "--xp-track": "#d6e6fb",
      "--sky-top": "#cfe6ff", "--sky-bottom": "#f4f8ff", "--ground": "#f4f8ff", "--ground-d": "#c9d8ea",
      "--trim-a": "#d2304a", "--trim-b": "#2e9a6a",
      ...NIGHT_DEFAULT, "--night-top": "#0b1230", "--night-bottom": "#2a3a6a", "--night-ground": "#c9d5e8", "--night-ground-d": "#97a9c4",
    },
    dark: {
      "--bg": "#0f1626", "--bg-dot": "#1e2a44", "--panel": "#172036", "--panel-2": "#1e2a45", "--grid": "#2a3a5c",
      "--pink": "#ff9fa8", "--pink-d": "#e0606e", "--pink-l": "#4a2430",
      "--violet": "#4fc18f", "--violet-l": "#1f3d33", "--xp": "#6aa8ff", "--xp-track": "#1f3354",
      "--sky-top": "#0b1230", "--sky-bottom": "#2a3a6a", "--ground": "#c9d5e8", "--ground-d": "#97a9c4",
      "--trim-a": "#d2304a", "--trim-b": "#2e9a6a",
      ...NIGHT_DEFAULT, "--night-top": "#0b1230", "--night-bottom": "#2a3a6a", "--night-ground": "#c9d5e8", "--night-ground-d": "#97a9c4",
    },
  },
  cny: {
    light: {
      "--bg": "#fff0e6", "--bg-dot": "#f6cfbf", "--panel": "#fffaf3", "--panel-2": "#ffecdc", "--grid": "#f1d6c3",
      "--pink": "#ff9a8f", "--pink-d": "#e2453c", "--pink-l": "#ffd8d3",
      "--violet": "#c0102c", "--violet-l": "#ffd9d9", "--xp": "#d99a00", "--xp-track": "#fbe7b5",
      "--sky-top": "#ffc6a6", "--sky-bottom": "#fff1d6", "--ground": "#9bd68a", "--ground-d": "#6cb35f",
      "--trim-a": "#c8102e", "--trim-b": "#ffc93c",
      ...NIGHT_DEFAULT, "--night-top": "#2a0f1a", "--night-bottom": "#6a1f2a", "--night-ground": "#3a4a2a", "--night-ground-d": "#29361d",
    },
    dark: {
      "--bg": "#210f0e", "--bg-dot": "#3d1b18", "--panel": "#2d1513", "--panel-2": "#391b18", "--grid": "#52261f",
      "--pink": "#ff9a8f", "--pink-d": "#e2453c", "--pink-l": "#5a2420",
      "--violet": "#ff5f6d", "--violet-l": "#5a1d22", "--xp": "#ffc93c", "--xp-track": "#4d3a14",
      "--sky-top": "#2a0f1a", "--sky-bottom": "#6a1f2a", "--ground": "#3a4a2a", "--ground-d": "#29361d",
      "--trim-a": "#c8102e", "--trim-b": "#ffc93c",
      ...NIGHT_DEFAULT, "--night-top": "#2a0f1a", "--night-bottom": "#6a1f2a", "--night-ground": "#3a4a2a", "--night-ground-d": "#29361d",
    },
  },
};

// ---------------------------------------------------------------------------
// Original: hand-picked palettes, or your own colour (shades worked out to stay readable).
// ---------------------------------------------------------------------------
export const PALETTES: { id: string; name: string; emoji: string; light: Tokens; dark: Tokens }[] = [
  { id: "classic", name: "Classic", emoji: "💜", light: {}, dark: {} },
  {
    id: "sakura",
    name: "Sakura",
    emoji: "🌷",
    light: {
      "--bg": "#fdf0f4", "--bg-dot": "#f5d5e1", "--panel": "#fffafc", "--panel-2": "#ffedf3", "--grid": "#f0dae3",
      "--pink": "#ff9cc4", "--pink-d": "#e0608f", "--pink-l": "#ffd8e8", "--violet": "#b8367c", "--violet-l": "#f8d7ea",
      "--xp": "#c2418a", "--xp-track": "#f8d7ea",
    },
    dark: {
      "--bg": "#1f1420", "--bg-dot": "#3a2440", "--panel": "#2b1b2d", "--panel-2": "#352237", "--grid": "#4a2e4c",
      "--pink": "#ff9cc4", "--pink-d": "#e0608f", "--pink-l": "#4d2440", "--violet": "#f07ab8", "--violet-l": "#4a2342",
      "--xp": "#f07ab8", "--xp-track": "#45223f",
    },
  },
  {
    id: "matcha",
    name: "Matcha",
    emoji: "🍵",
    light: {
      "--bg": "#f2f4e3", "--bg-dot": "#dde2c0", "--panel": "#fbfcf2", "--panel-2": "#edf1d8", "--grid": "#dfe4c6",
      "--pink": "#9ddc98", "--pink-d": "#5fb36a", "--pink-l": "#d6f0d4", "--violet": "#2f7a45", "--violet-l": "#d5ebcf",
      "--xp": "#3f8a52", "--xp-track": "#d5ebcf",
    },
    dark: {
      "--bg": "#131b15", "--bg-dot": "#243527", "--panel": "#1b291e", "--panel-2": "#223325", "--grid": "#2f4533",
      "--pink": "#9ddc98", "--pink-d": "#5fb36a", "--pink-l": "#23422b", "--violet": "#6cc983", "--violet-l": "#26402c",
      "--xp": "#6cc983", "--xp-track": "#22402a",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    emoji: "🌊",
    light: {
      "--bg": "#edf5fb", "--bg-dot": "#cde2f1", "--panel": "#f9fcff", "--panel-2": "#e5f1fb", "--grid": "#d4e5f1",
      "--pink": "#88cdff", "--pink-d": "#3f9be0", "--pink-l": "#d3ecff", "--violet": "#2662c4", "--violet-l": "#d8e6ff",
      "--xp": "#2f6fd6", "--xp-track": "#d8e6ff",
    },
    dark: {
      "--bg": "#0f192a", "--bg-dot": "#1f3150", "--panel": "#17243c", "--panel-2": "#1e2e4b", "--grid": "#2c3f63",
      "--pink": "#88cdff", "--pink-d": "#3f9be0", "--pink-l": "#1f3a5c", "--violet": "#6ea8ff", "--violet-l": "#22365e",
      "--xp": "#6ea8ff", "--xp-track": "#1f3354",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    emoji: "🌅",
    light: {
      "--bg": "#fff0e5", "--bg-dot": "#f5d6c0", "--panel": "#fffaf5", "--panel-2": "#ffecdc", "--grid": "#efdac9",
      "--pink": "#ffab85", "--pink-d": "#e9774a", "--pink-l": "#ffdcc8", "--violet": "#c33a63", "--violet-l": "#fbd3df",
      "--xp": "#d6466f", "--xp-track": "#fbd3df",
    },
    dark: {
      "--bg": "#22141a", "--bg-dot": "#3d242b", "--panel": "#2e1b22", "--panel-2": "#38222a", "--grid": "#4d2f38",
      "--pink": "#ffab85", "--pink-d": "#e9774a", "--pink-l": "#4f2a25", "--violet": "#ff7aa0", "--violet-l": "#4a2131",
      "--xp": "#ff7aa0", "--xp-track": "#45202c",
    },
  },
  {
    id: "kopi",
    name: "Kopi",
    emoji: "☕",
    light: {
      "--bg": "#f6eee4", "--bg-dot": "#e5d4bf", "--panel": "#fffbf6", "--panel-2": "#f4e8d9", "--grid": "#e6dacb",
      "--pink": "#e9bd8f", "--pink-d": "#c98e57", "--pink-l": "#f4dfc8", "--violet": "#8a5636", "--violet-l": "#ecdccd",
      "--xp": "#a0663c", "--xp-track": "#ecdccd",
    },
    dark: {
      "--bg": "#1b1512", "--bg-dot": "#33271f", "--panel": "#261d18", "--panel-2": "#30251e", "--grid": "#43342a",
      "--pink": "#e9bd8f", "--pink-d": "#c98e57", "--pink-l": "#4a3423", "--violet": "#d29a6c", "--violet-l": "#3e2c22",
      "--xp": "#d29a6c", "--xp-track": "#3e2c22",
    },
  },
];

export const isPalette = (p: unknown) => typeof p === "string" && (PALETTES.some((x) => x.id === p) || /^#[0-9a-f]{6}$/i.test(p));

// ---- colour maths (WCAG contrast; HSL to tune your own colour) ----
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
/** The same hue at the lightness closest to `start` that passes `ok`. */
function tune(h: number, s: number, start: number, ok: (hex: string) => boolean) {
  for (let step = 0; step <= 100; step++)
    for (const l of [start + step / 200, start - step / 200]) if (l > 0 && l < 1 && ok(fromHsl(h, s, l))) return fromHsl(h, s, l);
  return fromHsl(h, s, start);
}

export const INK = { light: "#2d2142", dark: "#f6f0ff" };
const BASE = {
  light: { "--panel": "#fffaf0" },
  dark: { "--panel": "#241f42" },
};

/** Your own colour for Original: buttons/highlights and links/XP in that hue, readable in both modes. */
export function customPalette(hex: string): { light: Tokens; dark: Tokens } {
  const [h, s0] = toHsl(hex);
  const s = Math.max(0.35, Math.min(0.85, s0));
  const btn = tune(h, s, 0.72, (c) => contrast(c, INK.light) >= 5); // dark text on the button
  const out = { light: {} as Tokens, dark: {} as Tokens };
  for (const mode of ["light", "dark"] as const) {
    const panel = BASE[mode]["--panel"];
    // links and the level badge: clear on the paper, with readable text on top (white or dark)
    const accent = tune(h, s, mode === "light" ? 0.42 : 0.7, (c) => contrast(c, panel) >= 4.5 && contrast(c, textOn(c)) >= 4.5);
    const soft = mode === "light" ? tune(h, s, 0.9, (c) => contrast(c, INK.light) >= 9) : tune(h, s * 0.6, 0.22, (c) => contrast(c, INK.dark) >= 9);
    out[mode] = {
      "--pink": btn,
      "--pink-d": tune(h, s, 0.5, (c) => contrast(c, btn) >= 1.5),
      "--pink-l": soft,
      "--violet": accent,
      "--violet-l": soft,
      "--xp": accent,
      "--xp-track": soft,
      "--bg-dot": mode === "light" ? tune(h, s * 0.5, 0.86, () => true) : tune(h, s * 0.4, 0.2, () => true),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Page wallpaper: a faint pixel pattern per look, drawn in the look's own pale colours.
// ---------------------------------------------------------------------------
/** The base design's colours, for looks that don't set them. */
const BASE_TOKENS = {
  light: { "--bg": "#fbf1de", "--bg-dot": "#efdcbc", "--pink-l": "#ffd2e6", "--violet-l": "#e1d9ff", "--xp-track": "#e1d9ff" },
  dark: { "--bg": "#17142b", "--bg-dot": "#2a2550", "--pink-l": "#4b2443", "--violet-l": "#352c70", "--xp-track": "#2f2763" },
};

function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round((v + (y[i] - v) * t) * 255).toString(16).padStart(2, "0")).join("")}`;
}

type Motif = [number, number, number, number, string][];

/** Each motif on a 32 × 32 tile (drawn at 64 px, so 2 px pixels). */
function motif(theme: ThemeId, c: Tokens, dark: boolean): Motif {
  const bg = c["--bg"];
  const dot = c["--bg-dot"];
  const pink = c["--pink-l"];
  const violet = c["--violet-l"];
  const track = c["--xp-track"];
  switch (theme) {
    case "spring": {
      const leaf = mix(bg, "#3f9a52", dark ? 0.3 : 0.22);
      return [
        [7, 7, 2, 2, violet], [5, 7, 2, 2, pink], [9, 7, 2, 2, pink], [7, 5, 2, 2, pink], [7, 9, 2, 2, pink], [8, 11, 1, 3, leaf],
        [22, 21, 1, 1, violet], [21, 21, 1, 1, pink], [23, 21, 1, 1, pink], [22, 20, 1, 1, pink], [22, 22, 1, 1, pink], [26, 6, 1, 1, dot], [12, 26, 1, 1, dot],
      ];
    }
    case "summer":
      return [
        [2, 8, 3, 1, track], [5, 7, 3, 1, track], [8, 8, 3, 1, track], [11, 7, 2, 1, track],
        [17, 22, 3, 1, track], [20, 21, 3, 1, track], [23, 22, 3, 1, track],
        [24, 8, 2, 2, pink], [25, 7, 1, 1, pink], [8, 25, 1, 1, dot], [28, 28, 1, 1, dot],
      ];
    case "autumn":
      return [
        [6, 5, 4, 1, track], [5, 6, 6, 4, pink], [6, 10, 4, 1, track], [7, 11, 2, 2, track],
        [22, 20, 3, 2, violet], [21, 22, 2, 1, violet], [24, 19, 1, 1, violet], [26, 6, 1, 1, dot], [12, 26, 1, 1, dot],
      ];
    case "winter":
      return [
        [7, 8, 3, 1, track], [8, 7, 1, 3, track], [6, 6, 1, 1, track], [10, 6, 1, 1, track], [6, 10, 1, 1, track], [10, 10, 1, 1, track],
        [21, 22, 3, 1, track], [22, 21, 1, 3, track], [26, 8, 1, 1, dot], [12, 26, 1, 1, dot], [28, 16, 1, 1, dot],
      ];
    case "cny":
      return [
        [4, 8, 6, 1, pink], [3, 9, 1, 2, pink], [4, 11, 4, 1, pink], [10, 9, 1, 1, pink], [8, 10, 1, 1, pink],
        [20, 20, 5, 5, track], [22, 22, 1, 1, bg], [26, 6, 1, 1, dot], [10, 26, 1, 1, dot],
      ];
    default: {
      const cloud = dark ? mix(bg, "#ffffff", 0.06) : mix(bg, "#ffffff", 0.75);
      return [
        [3, 6, 8, 2, cloud], [5, 4, 4, 2, cloud], [18, 21, 7, 2, cloud], [20, 19, 3, 2, cloud],
        [24, 6, 1, 1, dot], [8, 26, 1, 1, dot], [14, 14, 1, 1, dot], [28, 28, 1, 1, dot],
      ];
    }
  }
}

/** The look's wallpaper as a CSS background image. */
export function wallpaper(theme: ThemeId, tokens: Tokens, dark: boolean) {
  const c = { ...BASE_TOKENS[dark ? "dark" : "light"], ...tokens };
  const body = motif(theme, c, dark)
    .map(([x, y, w, h, f]) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${f}'/>`)
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 32 32' shape-rendering='crispEdges'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** White or dark ink, whichever reads better on a colour (e.g. the level badge on --violet). */
export const textOn = (bg: string) => (contrast("#ffffff", bg) >= contrast("#1b1530", bg) ? "#ffffff" : "#1b1530");

/** The colour tokens to lay over the base design (empty = the original look as built). */
export function themeTokens(theme: ThemeId, palette: string, dark: boolean): Tokens {
  const mode = dark ? "dark" : "light";
  const t =
    theme !== "original"
      ? THEME_TOKENS[theme][mode]
      : /^#[0-9a-f]{6}$/i.test(palette)
        ? customPalette(palette)[mode]
        : (PALETTES.find((p) => p.id === palette)?.[mode] ?? {});
  return {
    ...t,
    ...(t["--violet"] ? { "--on-violet": textOn(t["--violet"]) } : {}),
    "--wallpaper": wallpaper(theme, t, dark),
    "--wallpaper-size": "64px 64px",
  };
}

/** Every token any theme may set (so switching themes can clear the previous one's). */
export const THEMED_TOKENS = [
  ...new Set([
    ...Object.values(THEME_TOKENS).flatMap((t) => [...Object.keys(t.light), ...Object.keys(t.dark)]),
    ...PALETTES.flatMap((p) => Object.keys(p.light)),
    "--bg-dot",
    "--on-violet",
    "--wallpaper",
    "--wallpaper-size",
  ]),
];

/** A few colours to preview a theme in Settings. */
export function swatches(theme: ThemeId, palette: string, dark: boolean) {
  const t = themeTokens(theme, palette, dark);
  const base = dark
    ? { "--bg": "#17142b", "--pink": "#ff8fc1", "--violet": "#7c5cff", "--panel": "#241f42" }
    : { "--bg": "#fbf1de", "--pink": "#ff8fc1", "--violet": "#7c5cff", "--panel": "#fffaf0" };
  const v = (k: keyof typeof base) => t[k] ?? base[k];
  return [v("--bg"), v("--panel"), v("--pink"), v("--violet")];
}
