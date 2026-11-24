import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_FONT, FONT_IDS, fontOf, FONTS, fontVars } from "../shared/fonts";
import { DEFAULT_SETTINGS } from "../shared/rules";

const css = readFileSync(new URL("../src/fonts.css", import.meta.url), "utf8") + readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const declared = new Set([...css.matchAll(/font-family:\s*"([^"]+)";/g)].map((m) => m[1]));
const firstFamily = (stack: string) => stack.split(",")[0].trim().replace(/"/g, "");

describe("app fonts", () => {
  it("keeps Classic as the default", () => {
    expect(DEFAULT_SETTINGS.font).toBe(DEFAULT_FONT);
    expect(FONTS[0].id).toBe("classic");
    expect(DEFAULT_SETTINGS.title_font).toBe("pixel");
  });

  it("has unique ids and a name, blurb and sample font for each", () => {
    expect(new Set(FONT_IDS).size).toBe(FONTS.length);
    for (const f of FONTS) {
      expect(f.name && f.blurb && f.emoji && f.text && f.title).toBeTruthy();
    }
  });

  it("declares every self-hosted family it names (text and title)", () => {
    for (const f of FONTS) {
      for (const stack of [f.text, f.title]) {
        const fam = firstFamily(stack);
        if (fam.startsWith("Quest")) expect(declared, `${f.id}: ${fam}`).toContain(fam);
      }
    }
  });

  it("ships the font files and their licences", () => {
    for (const m of css.matchAll(/url\("\.\/fonts\/([^"]+)"\)/g)) expect(() => readFileSync(new URL(`../src/fonts/${m[1]}`, import.meta.url))).not.toThrow();
    for (const lic of ["jersey-10", "jersey-20", "nunito", "atkinson-hyperlegible-next", "patrick-hand"])
      expect(readFileSync(new URL(`../src/fonts/OFL-${lic}.txt`, import.meta.url), "utf8")).toContain("SIL Open Font License");
  });

  it("sets nothing for Classic with pixel titles (the stylesheet default)", () => {
    expect(fontVars("classic", "pixel")).toEqual({});
    expect(fontVars(undefined, undefined)).toEqual({});
  });

  it("sets the text font, and the titles only when asked", () => {
    expect(fontVars("rounded", "pixel")).toEqual({ "--font": fontOf("rounded").text });
    expect(fontVars("rounded", "text")).toEqual({ "--font": fontOf("rounded").text, "--font-px": fontOf("rounded").title });
    expect(fontVars("classic", "text")).toEqual({ "--font-px": fontOf("classic").title });
  });

  it("falls back to Classic for an unknown id", () => {
    expect(fontOf("comic-sans").id).toBe("classic");
    expect(fontVars("comic-sans", "pixel")).toEqual({});
  });
});
