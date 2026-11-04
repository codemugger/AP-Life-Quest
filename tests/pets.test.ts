import { describe, expect, it } from "vitest";
import { COSMETICS, EYES, evolvesAt, formName, SPECIES, STAGES } from "../shared/levels";
import { artProblems, buildPet, isPetColor, petSize, type Mood } from "../shared/petgrid";

const MOODS: Mood[] = ["happy", "content", "meh", "sad", "fainted", "sleep", "blink"];
const HATS = [null, "headband", ...COSMETICS.filter((c) => c.slot === "hat").map((c) => c.id)];
const FACES = [null, ...COSMETICS.filter((c) => c.slot === "face").map((c) => c.id)];
// every letter the renderer has a colour for (src/sprites.tsx BASE + body/egg colours)
const ONLY_KNOWN = /^[.okwprtygGRBVvPnsSTbdlcKfFe]+$/;

describe("pets", () => {
  it("draws every row at the right width", () => {
    expect(artProblems()).toEqual([]);
  });

  it("has unique species with 5 named forms and a real natural colour", () => {
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const sp of SPECIES) {
      expect(sp.forms).toHaveLength(STAGES.length);
      expect(isPetColor(sp.color)).toBe(true);
    }
    expect(formName("shiba", 4)).toBe("Okami");
    expect(formName("nope", 9)).toBe(SPECIES[0].forms[4]);
  });

  it("builds every species × stage × mood × eyes × hat × face with even rows and known colours", () => {
    for (const sp of SPECIES)
      for (let stage = 0; stage < STAGES.length; stage++)
        for (const mood of MOODS)
          for (const eyes of EYES.map((e) => e.id))
            for (const hat of HATS)
              for (const face of FACES) {
                const g = buildPet(stage, mood, hat, { species: sp.id, eyes, face });
                const w = g[0].length;
                const ok = g.every((r) => r.length === w) && ONLY_KNOWN.test(g.join(""));
                if (!ok) expect(g, `${sp.id} stage ${stage} ${mood} ${eyes} ${hat} ${face}`).toBe("even rows of known letters");
              }
  }, 60_000);

  it("grows with each evolution", () => {
    for (const sp of SPECIES) {
      const sizes = [1, 2, 3, 4].map((st) => petSize(st, sp.id));
      for (let i = 1; i < sizes.length; i++) expect(sizes[i].w * sizes[i].h, `${sp.id} stage ${i + 1}`).toBeGreaterThan(sizes[i - 1].w * sizes[i - 1].h);
    }
  });

  it("knows when a pet evolves", () => {
    expect(evolvesAt(3)).toBe(1);
    expect(evolvesAt(35)).toBe(4);
    expect(evolvesAt(4)).toBeNull();
    expect(evolvesAt(1)).toBeNull();
  });

  it("falls back to a cat for an unknown species", () => {
    expect(buildPet(2, "content", null, { species: "unicorn" })).toEqual(buildPet(2, "content", null, { species: "cat" }));
  });
});
