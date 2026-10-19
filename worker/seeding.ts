// Writes the starter content into an empty database (first run / factory reset).
import { insertStmt, stmt } from "./db";
import { SEED_ACHIEVEMENTS, SEED_GOALS, SEED_METRICS, SEED_QUESTS, SEED_SHOP, SEED_VOUCHERS, seedSettings } from "./seed";

export async function seedAll(db: D1Database, keep: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = { ...seedSettings(), ...keep, current_season: 1 };
  const today = new Date().toISOString().slice(0, 10);
  const batch: D1PreparedStatement[] = [
    // Fails (and rolls back the whole batch) if another request already seeded.
    stmt(db, "INSERT INTO settings (key, value) VALUES ('seeded_at', ?)", JSON.stringify(new Date().toISOString())),
    ...Object.entries(settings).map(([k, v]) => stmt(db, "INSERT INTO settings (key, value) VALUES (?, ?)", k, JSON.stringify(v))),
    stmt(db, "INSERT INTO seasons (id, name, started_at) VALUES (1, 'Season 1', ?)", today),
    stmt(db, "INSERT INTO player (id, hp) VALUES (1, ?)", (settings.max_hp as number) ?? 100),
    ...SEED_METRICS.map((r) => insertStmt(db, "metrics", r)),
    ...SEED_QUESTS.map((r) => insertStmt(db, "quests", r)),
    ...SEED_SHOP.map((r) => insertStmt(db, "shop_items", r)),
    ...SEED_VOUCHERS.map((r) => insertStmt(db, "vouchers", r)),
    ...SEED_ACHIEVEMENTS.map((r) => insertStmt(db, "achievements", r)),
    ...SEED_GOALS.map((r) => insertStmt(db, "goals", r)),
  ];
  await db.batch(batch);
}
