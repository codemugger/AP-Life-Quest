// Renders the home-screen icons (PNG) from the same pixel pet the app uses.  npm run icons
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { buildPet, PET_COLORS } from "../src/petgrid.ts";

const BASE = { o: "#2d2142", k: "#2d2142", w: "#ffffff", p: "#ff7aa8", r: "#e0436b", y: "#ffe066", g: "#ffb703", R: "#ff5d6c", B: "#5ab8ff" };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const c = PET_COLORS.pink;
const pal = { ...BASE, b: c.b, l: c.l, d: c.d };
const grid = buildPet(2, "happy", null);
const bg = hex("#ffe9a8"), ground = hex("#7ad37a"), groundD = hex("#4fae5a");

for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  const scale = Math.floor((size * 0.72) / 24);
  const off = Math.floor((size - 24 * scale) / 2);
  const groundY = off + 22 * scale;
  writeFileSync(`public/${file}`, png(size, (x, y) => {
    const gx = Math.floor((x - off) / scale), gy = Math.floor((y - off) / scale);
    const ch = grid[gy]?.[gx];
    if (ch && ch !== "." && pal[ch]) return hex(pal[ch]);
    if (y >= groundY) return y < groundY + scale ? groundD : ground;
    return bg;
  }));
  console.log("wrote public/" + file);
}
