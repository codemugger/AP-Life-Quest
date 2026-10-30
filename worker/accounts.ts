// Accounts, invites and the character registry (in D1). Game data itself lives in each
// character's Durable Object.
import { hashPassword, passwordProblem, randomBytes, sha256Hex } from "./auth";
import { all, bad, first, HttpError, notFound, run, stmt } from "./db";

export interface User {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  totp_secret: string | null;
  totp_last: number | null;
  role: "owner" | "member";
  disabled: number;
  max_characters: number;
  last_character: string | null;
  created_at: string;
  last_login: string | null;
  highway_seeded?: number;
}

export interface CharacterRow {
  id: string;
  user_id: number;
  name: string;
  template: string | null;
  created_at: string;
  last_played: string | null;
}

export const publicUser = (u: User) => ({
  id: u.id,
  username: u.username,
  display_name: u.display_name,
  role: u.role,
  totp: !!u.totp_secret,
  max_characters: u.max_characters,
  last_character: u.last_character,
});

export function cleanUsername(raw: unknown) {
  const u = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(u)) throw bad("Username: 3–24 letters/numbers (and . _ -), starting with a letter or number");
  return u;
}

export function cleanName(raw: unknown, what = "Name") {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) throw bad(`${what} can't be empty`);
  if (s.length > 40) throw bad(`${what} is too long (max 40)`);
  return s;
}

export const userCount = async (db: D1Database) => (await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users"))?.n ?? 0;
export const userById = (db: D1Database, id: number) => first<User>(db, "SELECT * FROM users WHERE id = ?", id);
export const userByName = (db: D1Database, username: string) => first<User>(db, "SELECT * FROM users WHERE username = ?", username);

export async function createUser(
  db: D1Database,
  u: { username: string; display_name: string; password: string; role: "owner" | "member"; totp_secret?: string | null },
) {
  const why = passwordProblem(u.password);
  if (why) throw bad(why);
  if (await userByName(db, u.username)) throw new HttpError(409, "That username is taken");
  const row = await stmt(
    db,
    "INSERT INTO users (username, display_name, password_hash, totp_secret, role, max_characters) VALUES (?,?,?,?,?,?) RETURNING *",
    u.username,
    u.display_name,
    await hashPassword(u.password),
    u.totp_secret ?? null,
    u.role,
    u.role === "owner" ? 10 : 3,
  ).first<User>();
  return row!;
}

// ---------- invites ----------
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function normaliseInvite(code: unknown) {
  return String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function createInvite(db: D1Database, createdBy: number, note: string | null, days: number) {
  const bytes = randomBytes(12);
  const raw = [...bytes].map((b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
  const code = raw.match(/.{4}/g)!.join("-");
  const expires = new Date(Date.now() + Math.max(1, Math.min(60, days)) * 86_400_000).toISOString();
  await run(
    db,
    "INSERT INTO invites (code_hash, code_hint, note, created_by, expires_at) VALUES (?,?,?,?,?)",
    await sha256Hex(raw),
    raw.slice(-4),
    note ? note.slice(0, 120) : null,
    createdBy,
    expires,
  );
  return { code, expires_at: expires };
}

export async function inviteValid(db: D1Database, code: unknown) {
  const h = await sha256Hex(normaliseInvite(code));
  return !!(await first(db, "SELECT 1 AS ok FROM invites WHERE code_hash = ? AND used_by IS NULL AND revoked = 0 AND expires_at > ?", h, new Date().toISOString()));
}

/** Atomically claims an invite for a new user (only one sign-up can ever use a code). */
export async function claimInvite(db: D1Database, code: unknown, userId: number) {
  const h = await sha256Hex(normaliseInvite(code));
  const r = await run(
    db,
    "UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code_hash = ? AND used_by IS NULL AND revoked = 0 AND expires_at > ?",
    userId,
    h,
    new Date().toISOString(),
  );
  return r.meta.changes === 1;
}

export async function listInvites(db: D1Database) {
  return all(
    db,
    `SELECT i.code_hash, i.code_hint, i.note, i.created_at, i.expires_at, i.used_at, i.revoked, u.username AS used_by_name
     FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 100`,
  );
}

// ---------- characters ----------
export async function listCharacters(db: D1Database, userId: number) {
  return all<CharacterRow>(db, "SELECT * FROM characters WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at", userId);
}

export async function ownedCharacter(db: D1Database, userId: number, id: string) {
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return null;
  return first<CharacterRow>(db, "SELECT * FROM characters WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, userId);
}

export async function requireCharacter(db: D1Database, userId: number, id: string) {
  const c = await ownedCharacter(db, userId, id);
  if (!c) throw notFound("Character not found");
  return c;
}

/** Registers a character — the limit check and insert are one statement, so parallel requests can't exceed it. */
export async function registerCharacter(db: D1Database, user: User, name: string, template: string) {
  const id = crypto.randomUUID();
  const r = await run(
    db,
    `INSERT INTO characters (id, user_id, name, template)
     SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM characters WHERE user_id = ? AND deleted_at IS NULL) < ?`,
    id,
    user.id,
    name,
    template,
    user.id,
    user.max_characters,
  );
  if (!r.meta.changes) throw bad(`You can have up to ${user.max_characters} characters`);
  return id;
}

/**
 * Creates a member from an invite in ONE transaction: the account only exists if the invite was
 * valid and unused, and the invite is used up in the same step. Returns the new user id, or null.
 */
export async function joinWithInvite(db: D1Database, code: unknown, u: { username: string; display_name: string; password: string }) {
  const why = passwordProblem(u.password);
  if (why) throw bad(why);
  if (await userByName(db, u.username)) throw new HttpError(409, "That username is taken");
  const h = await sha256Hex(normaliseInvite(code));
  const now = new Date().toISOString();
  const valid = "SELECT 1 FROM invites WHERE code_hash = ? AND used_by IS NULL AND revoked = 0 AND expires_at > ?";
  try {
    const [ins] = await db.batch([
      stmt(
        db,
        `INSERT INTO users (username, display_name, password_hash, role, max_characters)
         SELECT ?, ?, ?, 'member', 3 WHERE EXISTS (${valid}) RETURNING id`,
        u.username,
        u.display_name,
        await hashPassword(u.password),
        h,
        now,
      ),
      stmt(
        db,
        `UPDATE invites SET used_by = (SELECT id FROM users WHERE username = ?), used_at = datetime('now')
         WHERE code_hash = ? AND used_by IS NULL AND revoked = 0 AND expires_at > ?`,
        u.username,
        h,
        now,
      ),
    ]);
    return (ins.results[0] as { id: number } | undefined)?.id ?? null;
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw new HttpError(409, "That username is taken");
    throw e;
  }
}

export async function getMeta(db: D1Database, key: string) {
  return (await first<{ value: string }>(db, "SELECT value FROM meta WHERE key = ?", key))?.value ?? null;
}

export async function setMeta(db: D1Database, key: string, value: string) {
  await run(db, "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value);
}
