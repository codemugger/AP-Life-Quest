import { describe, expect, it } from "vitest";
import { contrast, darkScheduled, isPalette, lightMode, PALETTES, resolveTheme, seasonFor, THEMED_TOKENS, themeTokens, THEMES, type ThemeId } from "../shared/themes";

// the base design (styles.css) the themes are laid over
const BASE = {
  light: { "--bg": "#fbf1de", "--panel": "#fffaf0", "--panel-2": "#fff1dc", "--pink": "#ff8fc1", "--pink-l": "#ffd2e6", "--violet": "#7c5cff", "--violet-l": "#e1d9ff", "--xp": "#7c5cff", "--xp-track": "#e1d9ff" },
  dark: { "--bg": "#17142b", "--panel": "#241f42", "--panel-2": "#2d2752", "--pink": "#ff8fc1", "--pink-l": "#4b2443", "--violet": "#7c5cff", "--violet-l": "#352c70", "--xp": "#7c5cff", "--xp-track": "#2f2763" },
};
const TEXT = { light: { ink: "#2d2142", ink2: "#5a4e75", muted: "#8b82a1" }, dark: { ink: "#f6f0ff", ink2: "#cfc4ee", muted: "#9d93c2" } };

/** Readability problems for one look (empty = fine). */
function problems(name: string, tokens: Record<string, string>, mode: "light" | "dark") {
  const t = { ...BASE[mode], ...tokens };
  const ink = TEXT[mode];
  const out: string[] = [];
  const need = (what: string, a: string, b: string, min: number) => {
    const c = contrast(a, b);
    if (c < min) out.push(`${name}/${mode}: ${what} ${c.toFixed(2)} < ${min}`);
  };
  for (const k of ["--bg", "--panel", "--panel-2", "--pink-l", "--violet-l"]) need(`text on ${k}`, ink.ink, t[k], 7);
  need("secondary text on panel", ink.ink2, t["--panel"], 4.5);
  need("muted text on panel", ink.muted, t["--panel"], 3);
  need("button text on --pink", "#2d2142", t["--pink"], 4.5);
  need("level badge text on --violet", t["--on-violet"] ?? "#ffffff", t["--violet"], 4);
  need("links (--violet) on panel", t["--violet"], t["--panel"], mode === "light" ? 4 : 3);
  need("XP bar on its track", t["--xp"], t["--xp-track"], 1.8);
  return out;
}

describe("themes", () => {
  it("every theme and palette stays readable in light and dark", () => {
    const issues: string[] = [];
    for (const mode of ["light", "dark"] as const) {
      issues.push(...problems("base", {}, mode));
      for (const th of THEMES) if (th.id !== "original") issues.push(...problems(th.id, themeTokens(th.id, "classic", mode === "dark"), mode));
      for (const p of PALETTES) issues.push(...problems(`original:${p.id}`, themeTokens("original", p.id, mode === "dark"), mode));
      for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#7f7f7f", "#000000", "#ffffff", "#ff8800", "#123456", "#d4a5ff"])
        issues.push(...problems(`own:${hex}`, themeTokens("original", hex, mode === "dark"), mode));
    }
    expect(issues).toEqual([]);
  });

  it("themes set the same colours in light and dark (so nothing leaks between modes)", () => {
    for (const th of THEMES) {
      if (th.id === "original") continue;
      const l = Object.keys(themeTokens(th.id, "", false)).sort();
      const d = Object.keys(themeTokens(th.id, "", true)).sort();
      expect(d).toEqual(l);
      for (const k of l) expect(THEMED_TOKENS).toContain(k);
    }
    for (const p of PALETTES) expect(Object.keys(p.dark).sort()).toEqual(Object.keys(p.light).sort());
  });

  it("Auto follows Singapore's calendar: Lunar New Year, then the seasons", () => {
    expect(seasonFor("2027-01-27")).toBe("cny"); // 10 days before CNY (6 Feb 2027)
    expect(seasonFor("2027-02-20")).toBe("cny"); // Chap Goh Mei
    expect(seasonFor("2027-02-21")).toBe("winter");
    expect(seasonFor("2027-01-26")).toBe("winter");
    expect(seasonFor("2026-04-10")).toBe("spring");
    expect(seasonFor("2026-08-09")).toBe("summer");
    expect(seasonFor("2026-11-17")).toBe("autumn");
    expect(seasonFor("2026-12-25")).toBe("winter");
    expect(resolveTheme("auto", "2028-01-26")).toBe("cny");
    expect(resolveTheme("summer", "2028-01-26")).toBe("summer");
    expect(resolveTheme("nonsense", "2028-01-26")).toBe("original");
  });

  it("accepts palettes by name or as a colour", () => {
    expect(isPalette("kopi")).toBe(true);
    expect(isPalette("#a1b2c3")).toBe(true);
    expect(isPalette("red")).toBe(false);
    expect(isPalette("#abc")).toBe(false);
    // Classic only adds its wallpaper; colours stay the base design's
    expect(Object.keys(themeTokens("original", "classic", false)).sort()).toEqual(["--wallpaper", "--wallpaper-size"]);
  });
});

