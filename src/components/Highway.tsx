// The Highway: your grid of favourite sites, one tap from the top bar (and a strip on Camp).
// Account-wide, so every character shows the same sites. Logos come from our own server.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { HIGHWAY_MORE, HIGHWAY_SUGGESTIONS, highwayUrl, LOGO_SOURCES, type HighwayLink } from "../../shared/highway";
import { api, ApiError, readCache, writeCache } from "../api";
import { useFx } from "../fx";
import { prepareImage, type PicMode } from "../media";
import { EmojiInput, Field, Modal, Panel } from "./ui";

interface HighwayCtx {
  links: HighwayLink[] | null;
  refresh: () => Promise<void>;
  /** open the launcher (optionally straight into edit mode) */
  open: (edit?: boolean) => void;
}

const Ctx = createContext<HighwayCtx | null>(null);
export const useHighway = () => useContext(Ctx)!;

const iconUrl = (l: HighwayLink) => `/api/highway/${l.id}/icon?v=${l.icon_v}`;

export function HighwayProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<HighwayLink[] | null>(() => readCache<HighwayLink[]>("highway"));
  const [launcher, setLauncher] = useState<null | { edit: boolean }>(null);
  const askedLogos = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const list = await api<HighwayLink[]>("highway");
      setLinks(list);
      writeCache("highway", list);
      // fetch logos once for sites that don't have one yet (e.g. the starter set)
      if (!askedLogos.current && list.some((l) => l.icon_mode === "auto" && !l.has_icon && !l.icon_tried)) {
        askedLogos.current = true;
        await api("highway/logos", { body: {} });
        const again = await api<HighwayLink[]>("highway");
        setLinks(again);
        writeCache("highway", again);
      }
    } catch {
      /* offline: keep the saved copy */
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  const open = useCallback((edit = false) => setLauncher({ edit }), []);
  return (
    <Ctx.Provider value={{ links, refresh, open }}>
      {children}
      {launcher && <Launcher startEdit={launcher.edit} onClose={() => setLauncher(null)} />}
    </Ctx.Provider>
  );
}

