// App fonts (Settings → Look & sound). Classic is the original pixel font and stays the default.
// Every font is self-hosted (src/fonts, SIL Open Font License) and only downloaded when shown.
// The @font-face rules in src/fonts.css size each one to sit like Classic, and give each a
// "title" twin scaled up to stand as tall as the chunky pixel titles.

export interface AppFont {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  /** CSS font-family for body text. */
  text: string;
  /** CSS font-family for titles and labels when "Titles: same as text" is on. */
  title: string;
}

const FALLBACK = 'ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif';

export const FONTS: AppFont[] = [
  { id: "classic", emoji: "👾", name: "Classic", blurb: "The original pixel font", text: `"Quest", ${FALLBACK}`, title: `"Quest Title", ${FALLBACK}` },
  { id: "pixel", emoji: "🕹️", name: "Pixel Smooth", blurb: "The Classic pixel look drawn finer, so long notes read more easily (Jersey 20)", text: `"Quest Pixel", ${FALLBACK}`, title: `"Quest Pixel Title", ${FALLBACK}` },
  { id: "rounded", emoji: "🍡", name: "Rounded", blurb: "Soft and friendly, easy on the eyes (Nunito)", text: `"Quest Rounded", ${FALLBACK}`, title: `"Quest Rounded Title", ${FALLBACK}` },
  { id: "legible", emoji: "🔍", name: "Hyperlegible", blurb: "Made for reading: 0 and O, 1, l and I, 5 and S never look alike (Atkinson Hyperlegible)", text: `"Quest Legible", ${FALLBACK}`, title: `"Quest Legible Title", ${FALLBACK}` },
  { id: "phone", emoji: "📱", name: "Phone's own", blurb: "Your phone's system font, nothing to download", text: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, title: `"Quest Phone Title", system-ui, -apple-system, "Segoe UI", sans-serif` },
  { id: "hand", emoji: "✍️", name: "Handwritten", blurb: "Cozy journal handwriting (Patrick Hand)", text: `"Quest Hand", ${FALLBACK}`, title: `"Quest Hand Title", ${FALLBACK}` },
];

export const FONT_IDS = FONTS.map((f) => f.id);
export const DEFAULT_FONT = "classic";

/** Titles and small labels: the original pixel font ("pixel") or the chosen text font ("text"). */
export const TITLE_FONTS = ["pixel", "text"] as const;
export type TitleFont = (typeof TITLE_FONTS)[number];

/** The pixel title font the stylesheet uses by default. */
export const PIXEL_TITLES = '"Press Start 2P", "Quest", monospace';

export function fontOf(id: string | undefined): AppFont {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/**
 * CSS variables to set on <html> for a font choice: --font (text) and --font-px (titles).
 * Classic with pixel titles is the stylesheet's own default, so nothing is set.
 */
export function fontVars(font: string | undefined, titles: string | undefined): Record<string, string> {
  const f = fontOf(font);
  const out: Record<string, string> = {};
  if (f.id !== DEFAULT_FONT) out["--font"] = f.text;
  if (titles === "text") out["--font-px"] = f.title;
  return out;
}

export const FONT_VARS = ["--font", "--font-px"];
