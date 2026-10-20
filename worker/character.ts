// One character = one Durable Object with its own private SQLite database.
// The Worker authenticates the user and checks ownership, then forwards requests here.
import { DurableObject } from "cloudflare:workers";
import { levelInfo, petStage, titleFor } from "../shared/levels";
import schema1 from "../migrations/0001_init.sql?raw";
import schema2 from "./schema/0002_media.sql?raw";
import schema3 from "./schema/0003_notes.sql?raw";
import { importAll, type Backup } from "./backup";
import { all, first } from "./db";
import { DoDb, splitSql } from "./do-db";
import { gameApp } from "./game/api";
import { loadCtx } from "./game";
import type { TemplateContent } from "./seed";
import { seedAll } from "./seeding";

/** Character database schema, applied in order. Only ever append. */
const SCHEMA = [schema1, schema2, schema3];

/** Config tables that "copy setup from another character" brings across (no progress). */
const CONFIG_TABLES = ["metrics", "quests", "shop_items", "vouchers", "achievements", "goals", "milestones"] as const;

export interface CharacterSummary {
  name: string;
  pet_name: string;
  level: number;
  title: string;
  stage: number;
  species: string;
  color: string;
  eyes: string;
  hat: string | null;
  face: string | null;
  ap: number;
  hp: number;
  streak: number;
  fainted: number;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const MB = 1024 * 1024;
/** Whole-character storage budget (game data + pictures + save points). */
const BUDGET = { owner: 1024 * MB, member: 200 * MB };
const WRITES_PER_MINUTE = 120;



export class CharacterDO extends DurableObject {
  private readonly db: DoDb;
  private writes: number[] = [];

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.db = new DoDb(ctx.storage);
    void ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)");
    // Trusted flags (never exported/imported, never touched by resets).
    sql.exec("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const row = sql.exec("SELECT version FROM _schema").toArray()[0];
    if (!row) sql.exec("INSERT INTO _schema (version) VALUES (0)");
    let v = row ? Number(row.version) : 0;
    while (v < SCHEMA.length) {
      const stmts = splitSql(SCHEMA[v]);
      const next = v + 1;
      this.ctx.storage.transactionSync(() => {
        for (const s of stmts) sql.exec(s);
        sql.exec("UPDATE _schema SET version = ?", next);
      });
      v = next;
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/__internal/")) {
      try {
        return await this.internal(url.pathname.slice("/__internal/".length), req);
      } catch (e) {
        console.error(e);
        return json({ error: (e as Error).message }, 500);
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      // Gentle rate limit, so one character can't flood the shared daily quotas.
      const now = Date.now();
      this.writes = this.writes.filter((t) => now - t < 60_000);
      if (this.writes.length >= WRITES_PER_MINUTE) return json({ error: "Whoa, that's a lot of changes. Take a breath and try again in a minute." }, 429);
      this.writes.push(now);
      // Storage budget: when full, only things that free space are allowed.
      const budget = req.headers.get("x-aplq-owner") === "1" ? BUDGET.owner : BUDGET.member;
      const freesSpace = req.method === "DELETE" || /\/api\/(media\/cleanup|reset\/factory|notes\/empty-trash|notes\/\d+\/trash)$/.test(url.pathname);
      if (this.ctx.storage.sql.databaseSize > budget && !freesSpace)
        return json({ error: `This character's storage is full (${Math.round(budget / MB)} MB). Delete old save points or unused pictures in Settings.` }, 507);
    }
    const exec = { waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p), passThroughOnException() {}, props: {} };
    return gameApp.fetch(req, { DB: this.db.asD1() }, exec as unknown as ExecutionContext);
  }

  private async seeded() {
    return ((await first<{ c: number }>(this.db.asD1(), "SELECT COUNT(*) AS c FROM settings"))?.c ?? 0) > 0;
  }

  private async internal(op: string, req: Request): Promise<Response> {
    const db = this.db.asD1();
    switch (op) {
      case "init": {
        if (await this.seeded()) return json({ error: "Character already exists" }, 409);
        const b = await req.json<{ keep: Record<string, unknown>; content?: TemplateContent; owner?: boolean }>();
        if (b.owner) this.ctx.storage.sql.exec("INSERT OR REPLACE INTO _meta (key, value) VALUES ('owner_templates', '1')");
        await seedAll(db, b.keep ?? {}, b.content, !!b.owner);
        return json({ ok: true });
      }
      case "import": {
        // Only used for the owner's one-time v1 import.
        const b = await req.json<{ backup: Backup; owner?: boolean }>();
        if (b.owner) this.ctx.storage.sql.exec("INSERT OR REPLACE INTO _meta (key, value) VALUES ('owner_templates', '1')");
        await importAll(db, b.backup);
        if (b.owner) this.ctx.storage.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('template', '\"anson\"')");
        return json({ ok: true });
      }
      case "export-config": {
        const out: Record<string, unknown[]> = {};
        for (const t of CONFIG_TABLES) out[t] = await all(db, `SELECT * FROM ${t}`);
        // goals copy as fresh (not done, no rewards); milestones unticked
        out.goals = (out.goals as Record<string, unknown>[]).map((g) => ({ ...g, status: "active", completed_at: null, rewarded_season: null, progress: 0 }));
        out.milestones = (out.milestones as Record<string, unknown>[]).map((m) => ({ ...m, done_at: null }));
        const s = (await loadCtx(db)).s;
        return json({ tables: out, settings: { height_m: s.height_m, timezone: s.timezone, template: s.template } });
      }
      case "summary": {
        if (!(await this.seeded())) return json({ error: "Not set up" }, 404);
        const ctx = await loadCtx(db);
        const lv = levelInfo(ctx.before.xp).level;
        const s = ctx.s;
        const summary: CharacterSummary = {
          name: s.player_name,
          pet_name: s.pet_name,
          level: lv,
          title: titleFor(lv),
          stage: petStage(lv),
          species: s.pet_species,
          color: s.pet_color,
          eyes: s.pet_eyes,
          hat: s.hat,
          face: s.face,
          ap: ctx.before.ap,
          hp: ctx.player.hp,
          streak: ctx.player.streak,
          fainted: ctx.player.fainted,
        };
        return json(summary);
      }
      case "destroy": {
        await this.ctx.storage.deleteAll();
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown operation" }, 404);
    }
  }
}

/** Builds template content from another character's export-config (setup only, no progress). */
export function contentFromCopy(cfg: { tables: Record<string, Record<string, unknown>[]> }): TemplateContent & { milestones: Record<string, unknown>[] } {
  const t = cfg.tables;
  return {
    metrics: t.metrics ?? [],
    quests: t.quests ?? [],
    shop: t.shop_items ?? [],
    vouchers: t.vouchers ?? [],
    achievements: t.achievements ?? [],
    goals: t.goals ?? [],
    milestones: t.milestones ?? [],
  };
}
