// Writes starter content into an empty character database (new character / factory reset).
import { insertStmt, stmt } from "./db";
import { seedSettings, templateContent, type TemplateContent } from "./seed";

/**
 * `keep` = profile + looks to carry over (and `template`, which picks the content).
 * `content` overrides the template (used when copying setup from another character).
 */
export async function seedAll(db: D1Database, keep: Record<string, unknown> = {}, content?: TemplateContent) {
  const tpl = content ?? templateContent(keep.template as string | undefined);
  const settings: Record<string, unknown> = { ...seedSettings(), ...(tpl.settings ?? {}), ...keep, current_season: 1 };
  const today = new Date().toISOString().slice(0, 10);
  const batch: D1PreparedStatement[] = [
    // Fails (and rolls back the whole batch) if this database was already seeded.
    stmt(db, "INSERT INTO settings (key, value) VALUES ('seeded_at', ?)", JSON.stringify(new Date().toISOString())),
    ...Object.entries(settings).map(([k, v]) => stmt(db, "INSERT INTO settings (key, value) VALUES (?, ?)", k, JSON.stringify(v))),
    stmt(db, "INSERT INTO seasons (id, name, started_at) VALUES (1, 'Season 1', ?)", today),
    stmt(db, "INSERT INTO player (id, hp) VALUES (1, ?)", (settings.max_hp as number) ?? 100),
    ...tpl.metrics.map((r) => insertStmt(db, "metrics", r)),
    ...tpl.quests.map((r) => insertStmt(db, "quests", r)),
    ...tpl.shop.map((r) => insertStmt(db, "shop_items", r)),
    ...tpl.vouchers.map((r) => insertStmt(db, "vouchers", r)),
    ...tpl.achievements.map((r) => insertStmt(db, "achievements", r)),
    ...tpl.goals.map((r) => insertStmt(db, "goals", r)),
    ...(tpl.milestones ?? []).map((r) => insertStmt(db, "milestones", r)),
  ];
  await db.batch(batch);
}
