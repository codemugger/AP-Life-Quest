// The game API for ONE character. Runs inside that character's Durable Object, against its own
// private SQLite database (exposed as c.env.DB). Auth and ownership are checked by the Worker
// before a request ever reaches here.
import { Hono, type Context } from "hono";
import { COSMETICS, EYES, isUnlocked, levelInfo, SPECIES, type Slot } from "../../shared/levels";
import { isPetColor } from "../../shared/petgrid";
import { DEFAULT_SETTINGS, EDITABLE_SETTINGS } from "../../shared/rules";
import { claimAchievement } from "../achievements";
import { createSnapshot, exportJson, factoryReset, importAll, maybeAutoSnapshot, restoreSnapshot, seasonReset, snapshotJson } from "../backup";
import { createRow, deleteRow, ENTITIES, updateRow } from "../crud";
import { all, bad, first, HttpError, notFound, run, stmt } from "../db";
import { openChest, purchase, resolveObligation, useItem } from "../economy";
import {
  award,
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
  type Ctx,
} from "../game";
import { setGoalStatus, toggleMilestone, toggleTask } from "../progress";
import { buildState } from "../state";

export const VERSION = "2.0.0";

type GameEnv = { Bindings: { DB: D1Database } };
type C = Context<GameEnv>;

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

const SLOT_OF: Record<string, Slot> = { hat: "hat", face: "face", scene: "scene" };

export const gameApp = new Hono<GameEnv>();

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

gameApp.get("/api/state", async (c) => {
  const ctx = await loadCtx(c.env.DB);
  return c.json(await buildState(ctx, VERSION));
});

/** Closes finished days (penalties/streaks/billing). The UI calls this until remaining = 0. */
gameApp.post("/api/process", async (c) => {
  const ctx = await loadCtx(c.env.DB);
  const remaining = await processDays(ctx);
  await finalize(ctx);
  if (remaining === 0) c.executionCtx.waitUntil(maybeAutoSnapshot(ctx).catch((e) => console.error("weekly auto-save failed", e)));
  return c.json({ ok: true, fx: ctx.fx, remaining });
});

// quests
gameApp.post("/api/quests/:id/complete", (c) => act(c, (ctx, b) => completeQuest(ctx, id(c), { date: b.date, qty: b.qty })));
gameApp.post("/api/quests/:id/undo", (c) => act(c, (ctx, b) => uncompleteQuest(ctx, id(c), b.date)));
gameApp.post("/api/quests/clear-done", (c) =>
  act(c, async (ctx) => {
    await ctx.db.prepare("UPDATE quests SET active = 0 WHERE type = 'todo' AND active = 1 AND id IN (SELECT quest_id FROM quest_log)").run();
  }),
);

// trackers
gameApp.post("/api/metrics/:key/log", (c) =>
  act(c, (ctx, b) => setMetric(ctx, c.req.param("key"), { date: b.date, value: b.value, mode: b.mode, note: b.note })),
);
gameApp.get("/api/history/:key", async (c) =>
  c.json(await all(c.env.DB, "SELECT date, value, note FROM metric_values WHERE metric_key = ? ORDER BY date", c.req.param("key"))),
);
gameApp.post("/api/fast/start", (c) => act(c, (ctx) => startFast(ctx)));
gameApp.post("/api/fast/stop", (c) => act(c, (ctx, b) => stopFast(ctx, !!b.cancel)));

// shop & inventory
gameApp.post("/api/shop/buy", (c) =>
  act(c, (ctx, b) => purchase(ctx, { item_id: Number(b.item_id), qty: b.qty, voucher_id: b.voucher_id, note: b.note, use_now: !!b.use_now })),
);
gameApp.post("/api/items/:id/use", (c) => act(c, (ctx, b) => useItem(ctx, id(c), { qty: b.qty, note: b.note })));
gameApp.post("/api/obligations/:id/resolve", (c) =>
  act(c, (ctx, b) => {
    if (!["use", "buy", "waive"].includes(b.method)) throw bad("Unknown method");
    return resolveObligation(ctx, id(c), b.method, b.voucher_id);
  }),
);
gameApp.post("/api/chests/:id/open", (c) => act(c, (ctx) => openChest(ctx, id(c))));

// goals & sprints
gameApp.post("/api/goals/:id/status", (c) =>
  act(c, (ctx, b) => {
    if (!["done", "active", "dropped"].includes(b.status)) throw bad("Unknown status");
    return setGoalStatus(ctx, id(c), b.status);
  }),
);
gameApp.post("/api/milestones/:id/toggle", (c) => act(c, (ctx) => toggleMilestone(ctx, id(c))));
gameApp.post("/api/sprint_tasks/:id/toggle", (c) => act(c, (ctx) => toggleTask(ctx, id(c))));
gameApp.post("/api/achievements/:id/claim", (c) => act(c, (ctx) => claimAchievement(ctx, id(c))));

