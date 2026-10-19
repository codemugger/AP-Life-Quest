// Tiny D1 helpers.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (what = "Not found") => new HttpError(404, what);

type Param = string | number | null;

/** Normalise a JS value into something D1 can bind. */
export function bindable(v: unknown): Param {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function stmt(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params.map(bindable));
}

export async function all<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]) {
  return (await stmt(db, sql, ...params).all<T>()).results;
}

export async function first<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]) {
  return (await stmt(db, sql, ...params).first<T>()) ?? null;
}

export async function run(db: D1Database, sql: string, ...params: unknown[]) {
  return stmt(db, sql, ...params).run();
}

/** INSERT statement from a plain object. Column names must come from trusted code or a whitelist. */
export function insertStmt(db: D1Database, table: string, row: Record<string, unknown>, verb = "INSERT") {
  const cols = Object.keys(row);
  const sql = `${verb} INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  return stmt(db, sql, ...cols.map((c) => row[c]));
}

export function rows<T>(res: D1Result<unknown>): T[] {
  return (res.results ?? []) as T[];
}

export function one<T>(res: D1Result<unknown>): T | null {
  return ((res.results ?? [])[0] as T) ?? null;
}

/** Cryptographically random float in [0, 1). */
export function rand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

export function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Deterministic float in [0,1) from a string (FNV-1a). Used for crits so undo/redo can't re-roll. */
export function hashFloat(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // extra avalanche
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 2 ** 32;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
