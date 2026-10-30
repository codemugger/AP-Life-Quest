// Client-side picture preparation: resize/compress photos, or turn any picture into pixel art.
export type PicMode = "photo" | "pixel";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fail(new Error("Couldn't read that picture. Try a JPEG or PNG."));
    };
    img.src = url; // <img> applies the photo's rotation (EXIF) for us
  });
}

/** Returns a small JPEG (photo, ≤1280px or `maxSize`) or a tiny posterised PNG (pixel art, ≤40px). */
export async function prepareImage(file: File, mode: PicMode, maxSize?: number) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a picture");
  const img = await loadImage(file);
  const max = mode === "photo" ? (maxSize ?? 1280) : 40;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (mode === "photo") {
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  if (mode === "pixel") {
    // Posterise to a retro palette (6 levels per channel) and make alpha all-or-nothing.
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / 51) * 51;
      d[i + 3] = d[i + 3] < 110 ? 0 : 255;
    }
    ctx.putImageData(data, 0, 0);
  }
  const type = mode === "photo" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't process that picture"))), type, 0.82));
  return { blob, width: w, height: h };
}

export function parseImages(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x) && x > 0) : [];
  } catch {
    return [];
  }
}
