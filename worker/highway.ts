// The Highway: each account's grid of favourite sites (stored in the account database).
// Logos are fetched once by the server and stored here, so the app never hot-links outside images.
import { HIGHWAY_SUGGESTIONS, highwayUrl, LOGO_SOURCES, MAX_HIGHWAY, MAX_HIGHWAY_ICON, type HighwayLink } from "../shared/highway";
import { all, bad, first, notFound, run, stmt } from "./db";

const COLS = "id, name, url, emoji, icon_mode, icon IS NOT NULL AS has_icon, icon_v, icon_tried, logo_src, sort";
const MODES = ["auto", "emoji", "image"];

const ICON_MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "image/x-icon": (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0,
};

/** The bytes' real image type (by content, not by what anyone claims), or null. */
export function iconType(buf: ArrayBuffer): string | null {
  if (buf.byteLength < 16) return null;
  const head = new Uint8Array(buf, 0, 12);
  return Object.keys(ICON_MAGIC).find((t) => ICON_MAGIC[t](head)) ?? null;
}

/** Your links; the owner's starting set is added the first time. */
export async function listHighway(db: D1Database, user: { id: number; role: string; highway_seeded?: number }) {
  if (!user.highway_seeded) {
    // claim it first, so two devices opening it at the same moment can't both add the set
    const claimed = await stmt(db, "UPDATE users SET highway_seeded = 1 WHERE id = ? AND highway_seeded = 0 RETURNING id", user.id).first();
    const seed = claimed && user.role === "owner" ? HIGHWAY_SUGGESTIONS : [];
    if (seed.length)
      await db.batch(seed.map((s, i) => stmt(db, "INSERT INTO highway (user_id, name, url, emoji, logo_src, sort) VALUES (?, ?, ?, ?, ?, ?)", user.id, s.name, s.url, s.emoji, s.logo ?? 0, i)));
  }
  return all<HighwayLink>(db, `SELECT ${COLS} FROM highway WHERE user_id = ? ORDER BY sort, id`, user.id);
}

function fields(b: Record<string, unknown>, creating: boolean) {
  const out: Record<string, unknown> = {};
  if (creating || "name" in b) {
    const name = String(b.name ?? "").trim().slice(0, 30);
    if (!name) throw bad("Give it a name");
    out.name = name;
  }
  if (creating || "url" in b) {
    const u = highwayUrl(b.url);
    if ("error" in u) throw bad(u.error);
    out.url = u.url;
  }
  if ("emoji" in b) out.emoji = String(b.emoji ?? "").trim().slice(0, 16) || null;
  if ("icon_mode" in b) {
    if (!MODES.includes(String(b.icon_mode))) throw bad("Unknown icon style");
    out.icon_mode = b.icon_mode;
  }
  if ("logo_src" in b) out.logo_src = Math.abs(Math.round(Number(b.logo_src) || 0)) % LOGO_SOURCES.length;
  return out;
}

const one = (db: D1Database, userId: number, id: number) => first<HighwayLink>(db, `SELECT ${COLS} FROM highway WHERE id = ? AND user_id = ?`, id, userId);

export async function createLink(db: D1Database, userId: number, b: Record<string, unknown>) {
  const n = await first<{ n: number; s: number }>(db, "SELECT COUNT(*) AS n, COALESCE(MAX(sort), -1) + 1 AS s FROM highway WHERE user_id = ?", userId);
  if ((n?.n ?? 0) >= MAX_HIGHWAY) throw bad(`Your Highway is full (${MAX_HIGHWAY} sites)`);
  const f = fields(b, true);
  // known sites (e.g. Outlook) start with the logo service that knows them best
  const hint = HIGHWAY_SUGGESTIONS.find((s) => s.url === f.url)?.logo ?? 0;
  const row = await stmt(
    db,
    "INSERT INTO highway (user_id, name, url, emoji, icon_mode, logo_src, sort) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    userId,
    f.name,
    f.url,
    f.emoji ?? null,
    f.icon_mode ?? "auto",
    f.logo_src ?? hint,
    n?.s ?? 0,
  ).first<{ id: number }>();
  return row!.id;
}

