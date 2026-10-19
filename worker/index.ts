// AP Life Quest v2 — Cloudflare Worker: accounts, invites, characters, admin, and a secure proxy
// to each character's private Durable Object database (worker/character.ts).
import { Hono, type Context } from "hono";
import { EYES, SPECIES } from "../shared/levels";
import { isPetColor } from "../shared/petgrid";
import {
  claimInvite,
  cleanName,
  cleanUsername,
  createInvite,
  createUser,
  getMeta,
  inviteValid,
  listCharacters,
  listInvites,
  publicUser,
  registerCharacter,
  requireCharacter,
  setMeta,
  userById,
  userByName,
  userCount,
  type User,
} from "./accounts";
import {
  checkSession,
  clearCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  hashPassword,
  loginBlocked,
  newTotpSecret,
  passwordProblem,
  randomBytes,
  recordAttempt,
  totpUri,
  verifyPassword,
  verifyTotp,
} from "./auth";
import { exportJson } from "./backup";
import { CharacterDO, contentFromCopy } from "./character";
import { all, bad, first, HttpError, run } from "./db";
import { TEMPLATES } from "./seed";

export { CharacterDO };

export interface Env {
  DB: D1Database;
  CHAR: DurableObjectNamespace<CharacterDO>;
  /** v1 admin password; in v2 it's the one-time "setup password" that claims the owner account. */
  ADMIN_PASSWORD_HASH?: string;
  TOTP_SECRET?: string;
}

type AppEnv = { Bindings: Env; Variables: { user: User } };
type C = Context<AppEnv>;
const app = new Hono<AppEnv>();

const ip = (c: C) => c.req.header("cf-connecting-ip") ?? "local";
const body = <T = Record<string, any>>(c: C) => c.req.json<T>().catch(() => ({}) as T);
const stub = (env: Env, id: string) => env.CHAR.get(env.CHAR.idFromName(id));

