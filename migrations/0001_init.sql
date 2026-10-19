-- AP Life Quest — initial schema.
-- Rule for future migrations: only ADD things (tables/columns with defaults) so an
-- older app version can still run against a newer database (safe code rollback).

-- Key/value store for profile + game rules (values are JSON).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------- security ----------
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen  INTEGER,
  user_agent TEXT
);
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  ip TEXT,
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_ts ON login_attempts(ts);

-- ---------- player & seasons ----------
-- A season is one "run" of the game. New Game+ ends the season and starts a new one.
CREATE TABLE seasons (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  summary    TEXT
);
-- Single-row live state (id is always 1).
CREATE TABLE player (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  hp              INTEGER NOT NULL DEFAULT 100,
  fainted         INTEGER NOT NULL DEFAULT 0,
  revive_progress INTEGER NOT NULL DEFAULT 0,
  streak          INTEGER NOT NULL DEFAULT 0,
  best_streak     INTEGER NOT NULL DEFAULT 0,
  last_processed  TEXT,
  fast_started_at INTEGER,
  rewarded_level  INTEGER NOT NULL DEFAULT 1  -- highest level whose rewards were already handed out
);
-- One row per closed day. Inserted first in each day's batch, so a day can never be scored twice.
CREATE TABLE day_closures (
  date      TEXT PRIMARY KEY,
  closed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Days marked as rest / exception days (no penalties, streak frozen).
CREATE TABLE rest_days (
  date   TEXT PRIMARY KEY,
  reason TEXT
);

-- ---------- quests ----------
CREATE TABLE quests (
  id            INTEGER PRIMARY KEY,
  type          TEXT NOT NULL DEFAULT 'daily',   -- daily | weekly | habit | todo
  title         TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '⭐',
  notes         TEXT,
  area          TEXT NOT NULL DEFAULT 'life',
  difficulty    TEXT NOT NULL DEFAULT 'medium',  -- trivial | easy | medium | hard | epic
  ap            INTEGER NOT NULL DEFAULT 10,     -- per completion (per unit for habits with a unit)
  xp            INTEGER NOT NULL DEFAULT 20,
  hp_penalty    INTEGER NOT NULL DEFAULT 5,      -- HP lost when a daily/weekly is missed, or per bad-habit tap
  polarity      INTEGER NOT NULL DEFAULT 1,      -- habits: 1 = good, -1 = bad
  days          TEXT NOT NULL DEFAULT '1111111', -- dailies: Mon..Sun
  weekly_target INTEGER NOT NULL DEFAULT 1,      -- weeklies: completions needed per week
  unit          TEXT,                            -- habits: if set, ask for a quantity (e.g. "h")
  metric_key    TEXT,                            -- auto-complete from a tracker
  metric_op     TEXT,                            -- logged | <= | >=
  metric_value  REAL,
  due_date      TEXT,                            -- todos
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE quest_log (
  id         INTEGER PRIMARY KEY,
  quest_id   INTEGER NOT NULL,
  date       TEXT NOT NULL,
  qty        REAL NOT NULL DEFAULT 1,
  auto       INTEGER NOT NULL DEFAULT 0,
  ledger_id  INTEGER,
  season_id  INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quest_log_date ON quest_log(date);
CREATE INDEX idx_quest_log_quest ON quest_log(quest_id, date);

-- ---------- trackers (weight, calories, CSD, anything custom) ----------
CREATE TABLE metrics (
  key       TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  emoji     TEXT NOT NULL DEFAULT '📈',
  unit      TEXT NOT NULL DEFAULT '',
  mode      TEXT NOT NULL DEFAULT 'set',   -- set (one value per day) | add (values accumulate)
  direction TEXT NOT NULL DEFAULT 'none',  -- up | down | none  (which way is "good")
  target    REAL,
  decimals  INTEGER NOT NULL DEFAULT 1,
  quick     TEXT,                          -- comma list of quick-add amounts, e.g. "0.5,1,2"
  builtin   INTEGER NOT NULL DEFAULT 0,
  active    INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE metric_values (
  metric_key TEXT NOT NULL,
  date       TEXT NOT NULL,
  value      REAL NOT NULL,
  note       TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (metric_key, date)
);

-- ---------- economy ----------
-- Every AP / XP / HP change is a row here. Balance = SUM(ap) for the season.
CREATE TABLE ledger (
  id          INTEGER PRIMARY KEY,
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  date        TEXT NOT NULL,
  kind        TEXT NOT NULL,      -- earn | spend | penalty | bonus | adjust | loot | faint
  ap          INTEGER NOT NULL DEFAULT 0,
  xp          INTEGER NOT NULL DEFAULT 0,
  hp          INTEGER NOT NULL DEFAULT 0,
  source      TEXT,               -- quest | shop | achievement | chest | day | manual | goal | sprint
  ref_id      INTEGER,
  description TEXT,
  crit        INTEGER NOT NULL DEFAULT 0,
  voided      INTEGER NOT NULL DEFAULT 0,
  season_id   INTEGER NOT NULL
);
CREATE INDEX idx_ledger_season ON ledger(season_id, voided);

CREATE TABLE shop_items (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  emoji          TEXT NOT NULL DEFAULT '🎁',
  category       TEXT NOT NULL DEFAULT 'Treats',
  base_price     INTEGER NOT NULL,
  tax            REAL NOT NULL DEFAULT 1,     -- multiplier, e.g. 3 = "x3 tax"
  unit           TEXT NOT NULL DEFAULT 'ticket',
  notes          TEXT,
  voucher_ok     INTEGER NOT NULL DEFAULT 1,
  effect         TEXT,                        -- null | heal:30 | rest_day | streak_freeze
  trigger_metric TEXT,                        -- e.g. calories: a day in [min,max] requires this ticket
  trigger_min    REAL,
  trigger_max    REAL,
  min_level      INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE vouchers (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  emoji        TEXT NOT NULL DEFAULT '🎟️',
  description  TEXT,
  discount     REAL NOT NULL,               -- 0.3 = 30% off
  scope        TEXT NOT NULL DEFAULT 'all', -- all | categories | items
  scope_values TEXT,                        -- JSON array of category names or item ids
  limit_type   TEXT NOT NULL DEFAULT 'infinite', -- infinite | once | per_week | per_month
  limit_count  INTEGER NOT NULL DEFAULT 1,
  condition    TEXT,                        -- human-readable condition (honour system)
  rule         TEXT,                        -- optional JSON rule the app checks for you
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE purchases (
  id           INTEGER PRIMARY KEY,
  item_id      INTEGER,
  item_name    TEXT NOT NULL,
  qty          REAL NOT NULL DEFAULT 1,
  unit_price   INTEGER NOT NULL DEFAULT 0,
  voucher_id   INTEGER,
  voucher_name TEXT,
  discount     REAL NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  date         TEXT NOT NULL,
  ledger_id    INTEGER,
  season_id    INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE item_uses (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL,
  purchase_id INTEGER,                        -- set when used straight from a purchase (so refunds undo it)
  qty        REAL NOT NULL DEFAULT 1,
  note       TEXT,
  date       TEXT NOT NULL,
  season_id  INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- "Calorie court": a logged value inside a shop item's trigger band creates an obligation
-- to use that ticket. Unresolved obligations are auto-billed at full price when the day closes.
CREATE TABLE obligations (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  metric_key  TEXT NOT NULL,
  item_id     INTEGER NOT NULL,
  value       REAL,
  status      TEXT NOT NULL DEFAULT 'open', -- open | settling | paid | auto_billed | waived
  resolved_at TEXT,
  purchase_id INTEGER,
  season_id   INTEGER NOT NULL
);

-- ---------- loot ----------
CREATE TABLE chests (
  id         INTEGER PRIMARY KEY,
  rarity     TEXT NOT NULL,    -- common | rare | epic | legendary
  source     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  opened_at  TEXT,
  reward     TEXT,
  season_id  INTEGER NOT NULL
);

-- ---------- achievements ----------
CREATE TABLE achievements (
  id          INTEGER PRIMARY KEY,
  key         TEXT UNIQUE,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🏆',
  description TEXT,
  rule        TEXT NOT NULL,   -- JSON, see README "Achievement rules"
  tier        TEXT NOT NULL DEFAULT 'bronze',
  ap          INTEGER NOT NULL DEFAULT 0,
  xp          INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE achievement_unlocks (
  achievement_id INTEGER NOT NULL,
  season_id      INTEGER NOT NULL,
  unlocked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (achievement_id, season_id)
);

-- ---------- goals, sprints, events ----------
CREATE TABLE goals (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  emoji        TEXT NOT NULL DEFAULT '🎯',
  area         TEXT NOT NULL DEFAULT 'life',
  description  TEXT,
  target_date  TEXT,
  status       TEXT NOT NULL DEFAULT 'active', -- active | done | dropped
  mode         TEXT NOT NULL DEFAULT 'milestones', -- manual | metric | milestones
  progress     REAL NOT NULL DEFAULT 0,      -- manual mode, 0..100
  metric_key   TEXT,
  start_value  REAL,
  target_value REAL,
  ap           INTEGER NOT NULL DEFAULT 200,
  xp           INTEGER NOT NULL DEFAULT 200,
  completed_at TEXT,
  rewarded_season INTEGER,                  -- season in which the reward was paid (paid once)
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE milestones (
  id      INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL,
  title   TEXT NOT NULL,
  ap      INTEGER NOT NULL DEFAULT 20,
  done_at TEXT,
  sort    INTEGER NOT NULL DEFAULT 0
);
-- A sprint is a time-boxed "boss raid": each finished task deals damage to the boss.
CREATE TABLE sprints (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  goal_id    INTEGER,
  boss       TEXT NOT NULL DEFAULT 'Procrastination Slime',
  boss_emoji TEXT NOT NULL DEFAULT '👾',
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active', -- active | won | lost | cancelled
  ap         INTEGER NOT NULL DEFAULT 150,
  xp         INTEGER NOT NULL DEFAULT 150,
  created_at TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE sprint_tasks (
  id        INTEGER PRIMARY KEY,
  sprint_id INTEGER NOT NULL,
  title     TEXT NOT NULL,
  dmg       INTEGER NOT NULL DEFAULT 1,
  done_at   TEXT,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL,
  end_date   TEXT,
  title      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '📅',
  kind       TEXT NOT NULL DEFAULT 'event', -- event | trip | milestone | memory
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- save points ----------
CREATE TABLE snapshots (
  id         INTEGER PRIMARY KEY,
  label      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'manual', -- manual | auto | pre-reset | pre-restore
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  size       INTEGER NOT NULL DEFAULT 0
);
-- Each chunk is a JSON array of up to 500 rows of one table, built inside SQLite
-- (so saving costs the Worker almost no CPU). `cols` lists the columns at save time.
CREATE TABLE snapshot_chunks (
  snapshot_id INTEGER NOT NULL,
  idx         INTEGER NOT NULL,
  tbl         TEXT NOT NULL,
  cols        TEXT NOT NULL,
  data        TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, idx)
);

-- ---------- indexes (keep D1 "rows read" low on the free tier) ----------
CREATE INDEX idx_metric_values_date ON metric_values(date);
CREATE INDEX idx_quest_log_season ON quest_log(season_id, date);
CREATE INDEX idx_ledger_source ON ledger(season_id, source);
CREATE INDEX idx_purchases_season ON purchases(season_id, item_id);
CREATE INDEX idx_item_uses_season ON item_uses(season_id, item_id);
CREATE INDEX idx_obligations_season ON obligations(season_id, status, date);
CREATE INDEX idx_chests_season ON chests(season_id, opened_at);
CREATE INDEX idx_unlocks_season ON achievement_unlocks(season_id);
CREATE INDEX idx_item_uses_purchase ON item_uses(purchase_id);
CREATE INDEX idx_obligations_purchase ON obligations(purchase_id);
