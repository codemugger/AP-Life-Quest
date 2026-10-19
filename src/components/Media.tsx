// Pictures: display (auto pixel-crisp for tiny pixel art), gallery viewer, and the editor input.
import { useRef, useState, type ReactNode } from "react";
import { mediaUrl, uploadMedia } from "../api";
import { useFx } from "../fx";
import { parseImages, prepareImage, type PicMode } from "../media";
import { Modal } from "./ui";

export function MediaImg({ id, size, className = "", alt = "", fit = "cover" }: { id: number; size?: number | string; className?: string; alt?: string; fit?: "cover" | "contain" }) {
  const [pixel, setPixel] = useState(false);
  return (
    <img
      src={mediaUrl(id)}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={(e) => setPixel(e.currentTarget.naturalWidth <= 64)}
      className={`media ${pixel ? "px-art" : ""} ${className}`}
      style={{ width: size, height: size, objectFit: pixel ? "contain" : fit }}
    />
  );
}

/** A picture if there is one, otherwise the emoji. Used as the icon for quests, items, badges… */
export function IconOrEmoji({ images, emoji, size = 32, className = "" }: { images: string | null | undefined; emoji: string; size?: number; className?: string }) {
  const ids = parseImages(images);
  if (ids.length) return <MediaImg id={ids[0]} size={size} className={`icon-img ${className}`} />;
  return <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }}>{emoji}</span>;
}

/** Thumbnail strip; tap to view big. */
export function Gallery({ images, title }: { images: string | null | undefined; title?: ReactNode }) {
  const ids = parseImages(images);
  const [open, setOpen] = useState<number | null>(null);
  if (!ids.length) return null;
  return (
    <>
      <div className="gallery">
        {ids.map((id, i) => (
          <button key={id} className="thumb" onClick={() => setOpen(i)} aria-label="View picture">
            <MediaImg id={id} size="100%" />
          </button>
        ))}
      </div>
      {open !== null && (
        <Modal title={title ?? "📷"} onClose={() => setOpen(null)} wide>
          <div className="viewer">
            <MediaImg id={ids[open]} fit="contain" className="viewer-img" />
          </div>
          {ids.length > 1 && (
            <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
              <button className="btn sm" onClick={() => setOpen((open - 1 + ids.length) % ids.length)}>
                ◀
              </button>
              <span className="small muted">
                {open + 1} / {ids.length}
              </span>
              <button className="btn sm" onClick={() => setOpen((open + 1) % ids.length)}>
                ▶
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** Editor field: add photos or pixel-art pictures, reorder (first = icon/cover), remove. */
export function ImagesInput({ value, onChange, max = 6 }: { value: string | null; onChange: (v: string | null) => void; max?: number }) {
  const fx = useFx();
  const ids = parseImages(value);
  const [busy, setBusy] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const pixel = useRef<HTMLInputElement>(null);
  const save = (list: number[]) => onChange(list.length ? JSON.stringify(list) : null);
  const add = async (file: File | undefined, mode: PicMode) => {
    if (!file) return;
    setBusy(true);
    try {
      const pic = await prepareImage(file, mode);
      const id = await uploadMedia(pic.blob, pic.width, pic.height);
      save([...ids, id].slice(0, max));
    } catch (e) {
      fx.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {ids.length > 0 && (
        <div className="gallery edit">
          {ids.map((id, i) => (
            <div key={id} className="thumb">
              <MediaImg id={id} size="100%" />
              <div className="thumb-tools">
                {i > 0 && (
                  <button type="button" onClick={() => save([id, ...ids.filter((x) => x !== id)])} title="Make this the cover / icon" aria-label="Make cover">
                    ⭐
                  </button>
                )}
                <button type="button" onClick={() => save(ids.filter((x) => x !== id))} aria-label="Remove picture">
                  ✕
                </button>
              </div>
              {i === 0 && <span className="cover-tag">cover</span>}
            </div>
          ))}
        </div>
      )}
      {ids.length < max && (
        <div className="row wrap">
          <button type="button" className="btn sm" disabled={busy} onClick={() => photo.current?.click()}>
            📷 Add photo
          </button>
          <button type="button" className="btn sm violet" disabled={busy} onClick={() => pixel.current?.click()}>
            👾 Add as pixel art
          </button>
          {busy && <span className="small muted">Uploading…</span>}
        </div>
      )}
      <input ref={photo} type="file" accept="image/*" className="hide" onChange={(e) => (add(e.target.files?.[0], "photo"), (e.target.value = ""))} />
      <input ref={pixel} type="file" accept="image/*" className="hide" onChange={(e) => (add(e.target.files?.[0], "pixel"), (e.target.value = ""))} />
    </div>
  );
}

export function LinkButton({ href }: { href: string | null | undefined }) {
  if (!href) return null;
  let label = "Open link";
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    label = /youtube|youtu\.be/.test(host) ? "▶ Watch" : /maps|goo\.gl/.test(host) ? "📍 Map" : `🔗 ${host}`;
  } catch {}
  return (
    <a className="btn sm" href={href} target="_blank" rel="noopener noreferrer nofollow">
      {label}
    </a>
  );
}
