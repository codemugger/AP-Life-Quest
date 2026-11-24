// Settings → Font: the app font (Classic pixel by default) and whether titles stay pixel.
import { fontOf, FONTS } from "../../shared/fonts";
import { useGame } from "../store";
import { Field } from "./ui";

export function FontPicker() {
  const { state, act, busy } = useGame();
  const s = state.settings;
  const current = fontOf(s.font);
  const set = (patch: Record<string, unknown>) => act("settings", patch, "PUT").catch(() => {});
  return (
    <>
      <Field label="Font" help={current.blurb}>
        <div className="font-grid">
          {FONTS.map((f) => {
            const on = f.id === current.id;
            return (
              <button key={f.id} type="button" className={`font-tile ${on ? "on" : ""}`} disabled={busy} onClick={() => set({ font: f.id })} aria-pressed={on} title={f.blurb} style={{ fontFamily: f.text }}>
                <span className="ft-name">
                  {f.emoji} {f.name}
                </span>
                <span className="ft-sample">Aa 0O 1lI 5S 8B</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Titles and labels" help="Pixel keeps the chunky game titles. Same as text uses your font everywhere, which is easier to read on small labels.">
        <select className="input" value={s.title_font ?? "pixel"} disabled={busy} onChange={(e) => set({ title_font: e.target.value })}>
          <option value="pixel">👾 Pixel titles (classic)</option>
          <option value="text">🔤 Same as the text font</option>
        </select>
      </Field>
    </>
  );
}
