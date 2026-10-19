// Single-admin authentication: password (PBKDF2 hash stored as a Worker secret),
// optional TOTP 2FA, HttpOnly session cookies stored hashed in D1, and brute-force lockout.
import { first, run, stmt } from "./db";

export const COOKIE = "__Host-aplq_session";
const SESSION_DAYS = 30;
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_TOTAL = 40; // global backstop; per-IP limit does the real work

const enc = new TextEncoder();

function b64ToBytes(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stored format: pbkdf2$<iterations>$<salt b64>$<hash b64>  (made by `npm run set-password`). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(saltB64), iterations: Number(iterStr) },
    key,
    256,
  );
  return timingSafeEqual(new Uint8Array(bits), b64ToBytes(hashB64));
}

function base32Decode(s: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function totpAt(secret: Uint8Array, counter: number) {
  const msg = new ArrayBuffer(8);
  new DataView(msg).setUint32(4, counter);
  new DataView(msg).setUint32(0, Math.floor(counter / 2 ** 32));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Accepts the current 30s code and one step either side (clock drift). */
export async function verifyTotp(secretB32: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 30_000);
  for (const d of [-1, 0, 1]) if ((await totpAt(secret, counter + d)) === code) return true;
  return false;
}

export function cookieHeader(token: string, maxAgeSec: number) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function readCookie(header: string | null | undefined, name = COOKIE) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function createSession(db: D1Database, userAgent: string | null) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = bytesToB64url(bytes);
  const now = Date.now();
  await run(
    db,
    "INSERT INTO sessions (token_hash, created_at, expires_at, last_seen, user_agent) VALUES (?,?,?,?,?)",
    await sha256Hex(token),
    now,
    now + SESSION_DAYS * 86_400_000,
    now,
    (userAgent ?? "").slice(0, 200),
  );
  return { token, maxAge: SESSION_DAYS * 86_400 };
}

/** Returns a refreshed cookie value if the session is valid (sliding 30-day expiry), else null. */
export async function checkSession(db: D1Database, cookie: string | null | undefined) {
  const token = readCookie(cookie);
  if (!token || token.length > 100) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const s = await first<{ expires_at: number; last_seen: number }>(db, "SELECT expires_at, last_seen FROM sessions WHERE token_hash = ?", hash);
  if (!s || s.expires_at < now) return null;
  let refresh: string | null = null;
  if (now - (s.last_seen ?? 0) > 6 * 3_600_000) {
    await run(db, "UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?", now, now + SESSION_DAYS * 86_400_000, hash);
    refresh = cookieHeader(token, SESSION_DAYS * 86_400);
  }
  return { hash, refresh };
}

export async function destroySession(db: D1Database, cookie: string | null | undefined) {
  const token = readCookie(cookie);
  if (token) await run(db, "DELETE FROM sessions WHERE token_hash = ?", await sha256Hex(token));
}

export async function destroyAllSessions(db: D1Database) {
  await run(db, "DELETE FROM sessions");
}

/** null if allowed, otherwise a message explaining the lockout. */
export async function loginBlocked(db: D1Database, ip: string) {
  const since = Date.now() - WINDOW_MS;
  const [perIp, total] = await db.batch([
    stmt(db, "SELECT COUNT(*) AS c FROM login_attempts WHERE ok = 0 AND ip = ? AND ts > ?", ip, since),
    stmt(db, "SELECT COUNT(*) AS c FROM login_attempts WHERE ok = 0 AND ts > ?", since),
  ]);
  const c = (r: D1Result) => (r.results[0] as { c: number }).c;
  if (c(perIp) >= MAX_FAILS_PER_IP || c(total) >= MAX_FAILS_TOTAL)
    return "Too many wrong attempts. The castle gates are shut for 15 minutes.";
  return null;
}

export async function recordAttempt(db: D1Database, ip: string, ok: boolean) {
  await db.batch([
    stmt(db, "INSERT INTO login_attempts (ip, ts, ok) VALUES (?,?,?)", ip, Date.now(), ok ? 1 : 0),
    stmt(db, "DELETE FROM login_attempts WHERE ts < ?", Date.now() - 7 * 86_400_000),
    stmt(db, "DELETE FROM sessions WHERE expires_at < ?", Date.now()),
  ]);
}
