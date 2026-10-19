// AP Life Quest — Cloudflare Worker API.
import { Hono, type Context } from "hono";
import { EDITABLE_SETTINGS, DEFAULT_SETTINGS } from "../shared/rules";
import { HATS } from "../shared/levels";
import {
  checkSession,
  cookieHeader,
  COOKIE,
  createSession,
  destroyAllSessions,
  destroySession,
  loginBlocked,
  recordAttempt,
  verifyPassword,
  verifyTotp,
} from "./auth";
import { all, bad, HttpError } from "./db";
import {
  completeQuest,
  finalize,
  loadCtx,
  processDays,
  setMetric,
  settingStmt,
  startFast,
  stopFast,
  uncompleteQuest,
  voidLedger,
  award,
  type Ctx,
} from "./game";
import { openChest, purchase, resolveObligation, useItem } from "./economy";
import { setGoalStatus, toggleMilestone, toggleTask } from "./progress";
import { claimAchievement } from "./achievements";
import { createRow, deleteRow, updateRow, ENTITIES } from "./crud";
import { buildState } from "./state";
import { createSnapshot, exportJson, factoryReset, importAll, maybeAutoSnapshot, restoreSnapshot, seasonReset, snapshotJson } from "./backup";

export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD_HASH?: string;
  TOTP_SECRET?: string;
}

const VERSION = "1.0.0";

/** Allowed ranges for numeric settings. */
const RANGES: Record<string, [number, number]> = {
  height_m: [0.5, 2.5],
  day_start_hour: [0, 23],
  grace_hours: [0, 48],
  max_hp: [10, 1000],
  crit_chance: [0, 1],
  crit_mult: [1, 10],
  streak_threshold: [0, 1],
  streak_bonus_per_day: [0, 1],
  streak_bonus_cap: [0, 10],
  complete_heal: [0, 100],
  perfect_day_heal: [0, 100],
  perfect_day_chest_chance: [0, 1],
  faint_ap_pct: [0, 1],
  faint_min_ap: [0, 100000],
  revive_quests: [1, 50],
  revive_hp: [1, 1000],
  fainted_earn_mult: [0, 1],
};

type C = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();

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
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
});

// ---------- auth (public) ----------
app.get("/api/auth/me", async (c) => {
  const s = await checkSession(c.env.DB, c.req.header("cookie"));
  if (s?.refresh) c.header("Set-Cookie", s.refresh);
  return c.json({ authed: !!s, configured: !!c.env.ADMIN_PASSWORD_HASH, totp: !!c.env.TOTP_SECRET });
});

app.post("/api/auth/login", async (c) => {
  if (!c.env.ADMIN_PASSWORD_HASH) throw new HttpError(503, "No password set yet. Run: npm run set-password");
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const blocked = await loginBlocked(c.env.DB, ip);
  if (blocked) throw new HttpError(429, blocked);
  const body = await c.req.json<{ password?: string; code?: string }>().catch(() => ({}) as { password?: string; code?: string });
  const password = String(body.password ?? "").slice(0, 200);
  let ok = password.length > 0 && (await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH));
  if (ok && c.env.TOTP_SECRET) ok = await verifyTotp(c.env.TOTP_SECRET, String(body.code ?? "").trim());
  await recordAttempt(c.env.DB, ip, ok);
  if (!ok) throw new HttpError(401, c.env.TOTP_SECRET ? "Wrong password or code" : "Wrong password");
  const { token, maxAge } = await createSession(c.env.DB, c.req.header("user-agent") ?? null);
  c.header("Set-Cookie", cookieHeader(token, maxAge));
  return c.json({ ok: true });
});