/** Calls one of a character DO's internal operations (never reachable from the internet). */
async function internal<T = any>(env: Env, id: string, op: string, payload?: unknown): Promise<T> {
  const res = await stub(env, id).fetch(`https://character/__internal/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload === undefined ? "{}" : JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 500, data?.error ?? `Character ${op} failed`);
  return data as T;
}

// ---------- security headers + CSRF guard on every API response ----------
app.use("/api/*", async (c, next) => {
  try {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      // Custom header => browsers must preflight cross-site requests, which we never allow.
      if (c.req.header("x-requested-with") !== "aplq") throw new HttpError(403, "Bad request origin");
      const origin = c.req.header("origin");
      if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, "Bad request origin");
    }
    await next();
  } finally {
    // Always drain unread request bodies so keep-alive connections stay healthy.
    if (c.req.raw.body && !c.req.raw.bodyUsed) await c.req.raw.arrayBuffer().catch(() => undefined);
  }
  if (!c.res.headers.get("Cache-Control")) c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
});

// ---------- public: who am I, owner setup, login, invites ----------
app.get("/api/auth/me", async (c) => {
  const s = await checkSession(c.env.DB, c.req.header("cookie"));
  let user = s ? await userById(c.env.DB, s.userId) : null;
  if (user?.disabled) user = null;
  if (s?.refresh && user) c.header("Set-Cookie", s.refresh);
  const users = await userCount(c.env.DB);
  return c.json({
    authed: !!user,
    user: user ? publicUser(user) : null,
    needs_setup: users === 0,
    setup_ready: !!c.env.ADMIN_PASSWORD_HASH,
    setup_needs_code: !!c.env.TOTP_SECRET,
  });
});

/** First run: the setup password (npm run set-password) creates the owner account. */
app.post("/api/auth/setup", async (c) => {
  if ((await userCount(c.env.DB)) > 0) throw new HttpError(409, "This castle already has an owner");
  if (!c.env.ADMIN_PASSWORD_HASH) throw new HttpError(503, "Set a setup password first: npm run set-password");
  const blocked = await loginBlocked(c.env.DB, ip(c), "#setup");
  if (blocked) throw new HttpError(429, blocked);
  const b = await body(c);
  let ok = await verifyPassword(String(b.setup_password ?? "").slice(0, 200), c.env.ADMIN_PASSWORD_HASH);
  if (ok && c.env.TOTP_SECRET) ok = await verifyTotp(c.env.TOTP_SECRET, String(b.code ?? "").trim());
  await recordAttempt(c.env.DB, ip(c), ok, "#setup");
  if (!ok) throw new HttpError(401, "Wrong setup password or code");
  const username = cleanUsername(b.username);
  const display = cleanName(b.display_name, "Display name");
  const why = passwordProblem(b.password);
  if (why) throw bad(why);
  // Atomic: only succeeds while there are no users at all.
  const row = await c.env.DB.prepare(
    `INSERT INTO users (username, display_name, password_hash, totp_secret, role, max_characters)
     SELECT ?, ?, ?, ?, 'owner', 10 WHERE NOT EXISTS (SELECT 1 FROM users) RETURNING id`,
  )
    .bind(username, display, await hashPassword(b.password), c.env.TOTP_SECRET ?? null)
    .first<{ id: number }>();
  if (!row) throw new HttpError(409, "This castle already has an owner");
  c.header("Set-Cookie", await createSession(c.env.DB, row.id, c.req.header("user-agent") ?? null));
  return c.json({ ok: true });
});

app.post("/api/auth/login", async (c) => {
  const b = await body(c);
  const uname = String(b.username ?? "").trim().toLowerCase().slice(0, 40);
  const blocked = await loginBlocked(c.env.DB, ip(c), uname);
  if (blocked) throw new HttpError(429, blocked);
  const u = uname ? await userByName(c.env.DB, uname) : null;
  const pw = String(b.password ?? "").slice(0, 200);
  // Always do the hashing work so timing doesn't reveal which usernames exist.
  let ok = await verifyPassword(pw, u?.password_hash ?? "pbkdf2$10000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  ok = ok && !!u && !u.disabled;
  if (ok && u!.totp_secret) {
    const code = String(b.code ?? "").trim();
    if (!code) return c.json({ error: "Enter the 6-digit code from your authenticator", need_code: true }, 401);
    ok = await verifyTotp(u!.totp_secret, code);
  }
  await recordAttempt(c.env.DB, ip(c), ok, uname);
  if (!ok) throw new HttpError(401, "Wrong username, password or code");
  await run(c.env.DB, "UPDATE users SET last_login = datetime('now') WHERE id = ?", u!.id);
  c.header("Set-Cookie", await createSession(c.env.DB, u!.id, c.req.header("user-agent") ?? null));
  return c.json({ ok: true });
});

app.post("/api/auth/logout", async (c) => {
  await destroySession(c.env.DB, c.req.header("cookie"));
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

app.get("/api/auth/invite/:code", async (c) => {
  const blocked = await loginBlocked(c.env.DB, ip(c), null);
  if (blocked) throw new HttpError(429, blocked);
  const valid = await inviteValid(c.env.DB, c.req.param("code"));
  if (!valid) await recordAttempt(c.env.DB, ip(c), false, null);
  return c.json({ valid });
});

app.post("/api/auth/join", async (c) => {
  const blocked = await loginBlocked(c.env.DB, ip(c), null);
  if (blocked) throw new HttpError(429, blocked);
  const b = await body(c);
  if (!(await inviteValid(c.env.DB, b.code))) {
    await recordAttempt(c.env.DB, ip(c), false, null);
    throw bad("This invite code is invalid, expired or already used");
  }
  const user = await createUser(c.env.DB, {
    username: cleanUsername(b.username),
    display_name: cleanName(b.display_name, "Display name"),
    password: String(b.password ?? ""),
    role: "member",
  });
  if (!(await claimInvite(c.env.DB, b.code, user.id))) {
    await run(c.env.DB, "DELETE FROM users WHERE id = ?", user.id);
    throw new HttpError(409, "That invite was just used by someone else");
  }
  c.header("Set-Cookie", await createSession(c.env.DB, user.id, c.req.header("user-agent") ?? null));
  return c.json({ ok: true });
});

// ---------- everything below requires a logged-in, enabled user ----------
const PUBLIC = new Set(["/api/auth/me", "/api/auth/setup", "/api/auth/login", "/api/auth/logout", "/api/auth/join"]);
app.use("/api/*", async (c, next) => {
  if (PUBLIC.has(c.req.path) || c.req.path.startsWith("/api/auth/invite/")) return next();
  const s = await checkSession(c.env.DB, c.req.header("cookie"));
  const user = s ? await userById(c.env.DB, s.userId) : null;
  if (!s || !user || user.disabled) throw new HttpError(401, "Please log in");
  c.set("user", user);
  await next();
  if (s.refresh) c.header("Set-Cookie", s.refresh, { append: true });
});

const ownerOnly = (c: C) => {
  if (c.get("user").role !== "owner") throw new HttpError(403, "Only the owner can do that");
};

// ---------- my account ----------
async function legacyAvailable(env: Env) {
  if (await getMeta(env.DB, "legacy_imported")) return false;
  const n = await first<{ n: number }>(env.DB, "SELECT COUNT(*) AS n FROM settings").catch(() => null);
  return (n?.n ?? 0) > 0;
}

app.get("/api/account", async (c) => {
  const user = c.get("user");
  const chars = await listCharacters(c.env.DB, user.id);
  const characters = await Promise.all(
    chars.map(async (ch) => ({ ...ch, summary: await internal(c.env, ch.id, "summary").catch(() => null) })),
  );
  const templates = Object.entries(TEMPLATES)
    .filter(([, t]) => !t.ownerOnly || user.role === "owner")
    .map(([id, t]) => ({ id, name: t.name, description: t.description }));
  return c.json({
    user: publicUser(user),
    characters,
    templates,
    legacy: user.role === "owner" && (await legacyAvailable(c.env)),
  });
});

app.put("/api/account", async (c) => {
  const b = await body(c);
  await run(c.env.DB, "UPDATE users SET display_name = ? WHERE id = ?", cleanName(b.display_name, "Display name"), c.get("user").id);
  return c.json({ ok: true });
});

app.post("/api/account/password", async (c) => {
  const user = c.get("user");
  const b = await body(c);
  if (!(await verifyPassword(String(b.current ?? ""), user.password_hash))) throw new HttpError(401, "Current password is wrong");
  const why = passwordProblem(b.next);
  if (why) throw bad(why);
  await run(c.env.DB, "UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(b.next), user.id);
  await destroyUserSessions(c.env.DB, user.id); // log out every other device…
  c.header("Set-Cookie", await createSession(c.env.DB, user.id, c.req.header("user-agent") ?? null)); // …but not this one
  return c.json({ ok: true });
});

app.post("/api/account/totp/start", async (c) => {
  const secret = newTotpSecret();
  return c.json({ secret, uri: totpUri(secret, c.get("user").username) });
});

app.post("/api/account/totp/enable", async (c) => {
  const b = await body(c);
  const secret = String(b.secret ?? "").toUpperCase();
  if (!/^[A-Z2-7]{16,64}$/.test(secret)) throw bad("Bad setup key");
  if (!(await verifyTotp(secret, String(b.code ?? "").trim()))) throw bad("That code didn't match. Check your phone's clock and try the newest code.");
  await run(c.env.DB, "UPDATE users SET totp_secret = ? WHERE id = ?", secret, c.get("user").id);
  return c.json({ ok: true });
});

app.post("/api/account/totp/disable", async (c) => {
  const b = await body(c);
  if (!(await verifyPassword(String(b.password ?? ""), c.get("user").password_hash))) throw new HttpError(401, "Wrong password");
  await run(c.env.DB, "UPDATE users SET totp_secret = NULL WHERE id = ?", c.get("user").id);
  return c.json({ ok: true });
});

app.post("/api/account/logout-all", async (c) => {
  await destroyUserSessions(c.env.DB, c.get("user").id);
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

app.delete("/api/account", async (c) => {
  const user = c.get("user");
  if (user.role === "owner") throw bad("The owner account can't be deleted");
  const b = await body(c);
  if (!(await verifyPassword(String(b.password ?? ""), user.password_hash))) throw new HttpError(401, "Wrong password");
  for (const ch of await listCharacters(c.env.DB, user.id)) await internal(c.env, ch.id, "destroy").catch(() => undefined);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE characters SET deleted_at = datetime('now') WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});

// ---------- characters ----------
app.post("/api/characters", async (c) => {
  const user = c.get("user");
  const b = await body(c);
  const name = cleanName(b.name, "Name");
  const pet = cleanName(b.pet_name || "Mochi", "Pet name");
  const looks = (b.looks ?? {}) as Record<string, string>;
  const species = looks.species ?? "cat";
  const eyes = looks.eyes ?? "dot";
  const color = looks.color ?? "pink";
  if (!SPECIES.some((s) => s.id === species)) throw bad("Unknown species");
  if (!EYES.some((s) => s.id === eyes)) throw bad("Unknown eye style");
  if (!isPetColor(color)) throw bad("Unknown colour");
  const keep: Record<string, unknown> = { player_name: name, pet_name: pet, pet_species: species, pet_eyes: eyes, pet_color: color };
  let content: ReturnType<typeof contentFromCopy> | undefined;
  let template: string;
  if (b.copy_from) {
    const src = await requireCharacter(c.env.DB, user.id, String(b.copy_from));
    const cfg = await internal<{ tables: Record<string, Record<string, unknown>[]>; settings: Record<string, unknown> }>(c.env, src.id, "export-config");
    content = contentFromCopy(cfg);
    template = String(cfg.settings.template ?? "starter");
    Object.assign(keep, { height_m: cfg.settings.height_m, timezone: cfg.settings.timezone });
  } else {
    template = String(b.template ?? "starter");
    const t = TEMPLATES[template];
    if (!t || (t.ownerOnly && user.role !== "owner")) throw bad("Unknown template");
  }
  keep.template = template;
  const id = await registerCharacter(c.env.DB, user, name, b.copy_from ? `copy:${template}` : template);
  try {
    await internal(c.env, id, "init", { keep, content });
  } catch (e) {
    await run(c.env.DB, "UPDATE characters SET deleted_at = datetime('now') WHERE id = ?", id);
    throw e;
  }
  await run(c.env.DB, "UPDATE users SET last_character = ? WHERE id = ?", id, user.id);
  return c.json({ ok: true, id });
});

app.post("/api/characters/:cid/select", async (c) => {
  const ch = await requireCharacter(c.env.DB, c.get("user").id, c.req.param("cid"));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET last_character = ? WHERE id = ?").bind(ch.id, c.get("user").id),
    c.env.DB.prepare("UPDATE characters SET last_played = datetime('now') WHERE id = ?").bind(ch.id),
  ]);
  return c.json({ ok: true });
});

app.delete("/api/characters/:cid", async (c) => {
  const user = c.get("user");
  const ch = await requireCharacter(c.env.DB, user.id, c.req.param("cid"));
  const b = await body(c);
  if (String(b.confirm ?? "").trim().toLowerCase() !== ch.name.toLowerCase()) throw bad(`Type the character's name (${ch.name}) to confirm`);
  await internal(c.env, ch.id, "destroy");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE characters SET deleted_at = datetime('now') WHERE id = ?").bind(ch.id),
    c.env.DB.prepare("UPDATE users SET last_character = NULL WHERE id = ? AND last_character = ?").bind(user.id, ch.id),
  ]);
  return c.json({ ok: true });
});