describe("light or dark on a schedule", () => {
  const sgt = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00+08:00`);
  it("is dark from 20:00 until 07:00, across midnight (Singapore time)", () => {
    expect(darkScheduled("20:00", "07:00", sgt("19:59"), "Asia/Singapore")).toBe(false);
    expect(darkScheduled("20:00", "07:00", sgt("20:00"), "Asia/Singapore")).toBe(true);
    expect(darkScheduled("20:00", "07:00", sgt("23:30"), "Asia/Singapore")).toBe(true);
    expect(darkScheduled("20:00", "07:00", sgt("06:59"), "Asia/Singapore")).toBe(true);
    expect(darkScheduled("20:00", "07:00", sgt("07:00"), "Asia/Singapore")).toBe(false);
    expect(darkScheduled("20:00", "07:00", sgt("12:00"), "Asia/Singapore")).toBe(false);
  });
  it("handles a window within one day, and a zero-length one", () => {
    expect(darkScheduled("13:00", "15:00", sgt("14:00"), "Asia/Singapore")).toBe(true);
    expect(darkScheduled("13:00", "15:00", sgt("16:00"), "Asia/Singapore")).toBe(false);
    expect(darkScheduled("08:00", "08:00", sgt("08:00"), "Asia/Singapore")).toBe(false);
  });
  it("resolves the setting to day / night / auto", () => {
    const s = { theme: "schedule", dark_from: "20:00", dark_until: "07:00", timezone: "Asia/Singapore" };
    expect(lightMode(s, sgt("21:00"))).toBe("night");
    expect(lightMode(s, sgt("09:00"))).toBe("day");
    expect(lightMode({ ...s, theme: "auto" }, sgt("21:00"))).toBe("auto");
    expect(lightMode({ ...s, theme: "night" }, sgt("09:00"))).toBe("night");
  });
});

describe("page wallpaper", () => {
  it("gives every look a pattern in light and dark, as a safe data URL", () => {
    for (const t of THEMES)
      for (const dark of [false, true]) {
        const wp = themeTokens(t.id, "classic", dark)["--wallpaper"];
        const prefix = 'url("data:image/svg+xml,';
        expect(wp.startsWith(prefix) && wp.endsWith('")')).toBe(true);
        const body = wp.slice(prefix.length, -2);
        expect(body).not.toMatch(/[#<>"]/); // colours and tags are URL-encoded
        expect(decodeURIComponent(body)).toMatch(/^<svg .*<rect .*<\/svg>$/);
      }
    // Original's palettes and your own colour tint it too
    expect(themeTokens("original", "kopi", false)["--wallpaper"]).not.toBe(themeTokens("original", "classic", false)["--wallpaper"]);
    expect(themeTokens("original", "#5fb3a1", true)["--wallpaper"]).toContain("svg");
  });
});
