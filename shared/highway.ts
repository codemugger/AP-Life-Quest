// The Highway: your grid of favourite sites (account-wide). Suggestions double as the owner's
// starting set; anyone can add, edit, reorder or remove them.

export interface HighwayLink {
  id: number;
  name: string;
  url: string;
  emoji: string | null;
  /** auto = the site's own logo (fetched once, stored privately) · emoji · image = your own picture */
  icon_mode: "auto" | "emoji" | "image";
  has_icon: number;
  icon_v: number;
  icon_tried: number;
  /** which logo service to ask first (see LOGO_SOURCES) */
  logo_src: number;
  sort: number;
}

/** Where logos come from, in order of preference ("Try another logo" moves to the next). */
export const LOGO_SOURCES = ["this page's icon", "DuckDuckGo", "the website's main icon"] as const;

export const HIGHWAY_SUGGESTIONS: { name: string; url: string; emoji: string; logo?: number }[] = [
  { name: "ChatGPT", url: "https://chatgpt.com/", emoji: "🤖" },
  { name: "Claude", url: "https://claude.ai/", emoji: "✳️" },
  { name: "Gemini", url: "https://gemini.google.com/", emoji: "✨" },
  { name: "DeepSeek", url: "https://chat.deepseek.com/", emoji: "🐋" },
  { name: "Facebook", url: "https://www.facebook.com/", emoji: "📘" },
  { name: "Calendar", url: "https://calendar.google.com/calendar/u/0/r?tab=rc", emoji: "📅" },
  { name: "Udemy", url: "https://www.udemy.com/home/my-courses/learning/", emoji: "🎓" },
  { name: "LinkedIn", url: "https://www.linkedin.com/feed/foryou/", emoji: "💼" },
  { name: "Outlook", url: "https://outlook.cloud.microsoft/mail/", emoji: "📧", logo: 1 },
  { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox", emoji: "✉️" },
  { name: "Google", url: "https://www.google.com/", emoji: "🔎" },
];

/** More ideas offered when adding a site (not added automatically). */
export const HIGHWAY_MORE: { name: string; url: string; emoji: string }[] = [
  { name: "YouTube", url: "https://www.youtube.com/", emoji: "▶️" },
  { name: "WhatsApp", url: "https://web.whatsapp.com/", emoji: "💬" },
  { name: "Google Drive", url: "https://drive.google.com/", emoji: "🗂️" },
  { name: "Instagram", url: "https://www.instagram.com/", emoji: "📷" },
  { name: "Spotify", url: "https://open.spotify.com/", emoji: "🎧" },
  { name: "Notion", url: "https://www.notion.so/", emoji: "📓" },
];

export const MAX_HIGHWAY = 48;
export const MAX_HIGHWAY_ICON = 200_000;

/** A clean http(s) address, or an error message. */
export function highwayUrl(raw: unknown): { url: string } | { error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { error: "Enter the site's address" };
  if (s.length > 800) return { error: "That address is too long" };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return { error: "That doesn't look like a web address" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only http(s) web addresses" };
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return { error: "That doesn't look like a web address" };
  return { url: u.toString() };
}