/** One-time: turn the v1 single-player save (in D1) into the owner's first character. */
app.post("/api/legacy/import", async (c) => {
  ownerOnly(c);
  if (!(await legacyAvailable(c.env))) throw bad("There's no v1 save to import (or it was already imported)");
  const user = c.get("user");
  const data = JSON.parse(await exportJson(c.env.DB));
  const legacyName = (() => {
    const row = (data.tables.settings as { key: string; value: string }[]).find((r) => r.key === "player_name");
    try {
      return row ? String(JSON.parse(row.value)) : null;
    } catch {
      return null;
    }
  })();
  const id = await registerCharacter(c.env.DB, user, cleanName(legacyName || user.display_name), "anson");
  await internal(c.env, id, "import", data);
  await setMeta(c.env.DB, "legacy_imported", id);
  await run(c.env.DB, "UPDATE users SET last_character = ? WHERE id = ?", id, user.id);
  return c.json({ ok: true, id });
});

// ---------- the game: /api/c/<character>/... → that character's private database ----------
app.all("/api/c/:cid/*", async (c) => {
  const ch = await requireCharacter(c.env.DB, c.get("user").id, c.req.param("cid"));
  const url = new URL(c.req.url);
  const rest = url.pathname.split("/").slice(4).join("/");
  url.pathname = `/api/${rest}`;
  // Buffer the body (max ~1.5 MB pictures) so the incoming request is always fully consumed.
  const method = c.req.method;
  const payload = method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer();
  const res = await stub(c.env, ch.id).fetch(url.toString(), { method, headers: c.req.raw.headers, body: payload });
  if (rest === "process" && res.ok)
    c.executionCtx.waitUntil(run(c.env.DB, "UPDATE characters SET last_played = datetime('now') WHERE id = ?", ch.id).catch(() => undefined));
  return new Response(res.body, res); // copy so headers stay mutable
});