app.post("/api/auth/logout", async (c) => {
  await destroySession(c.env.DB, c.req.header("cookie"));
  c.header("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return c.json({ ok: true });
});

// ---------- everything below requires a session ----------
const PUBLIC = new Set(["/api/auth/me", "/api/auth/login", "/api/auth/logout"]);
app.use("/api/*", async (c, next) => {
  if (PUBLIC.has(c.req.path)) return next();
  const s = await checkSession(c.env.DB, c.req.header("cookie"));
  if (!s) throw new HttpError(401, "Please log in");
  await next();
  if (s.refresh) c.header("Set-Cookie", s.refresh, { append: true });
});

app.post("/api/auth/logout-all", async (c) => {
  await destroyAllSessions(c.env.DB);
  c.header("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return c.json({ ok: true });
});

/** Run a mutation inside a game context, then finalize (level-ups, achievements, faint) and return effects. */
async function act(c: C, fn: (ctx: Ctx, body: Record<string, any>) => Promise<unknown>) {
  const body = c.req.method === "GET" ? {} : await c.req.json<Record<string, any>>().catch(() => ({}));
  const ctx = await loadCtx(c.env.DB);
  const data = await fn(ctx, body ?? {});
  await finalize(ctx);
  return c.json({ ok: true, fx: ctx.fx, data: data ?? null });
}

const id = (c: C) => {
  const n = Number(c.req.param("id"));
  if (!Number.isInteger(n) || n <= 0) throw bad("Bad id");
  return n;
};

app.get("/api/state", async (c) => {
  const ctx = await loadCtx(c.env.DB);
  return c.json(await buildState(ctx, VERSION));
});

/** Closes finished days (penalties/streaks/billing). The UI calls this until remaining = 0. */
app.post("/api/process", async (c) => {
  const ctx = await loadCtx(c.env.DB);
  const remaining = await processDays(ctx);
  await finalize(ctx);
  if (remaining === 0)
    c.executionCtx.waitUntil(maybeAutoSnapshot(ctx).catch((e) => console.error("weekly auto-save failed", e)));
  return c.json({ ok: true, fx: ctx.fx, remaining });
});

// quests
app.post("/api/quests/:id/complete", (c) => act(c, (ctx, b) => completeQuest(ctx, id(c), { date: b.date, qty: b.qty })));
app.post("/api/quests/:id/undo", (c) => act(c, (ctx, b) => uncompleteQuest(ctx, id(c), b.date)));
app.post("/api/quests/clear-done", (c) =>
  act(c, async (ctx) => {
    await ctx.db
      .prepare("UPDATE quests SET active = 0 WHERE type = 'todo' AND active = 1 AND id IN (SELECT quest_id FROM quest_log)")
      .run();
  }),
);

// trackers
app.post("/api/metrics/:key/log", (c) =>
  act(c, (ctx, b) => setMetric(ctx, c.req.param("key"), { date: b.date, value: b.value, mode: b.mode, note: b.note })),
);
app.get("/api/history/:key", async (c) =>
  c.json(await all(c.env.DB, "SELECT date, value, note FROM metric_values WHERE metric_key = ? ORDER BY date", c.req.param("key"))),
);
app.post("/api/fast/start", (c) => act(c, (ctx) => startFast(ctx)));
app.post("/api/fast/stop", (c) => act(c, (ctx, b) => stopFast(ctx, !!b.cancel)));

// shop & inventory
app.post("/api/shop/buy", (c) =>
  act(c, (ctx, b) => purchase(ctx, { item_id: Number(b.item_id), qty: b.qty, voucher_id: b.voucher_id, note: b.note, use_now: !!b.use_now })),
);
app.post("/api/items/:id/use", (c) => act(c, (ctx, b) => useItem(ctx, id(c), { qty: b.qty, note: b.note })));
app.post("/api/obligations/:id/resolve", (c) =>
  act(c, (ctx, b) => {
    if (!["use", "buy", "waive"].includes(b.method)) throw bad("Unknown method");
    return resolveObligation(ctx, id(c), b.method, b.voucher_id);
  }),
);
app.post("/api/chests/:id/open", (c) => act(c, (ctx) => openChest(ctx, id(c))));

// goals & sprints
app.post("/api/goals/:id/status", (c) =>
  act(c, (ctx, b) => {
    if (!["done", "active", "dropped"].includes(b.status)) throw bad("Unknown status");
    return setGoalStatus(ctx, id(c), b.status);
  }),
);
app.post("/api/milestones/:id/toggle", (c) => act(c, (ctx) => toggleMilestone(ctx, id(c))));
app.post("/api/sprint_tasks/:id/toggle", (c) => act(c, (ctx) => toggleTask(ctx, id(c))));
app.post("/api/achievements/:id/claim", (c) => act(c, (ctx) => claimAchievement(ctx, id(c))));

// ledger
app.post("/api/ledger/:id/void", (c) => act(c, (ctx) => voidLedger(ctx, id(c))));
app.post("/api/ledger/adjust", (c) =>
  act(c, async (ctx, b) => {
    const n = (v: unknown) => Math.max(-1e6, Math.min(1e6, Math.round(Number(v) || 0)));
    const ap = n(b.ap);
    const xp = n(b.xp);
    const hp = n(b.hp);
    if (!ap && !xp && !hp) throw bad("Nothing to adjust");
    const description = String(b.description ?? "").trim().slice(0, 200) || "Manual adjustment";
    await award(ctx, { kind: "adjust", ap, xp, hp, source: "manual", description });
  }),
);

// settings
app.put("/api/settings", (c) =>
  act(c, async (ctx, b) => {
    const stmts: D1PreparedStatement[] = [];
    for (const [k, v] of Object.entries(b)) {
      if (!EDITABLE_SETTINGS.includes(k)) throw bad(`Unknown setting: ${k}`);
      const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
      let val: unknown = v;
      if (typeof def === "number") {
        val = Number(v);
        if (!Number.isFinite(val as number)) throw bad(`${k} must be a number`);
        const range = RANGES[k];
        if (range && ((val as number) < range[0] || (val as number) > range[1])) throw bad(`${k} must be between ${range[0]} and ${range[1]}`);
      } else if (typeof def === "boolean") val = !!v;
      else if (Array.isArray(def)) {
        if (!Array.isArray(v)) throw bad(`${k} must be a list`);
        val = k === "hats" ? v.filter((h) => HATS.some((x) => x.id === h)) : v;
      } else if (v !== null) val = String(v).slice(0, 200);
      if (k === "hat" && val && !ctx.s.hats.includes(String(val))) throw bad("You haven't unlocked that hat yet");
      if (k === "timezone") {
        try {
          new Intl.DateTimeFormat("en", { timeZone: String(val) });
        } catch {
          throw bad("Unknown timezone");
        }
      }
      stmts.push(settingStmt(ctx, k, val));
    }
    if (stmts.length) await ctx.db.batch(stmts);
  }),
);

// generic config CRUD: /api/data/<collection>[/<id>]
app.post("/api/data/:entity", (c) => act(c, (ctx, b) => createRow(ctx, c.req.param("entity"), b).then((pk) => ({ id: pk }))));
app.put("/api/data/:entity/:pk", (c) => act(c, (ctx, b) => updateRow(ctx, c.req.param("entity"), c.req.param("pk"), b)));
app.delete("/api/data/:entity/:pk", (c) => act(c, (ctx) => deleteRow(ctx, c.req.param("entity"), c.req.param("pk"))));
app.get("/api/data", (c) => c.json(Object.keys(ENTITIES)));

// save points, export/import, resets
app.get("/api/snapshots", async (c) =>
  c.json(await all(c.env.DB, "SELECT id, label, kind, created_at, size FROM snapshots ORDER BY id DESC")),
);
app.post("/api/snapshots", async (c) => {
  const b = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const snapId = await createSnapshot(c.env.DB, String(b.label || "Manual save").slice(0, 120));
  return c.json({ ok: true, id: snapId });
});
app.post("/api/snapshots/:id/restore", async (c) => {
  await restoreSnapshot(c.env.DB, id(c));
  return c.json({ ok: true, fx: [{ t: "toast", msg: "Save point loaded", emoji: "💾" }] });
});
app.get("/api/snapshots/:id/download", async (c) => {
  const json = await snapshotJson(c.env.DB, id(c));
  c.header("Content-Disposition", `attachment; filename="ap-life-quest-savepoint-${id(c)}.json"`);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.body(json);
});
app.delete("/api/snapshots/:id", async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM snapshots WHERE id = ?").bind(id(c)),
    c.env.DB.prepare("DELETE FROM snapshot_chunks WHERE snapshot_id = ?").bind(id(c)),
  ]);
  return c.json({ ok: true });
});
app.get("/api/export", async (c) => {
  const json = await exportJson(c.env.DB);
  c.header("Content-Disposition", `attachment; filename="ap-life-quest-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.body(json);
});
app.post("/api/import", async (c) => {
  const data = await c.req.json().catch(() => null);
  if (!data) throw bad("Could not read that file");
  await createSnapshot(c.env.DB, "Before importing a backup", "pre-restore");
  await importAll(c.env.DB, data);
  return c.json({ ok: true, fx: [{ t: "toast", msg: "Backup imported", emoji: "📦" }] });
});
app.post("/api/reset/season", (c) =>
  act(c, async (ctx, b) => {
    if (b.confirm !== "NEW GAME") throw bad('Type "NEW GAME" to confirm');
    await seasonReset(ctx, String(b.name ?? ""));
  }),
);
app.post("/api/reset/factory", async (c) => {
  const b = await c.req.json<{ confirm?: string }>().catch(() => ({}) as { confirm?: string });
  if (b.confirm !== "RESET EVERYTHING") throw bad('Type "RESET EVERYTHING" to confirm');
  const ctx = await loadCtx(c.env.DB);
  const keep = { player_name: ctx.s.player_name, pet_name: ctx.s.pet_name, height_m: ctx.s.height_m, timezone: ctx.s.timezone, birthday: ctx.s.birthday };
  await factoryReset(c.env.DB, keep);
  return c.json({ ok: true, fx: [{ t: "toast", msg: "Factory reset complete. A save point was made first.", emoji: "💥" }] });
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