// ledger
gameApp.post("/api/ledger/:id/void", (c) => act(c, (ctx) => voidLedger(ctx, id(c))));
gameApp.post("/api/ledger/adjust", (c) =>
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

// settings (profile, looks, rules)
gameApp.put("/api/settings", (c) =>
  act(c, async (ctx, b) => {
    const stmts: D1PreparedStatement[] = [];
    const level = levelInfo(ctx.before.xp).level;
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
      else if (v !== null) val = String(v).trim().slice(0, 200);
      if (k === "player_name" || k === "pet_name") {
        if (!val) throw bad("Names can't be empty");
        val = String(val).slice(0, 40);
      }
      if (k === "pet_species" && !SPECIES.some((s) => s.id === val)) throw bad("Unknown species");
      if (k === "pet_eyes" && !EYES.some((s) => s.id === val)) throw bad("Unknown eye style");
      if (k === "pet_color" && !isPetColor(String(val))) throw bad("Colour must be a preset or #rrggbb");
      if (SLOT_OF[k]) {
        if (k === "scene" && !val) val = "meadow";
        if (val) {
          const item = COSMETICS.find((x) => x.id === val);
          if (!item || item.slot !== SLOT_OF[k]) throw bad("Unknown item");
          if (!isUnlocked(String(val), ctx.s.hats, level))
            throw bad(item.unlock === "chest" ? `${item.name} drops from chests` : `${item.name} unlocks at level ${item.unlock}`);
        }
      }
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
gameApp.post("/api/data/:entity", (c) => act(c, (ctx, b) => createRow(ctx, c.req.param("entity"), b).then((pk) => ({ id: pk }))));
gameApp.put("/api/data/:entity/:pk", (c) => act(c, (ctx, b) => updateRow(ctx, c.req.param("entity"), c.req.param("pk"), b)));
gameApp.delete("/api/data/:entity/:pk", (c) => act(c, (ctx) => deleteRow(ctx, c.req.param("entity"), c.req.param("pk"))));
gameApp.get("/api/data", (c) => c.json(Object.keys(ENTITIES)));

// ---------- pictures ----------
const MAX_PICTURE = 1_500_000;
/** Picture storage per character (owner / invited members). */
const pictureLimit = (c: C) => (c.req.header("x-aplq-owner") === "1" ? 150 : 50) * 1024 * 1024;
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};
const IMAGE_COLUMNS = ["quests", "events", "goals", "shop_items", "vouchers", "achievements", "sprints"];

gameApp.post("/api/media", async (c) => {
  const mime = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const check = MAGIC[mime];
  if (!check) throw bad("Pictures must be JPEG, PNG, WebP or GIF");
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength < 24) throw bad("That file is empty");
  if (buf.byteLength > MAX_PICTURE) throw bad("Picture too big (max 1.5 MB after compression)");
  if (!check(new Uint8Array(buf, 0, 12))) throw bad("That file isn't really a picture");
  const used = (await first<{ s: number }>(c.env.DB, "SELECT COALESCE(SUM(size), 0) AS s FROM media"))?.s ?? 0;
  if (used + buf.byteLength > pictureLimit(c)) throw bad(`Picture storage is full (${pictureLimit(c) / 1024 / 1024} MB). Remove unused pictures in Settings.`);
  const dim = (h: string) => Math.max(0, Math.min(10000, Math.round(Number(c.req.header(h)) || 0))) || null;
  const row = await stmt(c.env.DB, "INSERT INTO media (mime, width, height, size, data) VALUES (?,?,?,?,?) RETURNING id", mime, dim("x-width"), dim("x-height"), buf.byteLength, buf).first<{ id: number }>();
  return c.json({ ok: true, id: row!.id });
});

gameApp.get("/api/media/:id", async (c) => {
  // Pictures never change, so an ETag lets the browser re-check access cheaply (304) on every view,
  // instead of keeping them readable from cache after logging out.
  const etag = `"m${id(c)}"`;
  if (c.req.header("if-none-match") === etag) {
    const exists = await first(c.env.DB, "SELECT 1 AS ok FROM media WHERE id = ?", id(c));
    if (exists) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-cache" } });
  }
  const row = await first<{ mime: string; data: ArrayBuffer }>(c.env.DB, "SELECT mime, data FROM media WHERE id = ?", id(c));
  if (!row || !MAGIC[row.mime]) throw notFound("Picture not found");
  return new Response(row.data, {
    headers: {
      "Content-Type": row.mime,
      ETag: etag,
      "Cache-Control": "private, no-cache",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// "Nothing points at this picture" — one NOT EXISTS per table (character databases cap compound SELECTs).
const unusedSql = IMAGE_COLUMNS.map(
  (t) => `NOT EXISTS (SELECT 1 FROM ${t} x, json_each(x.images) j WHERE x.images IS NOT NULL AND json_valid(x.images) AND CAST(j.value AS INTEGER) = media.id)`,
).join(" AND ");

gameApp.get("/api/media", async (c) => {
  const [tot, refd] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM media"),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM media WHERE ${unusedSql}`),
  ]);
  const t = tot.results[0] as { n: number; bytes: number };
  return c.json({ count: t.n, bytes: t.bytes, unused: (refd.results[0] as { n: number }).n, limit: pictureLimit(c) });
});

/** Deletes pictures nothing points at (older save points may then show a placeholder). */
gameApp.post("/api/media/cleanup", async (c) => {
  const r = await run(c.env.DB, `DELETE FROM media WHERE ${unusedSql} AND created_at < datetime('now', '-1 hour')`);
  return c.json({ ok: true, removed: r.meta.changes, fx: [{ t: "toast", msg: `Removed ${r.meta.changes} unused picture(s)`, emoji: "🧹" }] });
});

// ---------- save points, export/import, resets ----------
gameApp.get("/api/snapshots", async (c) => c.json(await all(c.env.DB, "SELECT id, label, kind, created_at, size FROM snapshots ORDER BY id DESC")));
gameApp.post("/api/snapshots", async (c) => {
  const b = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const snapId = await createSnapshot(c.env.DB, String(b.label || "Manual save").slice(0, 120));
  return c.json({ ok: true, id: snapId });
});
gameApp.post("/api/snapshots/:id/restore", async (c) => {
  await restoreSnapshot(c.env.DB, id(c));
  return c.json({ ok: true, fx: [{ t: "toast", msg: "Save point loaded", emoji: "💾" }] });
});
gameApp.get("/api/snapshots/:id/download", async (c) => {
  const json = await snapshotJson(c.env.DB, id(c));
  c.header("Content-Disposition", `attachment; filename="ap-life-quest-savepoint-${id(c)}.json"`);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.body(json);
});
gameApp.delete("/api/snapshots/:id", async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM snapshots WHERE id = ?").bind(id(c)),
    c.env.DB.prepare("DELETE FROM snapshot_chunks WHERE snapshot_id = ?").bind(id(c)),
  ]);
  return c.json({ ok: true });
});
gameApp.get("/api/export", async (c) => {
  const json = await exportJson(c.env.DB);
  c.header("Content-Disposition", `attachment; filename="ap-life-quest-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.body(json);
});
gameApp.post("/api/import", async (c) => {
  const data = await c.req.json().catch(() => null);
  if (!data) throw bad("Could not read that file");
  await createSnapshot(c.env.DB, "Before importing a backup", "pre-restore");
  await importAll(c.env.DB, data, { keepTemplate: true });
  return c.json({ ok: true, fx: [{ t: "toast", msg: "Backup imported", emoji: "📦" }] });
});
gameApp.post("/api/reset/season", (c) =>
  act(c, async (ctx, b) => {
    if (b.confirm !== "NEW GAME") throw bad('Type "NEW GAME" to confirm');
    await seasonReset(ctx, String(b.name ?? ""));
  }),
);
gameApp.post("/api/reset/factory", async (c) => {
  const b = await c.req.json<{ confirm?: string }>().catch(() => ({}) as { confirm?: string });
  if (b.confirm !== "RESET EVERYTHING") throw bad('Type "RESET EVERYTHING" to confirm');
  const ctx = await loadCtx(c.env.DB);
  const s = ctx.s;
  const keep = {
    player_name: s.player_name,
    pet_name: s.pet_name,
    height_m: s.height_m,
    timezone: s.timezone,
    birthday: s.birthday,
    template: s.template,
    pet_color: s.pet_color,
    pet_species: s.pet_species,
    pet_eyes: s.pet_eyes,
  };
  await factoryReset(c.env.DB, keep);
  return c.json({ ok: true, fx: [{ t: "toast", msg: "Factory reset complete. A save point was made first.", emoji: "💥" }] });
});

gameApp.all("/api/*", () => {
  throw new HttpError(404, "No such endpoint");
});

gameApp.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: "Something went wrong on the server" }, 500);
});
