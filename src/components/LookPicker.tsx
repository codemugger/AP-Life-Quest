// Settings → Look: seasonal / festive themes, and Original's colours.
import { useState } from "react";
import { PALETTES, resolveTheme, seasonFor, swatches, THEMES, type ThemeId } from "../../shared/themes";
import { useDark } from "../look";
import { useGame } from "../store";
import { Field } from "./ui";

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="look-sw" aria-hidden="true">
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

export function LookPicker() {
  const { state, act, busy } = useGame();
  const s = state.settings;
  const dark = useDark(s);
  const choice = s.look ?? "original";
  const palette = s.palette ?? "classic";
  const current = resolveTheme(choice, state.today);
  const [own, setOwn] = useState(/^#/.test(palette) ? palette : "#5fb3a1");
  const set = (patch: Record<string, unknown>) => act("settings", patch, "PUT").catch(() => {});
  const autoNow = THEMES.find((t) => t.id === seasonFor(state.today))!;
  const tile = (id: string, emoji: string, name: string, colors: string[], on: boolean, onClick: () => void, title: string) => (
    <button key={id} type="button" className={`look-tile ${on ? "on" : ""}`} disabled={busy} onClick={onClick} title={title} aria-pressed={on}>
      <span className="look-emoji">{emoji}</span>
      <span className="look-name">{name}</span>
      <Swatches colors={colors} />
    </button>
  );
  return (
    <>
      <Field label="Season & festival theme" help={THEMES.find((t) => t.id === current)?.blurb}>
        <div className="look-grid">
          {tile("auto", "📅", "Auto", swatches(autoNow.id, palette, dark), choice === "auto", () => set({ look: "auto" }), `Follows the calendar (now: ${autoNow.name})`)}
          {THEMES.map((t) => tile(t.id, t.emoji, t.name, swatches(t.id as ThemeId, palette, dark), choice === t.id, () => set({ look: t.id }), t.blurb))}
        </div>
      </Field>
      {choice === "auto" && (
        <p className="tiny muted" style={{ marginTop: -6 }}>
          Auto: Lunar New Year from about 10 days before CNY until Chap Goh Mei, otherwise Spring (Mar–May), Summer (Jun–Aug), Autumn (Sep–Nov) and Winter (Dec–Feb).
          Right now: {autoNow.emoji} {autoNow.name}.
        </p>
      )}
      {current === "original" && (
        <Field label="Original's colours" help="Each palette is tuned for light and dark mode. Your own colour gets matching shades so text stays easy to read.">
          <div className="look-grid">
            {PALETTES.map((p) => tile(`p-${p.id}`, p.emoji, p.name, swatches("original", p.id, dark), palette === p.id, () => set({ palette: p.id }), p.name))}
            {/^#/.test(palette) && tile("p-own", "🎨", "Yours", swatches("original", palette, dark), true, () => {}, "Your own colour")}
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <label className="row small">
              Your own colour:
              <input type="color" value={own} onChange={(e) => setOwn(e.target.value)} style={{ width: 54, height: 36, border: 0, background: "none" }} aria-label="Pick your own colour" />
            </label>
            <button className="btn sm" disabled={busy} onClick={() => set({ palette: own.toLowerCase() })}>
              Use this colour
            </button>
          </div>
        </Field>
      )}
    </>
  );
}
