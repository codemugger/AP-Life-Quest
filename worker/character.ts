// One character = one Durable Object with its own private SQLite database.
// The Worker authenticates the user and checks ownership, then forwards requests here.
import { DurableObject } from "cloudflare:workers";
import { levelInfo, petStage, titleFor } from "../shared/levels";
import schema1 from "../migrations/0001_init.sql?raw";
import schema2 from "./schema/0002_media.sql?raw";
import { importAll, type Backup } from "./backup";
import { all, first } from "./db";
import { DoDb, splitSql } from "./do-db";
import { gameApp } from "./game/api";
import { loadCtx } from "./game";
import type { TemplateContent } from "./seed";
import { seedAll } from "./seeding";

/** Character database schema, applied in order. Only ever append. */
const SCHEMA = [schema1, schema2];

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

export class CharacterDO extends DurableObject {
  private readonly db: DoDb;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.db = new DoDb(ctx.storage);
    void ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)");
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
        const b = await req.json<{ keep: Record<string, unknown>; content?: TemplateContent }>();
        await seedAll(db, b.keep ?? {}, b.content);
        return json({ ok: true });
      }
      case "import": {
        const data = await req.json<Backup>();
        await importAll(db, data);
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
