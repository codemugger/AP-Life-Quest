// Applies the seasonal look (Settings → Look) over the base design: colour tokens on <html>, a
// data-look attribute for festive decorations, and the phone's status-bar colour.
import { useEffect, useState } from "react";
import { resolveTheme, THEMED_TOKENS, themeTokens, type ThemeId } from "../shared/themes";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const STATUS_BAR = { light: "#fbf1de", dark: "#17142b" };

/** Whether the app is showing dark mode (the Light/dark setting, or the phone's when it's Auto). */
export function useDark(theme: string) {
  const [system, setSystem] = useState(() => typeof matchMedia !== "undefined" && matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(DARK_QUERY);
    const on = () => setSystem(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return theme === "night" || (theme === "auto" && system);
}

export function useLook(s: { theme: string; look: string; palette: string }, today: string): ThemeId {
  const dark = useDark(s.theme);
  const id = resolveTheme(s.look ?? "original", today);
  const palette = s.palette ?? "classic";
  useEffect(() => {
    const root = document.documentElement;
    const tokens = themeTokens(id, palette, dark);
    for (const k of THEMED_TOKENS) root.style.removeProperty(k);
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
    root.dataset.look = id;
    const bar = tokens["--bg"] ?? STATUS_BAR[dark ? "dark" : "light"];
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", bar);
    return () => {
      for (const k of THEMED_TOKENS) root.style.removeProperty(k);
      delete root.dataset.look;
      for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
        m.setAttribute("content", m.media.includes("dark") ? STATUS_BAR.dark : STATUS_BAR.light);
    };
  }, [id, palette, dark]);
  return id;
}
