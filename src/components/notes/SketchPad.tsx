// Draw with a finger, mouse or Apple Pencil (pressure-aware). Saves into the note as a picture;
// an existing sketch can be opened again and drawn over.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { mediaUrl, uploadMedia } from "../../api";
import { useFx } from "../../fx";
import { Modal } from "../ui";

const INKS = ["#2d2142", "#e5484d", "#ff8a3d", "#f5c400", "#23a86b", "#2f8fdd", "#7c5cff", "#ff6fae", "#ffffff"];
const SIZES = [2, 5, 11];
const MAX_UNDO = 25;

export function SketchPad({ from, onDone, onClose }: { from?: number | null; onDone: (media: number, w: number, h: number) => void; onClose: () => void }) {
  const fx = useFx();
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState(INKS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);
  const [paper, setPaper] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const undo = useRef<ImageData[]>([]);
  const drawing = useRef<{ x: number; y: number; id: number } | null>(null);

  // Size the canvas once (to the screen, up to 2× for crisp lines) and load the old sketch if any.
  useEffect(() => {
    const c = canvas.current!;
    const box = wrap.current!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(280, Math.floor(box.width));
    const h = Math.max(240, Math.floor(Math.min(window.innerHeight * 0.58, w * 0.75)));
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (from) {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
        ctx.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      };
      img.src = mediaUrl(from);
    }
  }, [from]);

  const ctx = () => canvas.current!.getContext("2d")!;
  const point = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const width = (e: ReactPointerEvent) => (e.pointerType === "pen" && e.pressure > 0 ? size * (0.35 + e.pressure * 1.3) : size);

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawing.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = canvas.current!;
    undo.current.push(ctx().getImageData(0, 0, c.width, c.height));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    const p = point(e);
    drawing.current = { ...p, id: e.pointerId };
    const g = ctx();
    g.globalCompositeOperation = erase ? "destination-out" : "source-over";
    g.fillStyle = ink;
    g.beginPath();
    g.arc(p.x, p.y, (erase ? size * 2.5 : width(e)) / 2, 0, Math.PI * 2);
    g.fill();
    setDirty(true);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    const g = ctx();
    // pencils report many points per frame; use them all for smooth lines
    const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[];
    for (const ev of events) {
      const r = canvas.current!.getBoundingClientRect();
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      g.strokeStyle = ink;
      g.lineWidth = erase ? size * 2.5 : ev.pointerType === "pen" && ev.pressure > 0 ? size * (0.35 + ev.pressure * 1.3) : size;
      g.beginPath();
      g.moveTo(d.x, d.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      d.x = p.x;
      d.y = p.y;
    }
  };
  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawing.current?.id === e.pointerId) drawing.current = null;
  };

  const doUndo = () => {
    const last = undo.current.pop();
    if (last) ctx().putImageData(last, 0, 0);
  };
  const clear = () => {
    const c = canvas.current!;
    undo.current.push(ctx().getImageData(0, 0, c.width, c.height));
    ctx().clearRect(0, 0, c.width, c.height);
    setDirty(true);
  };

  const save = async () => {
    const c = canvas.current!;
    setBusy(true);
    try {
      // flatten onto paper (or keep transparent), as PNG; fall back to JPEG if it's huge
      const out = document.createElement("canvas");
      out.width = c.width;
      out.height = c.height;
      const o = out.getContext("2d")!;
      if (paper) {
        o.fillStyle = "#fffdf6";
        o.fillRect(0, 0, out.width, out.height);
      }
      o.drawImage(c, 0, 0);
      const blob = (type: string) => new Promise<Blob>((ok, fail) => out.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't save the sketch"))), type, 0.86));
      let b = await blob("image/png");
      if (b.size > 1_400_000) {
        o.globalCompositeOperation = "destination-over";
        o.fillStyle = "#ffffff";
        o.fillRect(0, 0, out.width, out.height);
        b = await blob("image/jpeg");
      }
      const id = await uploadMedia(b, out.width, out.height);
      onDone(id, out.width, out.height);
    } catch (e) {
      fx.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="✏️ Sketch" wide onClose={() => (!dirty || confirm("Throw this sketch away?")) && onClose()}>
      <div className="sketch-tools row wrap">
        {INKS.map((c) => (
          <button key={c} type="button" className={`ink-btn ${ink === c && !erase ? "on" : ""}`} style={{ background: c }} onClick={() => (setInk(c), setErase(false))} aria-label={`Ink ${c}`} />
        ))}
        <span className="grow" />
        {SIZES.map((s) => (
          <button key={s} type="button" className={`btn xs ${size === s ? "gold" : ""}`} onClick={() => setSize(s)} aria-label={`Pen size ${s}`}>
            <span className="dot" style={{ width: s + 4, height: s + 4 }} />
          </button>
        ))}
        <button type="button" className={`btn xs ${erase ? "gold" : ""}`} onClick={() => setErase(!erase)} title="Eraser">
          🧽
        </button>
        <button type="button" className="btn xs" onClick={doUndo} title="Undo">
          ↶
        </button>
        <button type="button" className="btn xs" onClick={clear} title="Clear">
          🗑
        </button>
      </div>
      <div ref={wrap} className={`sketch-wrap ${paper ? "paper" : ""}`}>
        <canvas ref={canvas} className="sketch-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      <div className="row between wrap" style={{ marginTop: 10 }}>
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} /> Paper background
        </label>
        <div className="row">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn good" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "✓ Done"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
