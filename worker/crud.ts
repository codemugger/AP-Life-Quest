// Generic, whitelisted create/update/delete for everything configurable in the app.
// To make a new column editable: add it in a migration, then list it here.
import { ruleProblem } from "../shared/rules";
import { bad, first, notFound, stmt } from "./db";
import type { Ctx } from "./game";

type Kind = "text" | "longtext" | "int" | "num" | "bool" | "json" | "date" | "images" | "url";
type Field = [Kind, { enum?: string[]; nullable?: boolean; min?: number; max?: number }?];

interface Entity {
  table: string;
  pk: "id" | "key";
  fields: Record<string, Field>;
  required: string[];
  /** extra cleanup when a row is deleted */
  onDelete?: string[];
  protect?: (row: Record<string, unknown>) => string | null;
}

const T: Field = ["text"];
const TN: Field = ["text", { nullable: true }];
const N: Field = ["num", { nullable: true }];
const I: Field = ["int"];
const B: Field = ["bool"];
const D: Field = ["date", { nullable: true }];
const IMG: Field = ["images", { nullable: true }];
const URL_: Field = ["url", { nullable: true }];

export const ENTITIES: Record<string, Entity> = {
  quests: {
    table: "quests",
    pk: "id",
    required: ["title"],
    fields: {
      type: ["text", { enum: ["daily", "weekly", "habit", "todo"] }],
      title: T,
      emoji: T,
      notes: ["longtext", { nullable: true }],
      area: T,
      difficulty: ["text", { enum: ["trivial", "easy", "medium", "hard", "epic"] }],
      ap: ["int", { min: 0, max: 100000 }],
      xp: ["int", { min: 0, max: 100000 }],
      hp_penalty: ["int", { min: 0, max: 1000 }],
      polarity: ["int", { min: -1, max: 1 }],
      days: T,
      weekly_target: ["int", { min: 1, max: 50 }],
      unit: TN,
      metric_key: TN,
      metric_op: ["text", { enum: ["logged", "<=", ">="], nullable: true }],
      metric_value: N,
      due_date: D,
      priority: ["text", { enum: ["do", "schedule", "delegate", "later"], nullable: true }],
      active: B,
      sort: I,
      created_at: D,
      images: IMG,
      link: URL_,
    },
  },
  metrics: {
    table: "metrics",
    pk: "key",
    required: ["key", "name"],
    fields: {
      key: T,
      name: T,
      emoji: T,
      unit: T,
      mode: ["text", { enum: ["set", "add"] }],
      direction: ["text", { enum: ["up", "down", "none"] }],
      target: N,
      decimals: ["int", { min: 0, max: 4 }],
      quick: TN,
      active: B,
      sort: I,
    },
    onDelete: ["DELETE FROM metric_values WHERE metric_key = ?"],
    protect: (r) => (r.builtin ? "Built-in trackers can be hidden (set inactive) but not deleted" : null),
  },
  shop_items: {
    table: "shop_items",
    pk: "id",
    required: ["name", "base_price"],
    fields: {
      name: T,
      emoji: T,
      category: T,
      base_price: ["int", { min: 0, max: 10_000_000 }],
      tax: ["num", { min: 0, max: 100 }],
      unit: T,
      notes: ["longtext", { nullable: true }],
      voucher_ok: B,
      effect: TN,
      trigger_metric: TN,
      trigger_min: N,
      trigger_max: N,
      min_level: ["int", { min: 0, max: 999 }],
      active: B,
      sort: I,
      images: IMG,
    },
  },
  vouchers: {
    table: "vouchers",
    pk: "id",
    required: ["name", "discount"],
    fields: {
      name: T,
      emoji: T,
      description: ["longtext", { nullable: true }],
      discount: ["num", { min: 0, max: 1 }],
      scope: ["text", { enum: ["all", "categories", "items"] }],
      scope_values: ["json", { nullable: true }],
      limit_type: ["text", { enum: ["infinite", "once", "per_week", "per_month"] }],
      limit_count: ["int", { min: 1, max: 1000 }],
      condition: ["longtext", { nullable: true }],
      rule: ["json", { nullable: true }],
      active: B,
      sort: I,
      images: IMG,
    },
  },
  achievements: {
    table: "achievements",
    pk: "id",
    required: ["name", "rule"],
    fields: {
      name: T,
      emoji: T,
      description: ["longtext", { nullable: true }],
      rule: ["json"],
      tier: ["text", { enum: ["bronze", "silver", "gold", "platinum"] }],
      ap: ["int", { min: 0, max: 100000 }],
      xp: ["int", { min: 0, max: 100000 }],
      hidden: B,
      active: B,
      sort: I,
      images: IMG,
    },
    onDelete: ["DELETE FROM achievement_unlocks WHERE achievement_id = ?"],
  },
  goals: {
    table: "goals",
    pk: "id",
    required: ["title"],
    fields: {
      title: T,
      emoji: T,
      area: T,
      description: ["longtext", { nullable: true }],
      target_date: D,
      mode: ["text", { enum: ["manual", "metric", "milestones"] }],
      progress: ["num", { min: 0, max: 100 }],
      metric_key: TN,
      start_value: N,
      target_value: N,
      ap: ["int", { min: 0, max: 100000 }],
      xp: ["int", { min: 0, max: 100000 }],
      sort: I,
      images: IMG,
      link: URL_,
    },
    onDelete: ["DELETE FROM milestones WHERE goal_id = ?", "UPDATE notes SET goal_id = NULL WHERE goal_id = ?"],
  },
  milestones: {
    table: "milestones",
    pk: "id",
    required: ["goal_id", "title"],
    fields: { goal_id: I, title: T, ap: ["int", { min: 0, max: 100000 }], sort: I },
  },
  sprints: {
    table: "sprints",
    pk: "id",
    required: ["title", "start_date", "end_date"],
    fields: {
      title: T,
      goal_id: ["int", { nullable: true }],
      boss: T,
      boss_emoji: T,
      start_date: ["date"],
      end_date: ["date"],
      ap: ["int", { min: 0, max: 100000 }],
      xp: ["int", { min: 0, max: 100000 }],
      images: IMG,
    },
    onDelete: ["DELETE FROM sprint_tasks WHERE sprint_id = ?", "UPDATE notes SET sprint_id = NULL WHERE sprint_id = ?"],
  },
  sprint_tasks: {
    table: "sprint_tasks",
    pk: "id",
    required: ["sprint_id", "title"],
    fields: { sprint_id: I, title: T, dmg: ["int", { min: 1, max: 100 }], sort: I },
  },
  events: {
    table: "events",
    pk: "id",
    required: ["date", "title"],
    fields: {
      date: ["date"],
      end_date: D,
      title: T,
      emoji: T,
      kind: ["text", { enum: ["event", "trip", "milestone", "memory"] }],
      notes: ["longtext", { nullable: true }],
      images: IMG,
      link: URL_,
    },
    onDelete: ["UPDATE notes SET event_id = NULL WHERE event_id = ?"],
  },
};