// ---------- owner admin ----------
app.get("/api/admin/overview", async (c) => {
  ownerOnly(c);
  const users = await all(
    c.env.DB,
    `SELECT u.id, u.username, u.display_name, u.role, u.disabled, u.max_characters, u.created_at, u.last_login, u.totp_secret IS NOT NULL AS totp,
       (SELECT COUNT(*) FROM characters ch WHERE ch.user_id = u.id AND ch.deleted_at IS NULL) AS characters
     FROM users u ORDER BY u.id`,
  );
  return c.json({ users, invites: await listInvites(c.env.DB) });
});

app.post("/api/admin/invites", async (c) => {
  ownerOnly(c);
  const b = await body(c);
  const inv = await createInvite(c.env.DB, c.get("user").id, b.note ? String(b.note) : null, Number(b.days) || 14);
  return c.json({ ok: true, ...inv });
});

app.delete("/api/admin/invites/:hash", async (c) => {
  ownerOnly(c);
  await run(c.env.DB, "UPDATE invites SET revoked = 1 WHERE code_hash = ? AND used_by IS NULL", c.req.param("hash"));
  return c.json({ ok: true });
});

app.put("/api/admin/users/:id", async (c) => {
  ownerOnly(c);
  const target = await userById(c.env.DB, Number(c.req.param("id")));
  if (!target) throw new HttpError(404, "User not found");
  if (target.role === "owner") throw bad("You can't change the owner here");
  const b = await body(c);
  if (b.disabled !== undefined) {
    await run(c.env.DB, "UPDATE users SET disabled = ? WHERE id = ?", b.disabled ? 1 : 0, target.id);
    if (b.disabled) await destroyUserSessions(c.env.DB, target.id);
  }
  if (b.max_characters !== undefined) {
    const n = Math.round(Number(b.max_characters));
    if (!(n >= 1 && n <= 50)) throw bad("Max characters must be 1–50");
    await run(c.env.DB, "UPDATE users SET max_characters = ? WHERE id = ?", n, target.id);
  }
  return c.json({ ok: true });
});

app.post("/api/admin/users/:id/reset-password", async (c) => {
  ownerOnly(c);
  const target = await userById(c.env.DB, Number(c.req.param("id")));
  if (!target) throw new HttpError(404, "User not found");
  if (target.role === "owner") throw bad("Change your own password in Account");
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const temp = [...randomBytes(14)].map((x) => alphabet[x % alphabet.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
  await run(c.env.DB, "UPDATE users SET password_hash = ?, totp_secret = NULL WHERE id = ?", await hashPassword(temp), target.id);
  await destroyUserSessions(c.env.DB, target.id);
  return c.json({ ok: true, temp });
});

app.all("/api/*", () => {
  throw new HttpError(404, "No such endpoint");
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: "Something went wrong on the server" }, 500);
});

export default app;
