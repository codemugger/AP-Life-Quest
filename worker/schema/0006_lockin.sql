-- Character schema v6: choose what's in the Quick log, Big 3 promises, phone reminders.

-- Quick log on Camp: 0 = not shown, otherwise its position (keeps what v2.4 showed).
ALTER TABLE metrics ADD COLUMN quick_log INTEGER NOT NULL DEFAULT 0;
UPDATE metrics SET quick_log = CASE key WHEN 'weight' THEN 1 WHEN 'calories' THEN 2 WHEN 'csd' THEN 3 ELSE 4 END
  WHERE key IN ('weight', 'calories') OR (key IN ('csd', 'fasting') AND active = 1);

-- Completions of quests deleted forever move to a negative id, so a new quest that reuses the
-- id doesn't inherit them (they still count in stats and exports).
UPDATE quest_log SET quest_id = -quest_id WHERE quest_id > 0 AND quest_id NOT IN (SELECT id FROM quests);
UPDATE ledger SET ref_id = -ref_id WHERE source = 'quest' AND ref_id > 0 AND ref_id NOT IN (SELECT id FROM quests);

-- Big 3: to-dos promised for a day. Title is kept so a deleted to-do still counts as broken.
CREATE TABLE promises (
  date      TEXT NOT NULL,
  quest_id  INTEGER NOT NULL,
  title     TEXT NOT NULL,
  emoji     TEXT,
  made_at   INTEGER NOT NULL, -- ms; a promise can be taken back for a few minutes only
  season_id INTEGER NOT NULL,
  PRIMARY KEY (date, quest_id)
);
ALTER TABLE player ADD COLUMN promise_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player ADD COLUMN best_promise_streak INTEGER NOT NULL DEFAULT 0;

-- Phone reminders (Web Push): one row per device that turned them on.
CREATE TABLE push_devices (
  id         INTEGER PRIMARY KEY,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_ok    TEXT,
  fails      INTEGER NOT NULL DEFAULT 0
);
-- Each reminder goes out once (kind + what it was about, e.g. morning + date).
CREATE TABLE push_sent (
  kind    TEXT NOT NULL,
  ref     TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, ref)
);