export async function updateLink(db: D1Database, userId: number, id: number, b: Record<string, unknown>) {
  const cur = await one(db, userId, id);
  if (!cur) throw notFound("Site not found");
  const f = fields(b, false);
  // a new address means a new logo
  if (f.url && f.url !== cur.url) Object.assign(f, { icon_tried: 0, ...(cur.icon_mode === "auto" ? { icon: null, icon_type: null } : {}) });
  const cols = Object.keys(f);
  if (cols.length) await stmt(db, `UPDATE highway SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND user_id = ?`, ...cols.map((c) => f[c]), id, userId).run();
}

export async function deleteLink(db: D1Database, userId: number, id: number) {
  const r = await run(db, "DELETE FROM highway WHERE id = ? AND user_id = ?", id, userId);
  if (!r.meta.changes) throw notFound("Site not found");
}

export async function reorder(db: D1Database, userId: number, ids: unknown) {
  if (!Array.isArray(ids) || ids.length > MAX_HIGHWAY) throw bad("Bad order");
  const list = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  await db.batch(list.map((id, i) => stmt(db, "UPDATE highway SET sort = ? WHERE id = ? AND user_id = ?", i, id, userId)));
}

/** Your own picture as the icon. */
export async function setIcon(db: D1Database, userId: number, id: number, buf: ArrayBuffer) {
  if (buf.byteLength > MAX_HIGHWAY_ICON) throw bad("That picture is too big for an icon");
  const type = iconType(buf);
  if (!type || type === "image/x-icon") throw bad("Icons must be PNG, JPEG, WebP or GIF");
  const r = await run(db, "UPDATE highway SET icon = ?, icon_type = ?, icon_mode = 'image', icon_v = icon_v + 1 WHERE id = ? AND user_id = ?", buf, type, id, userId);
  if (!r.meta.changes) throw notFound("Site not found");
}

/**
 * Looks up a site's logo, checked and size-capped. Starts at `first` (see LOGO_SOURCES) and falls
 * back to the others: the page's own icon (right for Gmail / Calendar on google.com), DuckDuckGo's,
 * then the domain's main icon.
 */
export async function fetchLogo(siteUrl: string, first = 0): Promise<{ buf: ArrayBuffer; type: string } | null> {
  const host = new URL(siteUrl).hostname;
  const all = [
    `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(siteUrl)}&size=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
  ];
  const sources = [...all.slice(first % all.length), ...all.slice(0, first % all.length)];
  for (const src of sources) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(5000), redirect: "follow" });
      if (!res.ok) {
        await res.body?.cancel();
        continue;
      }
      const buf = await res.arrayBuffer();
      const type = iconType(buf);
      if (type && buf.byteLength <= MAX_HIGHWAY_ICON) return { buf, type };
    } catch {
      /* try the next source */
    }
  }
  return null;
}

/** Fetches logos for "site logo" links that don't have one yet (a few per call). */
export async function fillLogos(db: D1Database, userId: number, onlyId?: number, force = false) {
  const rows = await all<{ id: number; url: string; logo_src: number }>(
    db,
    `SELECT id, url, logo_src FROM highway WHERE user_id = ? AND icon_mode = 'auto' ${onlyId ? "AND id = ?" : ""} ${force ? "" : "AND icon IS NULL AND icon_tried = 0"} ORDER BY sort LIMIT 12`,
    ...(onlyId ? [userId, onlyId] : [userId]),
  );
  const got = await Promise.all(rows.map(async (r) => ({ r, logo: await fetchLogo(r.url, r.logo_src) })));
  if (got.length)
    await db.batch(
      got.map(({ r, logo }) =>
        logo
          ? stmt(db, "UPDATE highway SET icon = ?, icon_type = ?, icon_tried = 1, icon_v = icon_v + 1 WHERE id = ? AND user_id = ?", logo.buf, logo.type, r.id, userId)
          : stmt(db, "UPDATE highway SET icon_tried = 1 WHERE id = ? AND user_id = ?", r.id, userId),
      ),
    );
  return got.filter((g) => g.logo).length;
}

export async function iconOf(db: D1Database, userId: number, id: number) {
  const row = await first<{ icon: ArrayBuffer | number[] | null; icon_type: string | null; icon_v: number }>(db, "SELECT icon, icon_type, icon_v FROM highway WHERE id = ? AND user_id = ?", id, userId);
  if (!row?.icon) return null;
  // D1 returns BLOBs as arrays of byte values
  const bytes = row.icon instanceof ArrayBuffer ? new Uint8Array(row.icon) : Uint8Array.from(row.icon);
  return { icon: bytes, icon_type: row.icon_type, icon_v: row.icon_v };
}
