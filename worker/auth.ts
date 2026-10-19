// Authentication primitives: PBKDF2 passwords, TOTP 2FA, HttpOnly session cookies (stored hashed),
// and brute-force lock-outs per IP and per username.
import { first, run, stmt } from "./db";

export const COOKIE = "__Host-aplq_session";
const SESSION_DAYS = 30;
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_IP = 10; // a household can share one IP
const MAX_FAILS_PER_USER = 10;
const MAX_FAILS_TOTAL = 40; // global backstop
export const PBKDF2_ITERATIONS = 10_000; // Workers free plan: ~10 ms CPU per request

const enc = new TextEncoder();

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomBytes(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sha256Hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

/** Format: pbkdf2$<iterations>$<salt b64>$<hash b64> (same as scripts/set-password.mjs). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltB64, hashB64] = (stored ?? "").split("$");
  if (algo !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;
  return timingSafeEqual(await pbkdf2(password, b64ToBytes(saltB64), Number(iterStr)), b64ToBytes(hashB64));
}

export function passwordProblem(pw: string) {
  if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters (a short phrase is easiest)";
  if (pw.length > 200) return "That password is too long";
  return null;
}

// ---------- TOTP ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
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

/** Returns the matching 30s step (current or one either side for clock drift), or null. */
export async function totpCounter(secretB32: string, code: string) {
  if (!/^\d{6}$/.test(code ?? "")) return null;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 30_000);
  for (const d of [-1, 0, 1]) if ((await totpAt(secret, counter + d)) === code) return counter + d;
  return null;
}

export async function verifyTotp(secretB32: string, code: string) {
  return (await totpCounter(secretB32, code)) !== null;
}

export function totpUri(secret: string, label: string) {
  const l = encodeURIComponent(`AP Life Quest:${label}`);
  return `otpauth://totp/${l}?secret=${secret}&issuer=${encodeURIComponent("AP Life Quest")}&digits=6&period=30`;
}

// ---------- sessions ----------
export function cookieHeader(token: string, maxAgeSec: number) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readCookie(header: string | null | undefined, name = COOKIE) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function createSession(db: D1Database, userId: number, userAgent: string | null) {
  const token = b64url(randomBytes(32));
  const now = Date.now();
  await run(
    db,
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen, user_agent) VALUES (?,?,?,?,?,?)",
    await sha256Hex(token),
    userId,
    now,
    now + SESSION_DAYS * 86_400_000,
    now,
    (userAgent ?? "").slice(0, 200),
  );
  return cookieHeader(token, SESSION_DAYS * 86_400);
}

/** Returns the user id (+ a refreshed cookie for the sliding 30-day expiry) if the session is valid. */
export async function checkSession(db: D1Database, cookie: string | null | undefined) {
  const token = readCookie(cookie);
  if (!token || token.length > 100) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const s = await first<{ user_id: number | null; expires_at: number; last_seen: number }>(
    db,
    "SELECT user_id, expires_at, last_seen FROM sessions WHERE token_hash = ?",
    hash,
  );
  if (!s || !s.user_id || s.expires_at < now) return null; // v1 sessions have no user and are ignored
  let refresh: string | null = null;
  if (now - (s.last_seen ?? 0) > 6 * 3_600_000) {
    await run(db, "UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?", now, now + SESSION_DAYS * 86_400_000, hash);
    refresh = cookieHeader(token, SESSION_DAYS * 86_400);
  }
  return { userId: s.user_id, refresh };
}

export async function destroySession(db: D1Database, cookie: string | null | undefined) {
  const token = readCookie(cookie);
  if (token) await run(db, "DELETE FROM sessions WHERE token_hash = ?", await sha256Hex(token));
}

export async function destroyUserSessions(db: D1Database, userId: number) {
  await run(db, "DELETE FROM sessions WHERE user_id = ?", userId);
}

// ---------- lock-outs ----------
/** IPv6 addresses are grouped per /64 (one connection usually owns a whole /64). */
export function ipKey(ip: string) {
  return ip.includes(":") ? `${ip.split(":").slice(0, 4).join(":")}::/64` : ip;
}

/**
 * null if allowed, otherwise a message. Buckets:
 *  - per IP: always (an attacker only locks out their own network);
 *  - per username (incl. "#setup", "#acct:<id>"): unless the device is remembered;
 *  - global backstop: real login attempts only, unless the device is remembered.
 */
export async function loginBlocked(db: D1Database, ip: string, username: string | null, trusted = false) {
  const since = Date.now() - WINDOW_MS;
  const [perIp, perUser, total] = await db.batch([
    stmt(db, "SELECT COUNT(*) AS c FROM login_attempts WHERE ok = 0 AND ip = ? AND ts > ?", ip, since),
    stmt(db, "SELECT COUNT(*) AS c FROM login_attempts WHERE ok = 0 AND username = ? AND ts > ?", username ?? "", since),
    stmt(db, "SELECT COUNT(*) AS c FROM login_attempts WHERE ok = 0 AND ts > ? AND username IS NOT NULL AND username NOT LIKE '#%'", since),
  ]);
  const c = (r: D1Result) => (r.results[0] as { c: number }).c;
  const realLogin = !!username && !username.startsWith("#");
  if (c(perIp) >= MAX_FAILS_PER_IP || (username && !trusted && c(perUser) >= MAX_FAILS_PER_USER) || (realLogin && !trusted && c(total) >= MAX_FAILS_TOTAL))
    return "Too many wrong attempts. The castle gates are shut for 15 minutes.";
  return null;
}

// ---------- remembered devices ----------
export const DEVICE_COOKIE = "__Host-aplq_device";

export async function rememberDevice(db: D1Database, userId: number) {
  const token = b64url(randomBytes(32));
  await run(db, "INSERT INTO devices (token_hash, user_id) VALUES (?, ?)", await sha256Hex(token), userId);
  return `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${365 * 86_400}`;
}

export async function knownDevice(db: D1Database, cookie: string | null | undefined, userId: number) {
  const token = readCookie(cookie, DEVICE_COOKIE);
  if (!token || token.length > 100) return false;
  return !!(await first(db, "SELECT 1 AS ok FROM devices WHERE token_hash = ? AND user_id = ?", await sha256Hex(token), userId));
}

export async function recordAttempt(db: D1Database, ip: string, ok: boolean, username: string | null) {
  await db.batch([
    stmt(db, "INSERT INTO login_attempts (ip, ts, ok, username) VALUES (?,?,?,?)", ip, Date.now(), ok ? 1 : 0, username),
    stmt(db, "DELETE FROM login_attempts WHERE ts < ?", Date.now() - 7 * 86_400_000),
    stmt(db, "DELETE FROM sessions WHERE expires_at < ?", Date.now()),
  ]);
}