function SiteIcon({ l, size = 44 }: { l: Pick<HighwayLink, "id" | "name" | "emoji" | "icon_mode" | "has_icon" | "icon_v">; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [l.icon_v]);
  if (l.icon_mode !== "emoji" && l.has_icon && !broken)
    return <img className="hw-img" src={iconUrl(l as HighwayLink)} alt="" width={size} height={size} loading="lazy" draggable={false} onError={() => setBroken(true)} />;
  return (
    <span className="hw-emoji" style={{ width: size, height: size, fontSize: size * 0.62 }} aria-hidden="true">
      {l.emoji || l.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A site: opens in a new window (or, while editing, opens its settings). */
function Tile({ l, editing, onEdit, small }: { l: HighwayLink; editing?: boolean; onEdit?: () => void; small?: boolean }) {
  const body = (
    <>
      <SiteIcon l={l} size={small ? 34 : 44} />
      <span className="hw-name">{l.name}</span>
      {editing && <span className="hw-badge">✎</span>}
    </>
  );
  return editing ? (
    <button type="button" className={`hw-tile editing ${small ? "small" : ""}`} onClick={onEdit} aria-label={`Edit ${l.name}`}>
      {body}
    </button>
  ) : (
    <a className={`hw-tile ${small ? "small" : ""}`} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
      {body}
    </a>
  );
}

/** The 🛣️ button for the top bar. */
export function HighwayButton() {
  const { open } = useHighway();
  return (
    <button type="button" className="hw-hud-btn" onClick={() => open()} aria-label="Highway: your favourite sites" title="Highway">
      🛣️
    </button>
  );
}

/** The strip on Camp. */
export function HighwayStrip() {
  const { links, open } = useHighway();
  if (!links) return null;
  return (
    <Panel
      className="hw-strip-panel tight"
      title={<>🛣️ Highway</>}
      right={
        <button className="btn xs" onClick={() => open(true)} aria-label="Edit your Highway">
          ✎
        </button>
      }
    >
      {links.length ? (
        <div className="hw-strip">
          {links.map((l) => (
            <Tile key={l.id} l={l} small />
          ))}
        </div>
      ) : (
        <button className="btn sm" onClick={() => open(true)}>
          ＋ Add your favourite sites
        </button>
      )}
    </Panel>
  );
}

function Launcher({ startEdit, onClose }: { startEdit: boolean; onClose: () => void }) {
  const { links, refresh } = useHighway();
  const [editing, setEditing] = useState(startEdit);
  const [edit, setEdit] = useState<HighwayLink | "new" | null>(null);
  return (
    <Modal
      title={<>🛣️ Highway</>}
      onClose={onClose}
      wide
      actions={
        <>
          <span className="tiny muted" style={{ marginRight: "auto" }}>
            {editing ? "Tap a site to change it." : "Same in all your characters."}
          </span>
          <button className={`btn ${editing ? "good" : ""}`} onClick={() => setEditing(!editing)}>
            {editing ? "✓ Done" : "✎ Edit"}
          </button>
        </>
      }
    >
      <div className="hw-grid">
        {(links ?? []).map((l) => (
          <Tile key={l.id} l={l} editing={editing} onEdit={() => setEdit(l)} />
        ))}
        {editing && (
          <button type="button" className="hw-tile add" onClick={() => setEdit("new")}>
            <span className="hw-emoji" style={{ width: 44, height: 44, fontSize: 26 }}>
              ＋
            </span>
            <span className="hw-name">Add</span>
          </button>
        )}
      </div>
      {!links?.length && !editing && (
        <p className="small ink2 center">
          No sites yet.{" "}
          <button className="linkbtn" onClick={() => (setEditing(true), setEdit("new"))}>
            Add one
          </button>
        </p>
      )}
      {edit && <SiteEditor link={edit === "new" ? null : edit} all={links ?? []} onClose={() => setEdit(null)} onSaved={refresh} />}
    </Modal>
  );
}

function SiteEditor({ link, all, onClose, onSaved }: { link: HighwayLink | null; all: HighwayLink[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const fx = useFx();
  const [id, setId] = useState<number | null>(link?.id ?? null);
  const [name, setName] = useState(link?.name ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [emoji, setEmoji] = useState(link?.emoji ?? "🌐");
  const [mode, setMode] = useState<HighwayLink["icon_mode"]>(link?.icon_mode ?? "auto");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(link?.icon_v ?? 0);
  const [hasIcon, setHasIcon] = useState(!!link?.has_icon);
  const [src, setSrc] = useState(link?.logo_src ?? 0);
  const file = useRef<HTMLInputElement>(null);
  const picMode = useRef<PicMode>("photo");
  const check = highwayUrl(url);
  const idx = link ? all.findIndex((l) => l.id === link.id) : -1;
  const ideas = [...HIGHWAY_SUGGESTIONS, ...HIGHWAY_MORE].filter((s) => !all.some((l) => l.url === s.url));

  const call = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      fx.error(e instanceof ApiError ? e.message : (e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  /** saves the fields; returns the site's id */
  const save = async (iconMode = mode) => {
    if ("error" in check) throw new Error(check.error);
    const b = { name, url: check.url, emoji, icon_mode: iconMode };
    if (id) {
      await api(`highway/${id}`, { method: "PUT", body: b });
      return id;
    }
    const r = await api<{ id: number }>("highway", { body: b });
    setId(r.id);
    return r.id;
  };
  const done = async () => {
    const ok = await call(save);
    if (ok) {
      await onSaved();
      onClose();
    }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    await call(async () => {
      const pic = await prepareImage(f, picMode.current, 128);
      const siteId = await save("image");
      const res = await fetch(`/api/highway/${siteId}/icon`, { method: "POST", credentials: "same-origin", headers: { "content-type": pic.blob.type, "x-requested-with": "aplq" }, body: pic.blob });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Upload failed");
      setMode("image");
      setHasIcon(true);
      setVersion((v) => v + 1);
      await onSaved();
    });
  };
  /** Fetches the logo; when there already is one, asks the next logo service instead. */
  const refreshLogo = () =>
    call(async () => {
      const next = mode === "auto" && hasIcon ? (src + 1) % LOGO_SOURCES.length : src;
      const siteId = await save("auto");
      await api(`highway/${siteId}`, { method: "PUT", body: { icon_mode: "auto", refresh_logo: true, logo_src: next } });
      await onSaved();
      const fresh = (await api<HighwayLink[]>("highway")).find((l) => l.id === siteId);
      setSrc(next);
      setMode("auto");
      setHasIcon(!!fresh?.has_icon);
      setVersion(fresh?.icon_v ?? version + 1);
      fx.toast(fresh?.has_icon ? `Logo from ${LOGO_SOURCES[next]}` : "No logo found there: the emoji is shown instead", "🌐");
    });
  const move = (dir: -1 | 1) =>
    call(async () => {
      const ids = all.map((l) => l.id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= ids.length) return;
      [ids[idx], ids[j]] = [ids[j], ids[idx]];
      await api("highway/order", { method: "PUT", body: { ids } });
      await onSaved();
      onClose();
    });
  const remove = () =>
    confirm(`Remove ${link?.name ?? "this site"} from your Highway?`) &&
    call(async () => {
      await api(`highway/${id}`, { method: "DELETE" });
      await onSaved();
      onClose();
    });

  const preview = { id: id ?? 0, name: name || "Site", emoji, icon_mode: mode, has_icon: hasIcon ? 1 : 0, icon_v: version };
  return (
    <Modal
      title={link ? `✎ ${link.name}` : "＋ Add a site"}
      onClose={onClose}
      actions={
        <>
          {link && (
            <button className="btn danger sm" style={{ marginRight: "auto" }} disabled={busy} onClick={remove}>
              Remove
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn good" disabled={busy || !name.trim() || "error" in check} onClick={done}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {!link && ideas.length > 0 && (
        <div className="hw-ideas">
          <span className="tiny muted">Quick add:</span>
          {ideas.map((s) => (
            <button key={s.url} type="button" className="chip-btn" onClick={() => (setName(s.name), setUrl(s.url), setEmoji(s.emoji), setMode("auto"))}>
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="hw-preview">
        <SiteIcon l={preview} size={56} />
        <b>{name || "Site name"}</b>
      </div>
      <Field label="Name">
        <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gmail" />
      </Field>
      <Field label="Address" help={url && "error" in check ? check.error : "Opens in a new window when you tap it."}>
        <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="Icon">
        <div className="seg-ctl">
          {(
            [
              ["auto", "🌐 Site logo"],
              ["emoji", "😀 Emoji"],
              ["image", "🖼️ My picture"],
            ] as const
          ).map(([m, l]) => (
            <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      {mode === "auto" && (
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <span className="small ink2 grow">
            The site's own logo, fetched once and kept in your app{hasIcon ? ` (from ${LOGO_SOURCES[src]})` : ""}. Wrong one? Try another. If none is found, the emoji
            below is shown.
          </span>
          <button type="button" className="btn sm" disabled={busy || "error" in check || !name.trim()} onClick={refreshLogo}>
            {hasIcon && link?.icon_mode === "auto" ? "↻ Try another logo" : "↻ Get logo"}
          </button>
        </div>
      )}
      {mode === "image" && (
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <button type="button" className="btn sm" disabled={busy || "error" in check || !name.trim()} onClick={() => ((picMode.current = "photo"), file.current?.click())}>
            📷 Choose picture
          </button>
          <button type="button" className="btn sm violet" disabled={busy || "error" in check || !name.trim()} onClick={() => ((picMode.current = "pixel"), file.current?.click())}>
            👾 As pixel art
          </button>
          <input ref={file} type="file" accept="image/*" className="hide" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
      )}
      <Field label={mode === "emoji" ? "Emoji" : "Emoji (shown if there's no picture)"}>
        <EmojiInput value={emoji} onChange={setEmoji} />
      </Field>
      {link && all.length > 1 && (
        <Field label="Position">
          <div className="row">
            <button type="button" className="btn sm" disabled={busy || idx <= 0} onClick={() => move(-1)}>
              ◀ Earlier
            </button>
            <button type="button" className="btn sm" disabled={busy || idx >= all.length - 1} onClick={() => move(1)}>
              Later ▶
            </button>
          </div>
        </Field>
      )}
    </Modal>
  );
}