function clean(e: Entity, body: Record<string, unknown>, creating: boolean) {
  const out: Record<string, unknown> = {};
  for (const [col, [kind, o = {}]] of Object.entries(e.fields)) {
    if (!(col in body)) continue;
    let v = body[col];
    if (v === "" && kind !== "text" && kind !== "longtext") v = null;
    if (v === null || v === undefined) {
      if (!o.nullable) throw bad(`${col} is required`);
      out[col] = null;
      continue;
    }
    switch (kind) {
      case "text":
      case "longtext": {
        const s = String(v).trim();
        if (s.length > (kind === "text" ? 300 : 4000)) throw bad(`${col} is too long`);
        if (o.enum && !o.enum.includes(s)) throw bad(`${col} must be one of: ${o.enum.join(", ")}`);
        out[col] = s;
        break;
      }
      case "int":
      case "num": {
        const n = Number(v);
        if (!Number.isFinite(n)) throw bad(`${col} must be a number`);
        if (o.min !== undefined && n < o.min) throw bad(`${col} must be ≥ ${o.min}`);
        if (o.max !== undefined && n > o.max) throw bad(`${col} must be ≤ ${o.max}`);
        out[col] = kind === "int" ? Math.round(n) : n;
        break;
      }
      case "bool":
        out[col] = v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad(`${col} must be a date (YYYY-MM-DD)`);
        out[col] = String(v);
        break;
      case "images": {
        let list = v;
        if (typeof v === "string") {
          try {
            list = JSON.parse(v);
          } catch {
            throw bad(`${col} must be a list of picture ids`);
          }
        }
        if (!Array.isArray(list) || list.length > 12 || !list.every((x) => Number.isInteger(x) && x > 0)) throw bad("Up to 12 pictures");
        out[col] = list.length ? JSON.stringify(list) : null;
        break;
      }
      case "url": {
        const u = String(v).trim();
        if (!u) {
          out[col] = null;
          break;
        }
        let parsed: URL;
        try {
          parsed = new URL(u);
        } catch {
          throw bad("Link must be a full web address (https://…)");
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw bad("Only http(s) links are allowed");
        if (u.length > 1000) throw bad("Link is too long");
        out[col] = parsed.toString();
        break;
      }
      case "json": {
        let parsed = v;
        if (typeof v === "string") {
          try {
            parsed = JSON.parse(v);
          } catch {
            throw bad(`${col} must be valid JSON`);
          }
        }
        const s = JSON.stringify(parsed);
        if (s.length > 4000) throw bad(`${col} is too long`);
        out[col] = s;
        break;
      }
    }
  }
  if (creating) for (const r of e.required) if (out[r] === undefined || out[r] === null || out[r] === "") throw bad(`${r} is required`);
  if (e.table === "metrics" && out.key !== undefined && !/^[a-z0-9_]{1,32}$/.test(String(out.key)))
    throw bad("Tracker key: lowercase letters, numbers and _ only");
  if (e.table === "quests" && out.days !== undefined && !/^[01]{7}$/.test(String(out.days))) throw bad("days must be 7 digits of 0/1 (Mon..Sun)");
  if (e.table === "vouchers" && typeof out.rule === "string" && out.rule !== "null") {
    const why = ruleProblem(JSON.parse(out.rule));
    if (why) throw bad(`Voucher rule: ${why}`);
  }
  if (e.table === "vouchers" && out.rule === "null") out.rule = null;
  return out;
}

function entity(name: string) {
  if (!Object.hasOwn(ENTITIES, name)) throw notFound("Unknown collection");
  return ENTITIES[name];
}

export async function createRow(ctx: Ctx, name: string, body: Record<string, unknown>) {
  const e = entity(name);
  const row = clean(e, body, true);
  if (e.table === "quests" && !row.created_at) row.created_at = ctx.today;
  // "Do now" is urgent by definition: no date means today
  if (e.table === "quests" && row.type === "todo" && row.priority === "do" && !row.due_date) row.due_date = ctx.today;
  const cols = Object.keys(row);
  const r = await stmt(
    ctx.db,
    `INSERT INTO ${e.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) RETURNING ${e.pk} AS pk`,
    ...cols.map((c) => row[c]),
  ).first<{ pk: string | number }>();
  return r?.pk;
}

export async function updateRow(ctx: Ctx, name: string, pk: string, body: Record<string, unknown>) {
  const e = entity(name);
  const row = clean(e, body, false);
  if (e.pk === "key") delete row.key; // primary keys of trackers never change
  const cols = Object.keys(row);
  if (!cols.length) return;
  const res = await stmt(
    ctx.db,
    `UPDATE ${e.table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${e.pk} = ?`,
    ...cols.map((c) => row[c]),
    pk,
  ).run();
  if (!res.meta.changes) throw notFound();
}

export async function deleteRow(ctx: Ctx, name: string, pk: string) {
  const e = entity(name);
  const existing = await first<Record<string, unknown>>(ctx.db, `SELECT * FROM ${e.table} WHERE ${e.pk} = ?`, pk);
  if (!existing) throw notFound();
  const why = e.protect?.(existing);
  if (why) throw bad(why);
  await ctx.db.batch([
    stmt(ctx.db, `DELETE FROM ${e.table} WHERE ${e.pk} = ?`, pk),
    ...(e.onDelete ?? []).map((sql) => stmt(ctx.db, sql, pk)),
  ]);
}
